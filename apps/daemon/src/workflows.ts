import { randomUUID } from 'crypto';
import { workflowDb } from './database';
import { wsServer } from './websocket';

export type WorkflowStepType = 'spawn-agent' | 'spawn-bud' | 'handoff' | 'condition' | 'wait';

export type WorkflowDefinitionStep = {
  id: string;
  label: string;
  type: WorkflowStepType;
  requiresApproval?: boolean;
  config?: Record<string, unknown>;
};

export type WorkflowDefinition = {
  id: string;
  projectId: string;
  name: string;
  steps: WorkflowDefinitionStep[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunStep = {
  id: string;
  workflowStepId?: string;
  order: number;
  status: 'pending' | 'running' | 'paused' | 'succeeded' | 'failed';
  requiresApproval: boolean;
  approvedAt?: string;
  outputJson?: string;
  startedAt?: string;
  endedAt?: string;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  projectId: string;
  status: 'queued' | 'running' | 'paused' | 'succeeded' | 'failed';
  input?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  steps: WorkflowRunStep[];
};

class WorkflowManager {
  private activeRunIds = new Set<string>();

  listWorkflows(projectId: string): WorkflowDefinition[] {
    this.ensureDefaultWorkflows(projectId);
    return workflowDb.listWorkflows(projectId).map(this.mapWorkflowRow);
  }

  createWorkflow(input: { projectId: string; name: string; steps: Array<Omit<WorkflowDefinitionStep, 'id'>> }): WorkflowDefinition {
    const now = new Date().toISOString();
    const workflowId = `workflow-${randomUUID()}`;
    const steps = input.steps.map((step, index) => ({
      id: `workflow-step-${randomUUID()}`,
      order: index,
      stepJson: JSON.stringify({
        id: `wstep-${index + 1}`,
        label: step.label,
        type: step.type,
        requiresApproval: Boolean(step.requiresApproval),
        config: step.config || {},
      }),
    }));

    workflowDb.createWorkflow({
      id: workflowId,
      projectId: input.projectId,
      name: input.name,
      definitionJson: JSON.stringify({ version: 1 }),
      createdAt: now,
      updatedAt: now,
      steps,
    });

    return this.getWorkflow(workflowId)!;
  }

  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    const row = workflowDb.getWorkflow(workflowId);
    if (!row) return undefined;
    return this.mapWorkflowRow(row);
  }

  startRun(workflowId: string, projectId: string, input: Record<string, unknown> = {}): WorkflowRun {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.projectId !== projectId) throw new Error('Workflow/project mismatch');

    const now = new Date().toISOString();
    const runId = `workflow-run-${randomUUID()}`;
    const runSteps = workflow.steps.map((step, index) => ({
      id: `workflow-run-step-${randomUUID()}`,
      workflowStepId: step.id,
      order: index,
      status: 'pending' as const,
      requiresApproval: Boolean(step.requiresApproval),
      outputJson: undefined,
      approvedAt: undefined,
      startedAt: undefined,
      endedAt: undefined,
    }));

    workflowDb.createRun({
      id: runId,
      workflowId,
      projectId,
      status: 'queued',
      inputJson: JSON.stringify(input || {}),
      createdAt: now,
      steps: runSteps,
    });

    const run = this.getRun(runId)!;
    this.executeRun(run.id).catch(() => undefined);
    return run;
  }

  listRuns(projectId: string): WorkflowRun[] {
    return workflowDb.listRuns(projectId).map(this.mapRunRow);
  }

  getRun(runId: string): WorkflowRun | undefined {
    const row = workflowDb.getRun(runId);
    return row ? this.mapRunRow(row) : undefined;
  }

  approveStep(runId: string, runStepId: string): WorkflowRun {
    const run = this.getRun(runId);
    if (!run) throw new Error('Run not found');

    const step = run.steps.find((item) => item.id === runStepId);
    if (!step) throw new Error('Run step not found');
    if (!step.requiresApproval) throw new Error('Step does not require approval');

    const now = new Date().toISOString();
    workflowDb.updateRunStep(runStepId, {
      approvedAt: now,
      status: 'pending',
      outputJson: JSON.stringify({ approved: true }),
    });

    const refreshed = this.getRun(runId)!;
    if (refreshed.status === 'paused') {
      workflowDb.updateRunStatus(runId, 'running');
      this.executeRun(runId).catch(() => undefined);
    }

    return this.getRun(runId)!;
  }


  private ensureDefaultWorkflows(projectId: string): void {
    const existing = workflowDb.listWorkflows(projectId);
    if (existing.length > 0) return;

    const defaults: Array<{ name: string; steps: Array<Omit<WorkflowDefinitionStep, 'id'>> }> = [
      {
        name: 'Quick Bud handoff',
        steps: [
          { label: 'Spawn Bud', type: 'spawn-bud' },
          { label: 'Review output', type: 'condition', config: { key: 'allowReview', equals: true }, requiresApproval: true },
          { label: 'Wait for stabilization', type: 'wait', config: { ms: 500 } },
        ],
      },
      {
        name: 'Agent pipeline',
        steps: [
          { label: 'Spawn agent', type: 'spawn-agent' },
          { label: 'Handoff review', type: 'handoff', requiresApproval: true },
          { label: 'Final wait', type: 'wait', config: { ms: 300 } },
        ],
      },
    ];

    for (const workflow of defaults) {
      this.createWorkflow({
        projectId,
        name: workflow.name,
        steps: workflow.steps,
      });
    }
  }

  private async executeRun(runId: string): Promise<void> {
    if (this.activeRunIds.has(runId)) return;
    this.activeRunIds.add(runId);

    try {
      let run = this.getRun(runId);
      if (!run) return;

      if (run.status === 'queued') {
        const now = new Date().toISOString();
        workflowDb.updateRunStatus(run.id, 'running', now);
        this.publishEvent(run.id, { kind: 'run_started' });
      }

      run = this.getRun(runId);
      if (!run) return;

      for (const step of run.steps) {
        if (step.status === 'succeeded') continue;
        if (step.status === 'failed') {
          workflowDb.updateRunStatus(run.id, 'failed', undefined, new Date().toISOString());
          this.publishEvent(run.id, { kind: 'run_failed', stepId: step.id });
          return;
        }

        if (step.requiresApproval && !step.approvedAt) {
          workflowDb.updateRunStep(step.id, { status: 'paused' });
          workflowDb.updateRunStatus(run.id, 'paused');
          this.publishEvent(run.id, { kind: 'approval_required', stepId: step.id });
          return;
        }

        const startedAt = new Date().toISOString();
        workflowDb.updateRunStep(step.id, { status: 'running', startedAt });
        this.publishEvent(run.id, { kind: 'step_running', stepId: step.id });

        const latestRun = this.getRun(run.id)!;
        const workflow = this.getWorkflow(latestRun.workflowId)!;
        const definitionStep = workflow.steps.find((item) => item.id === step.workflowStepId);

        const execution = await this.executeStep(definitionStep, latestRun, step);
        const endedAt = new Date().toISOString();

        workflowDb.updateRunStep(step.id, {
          status: execution.success ? 'succeeded' : 'failed',
          outputJson: JSON.stringify(execution.output || {}),
          endedAt,
        });

        this.publishEvent(run.id, {
          kind: execution.success ? 'step_succeeded' : 'step_failed',
          stepId: step.id,
          output: execution.output || {},
        });

        if (!execution.success) {
          workflowDb.updateRunStatus(run.id, 'failed', undefined, endedAt);
          this.publishEvent(run.id, { kind: 'run_failed', stepId: step.id });
          return;
        }
      }

      workflowDb.updateRunStatus(run.id, 'succeeded', undefined, new Date().toISOString());
      this.publishEvent(run.id, { kind: 'run_succeeded' });
    } finally {
      this.activeRunIds.delete(runId);
    }
  }

  private async executeStep(
    definitionStep: WorkflowDefinitionStep | undefined,
    run: WorkflowRun,
    step: WorkflowRunStep
  ): Promise<{ success: boolean; output?: Record<string, unknown> }> {
    const type = definitionStep?.type;

    switch (type) {
      case 'wait': {
        const ms = Number(definitionStep?.config?.ms ?? 250);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(ms, 10000))));
        return { success: true, output: { waitedMs: ms } };
      }
      case 'condition': {
        const key = String(definitionStep?.config?.key || '');
        const equals = definitionStep?.config?.equals;
        const actual = key ? run.input?.[key] : undefined;
        return { success: actual === equals, output: { key, expected: equals, actual } };
      }
      case 'spawn-agent':
      case 'spawn-bud':
      case 'handoff':
      default:
        // Foundation behavior for Phase 7.1 core
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { success: true, output: { type: type || 'noop', stepId: step.id } };
    }
  }

  private publishEvent(runId: string, event: Record<string, unknown>): void {
    wsServer.publishWorkflowEvent(runId, {
      runId,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  private mapWorkflowRow(row: any): WorkflowDefinition {
    const steps = (row.steps || []).map((stepRow: any, index: number) => {
      const parsed = JSON.parse(stepRow.stepJson || '{}');
      return {
        id: stepRow.id,
        label: String(parsed.label || `Step ${index + 1}`),
        type: (parsed.type || 'wait') as WorkflowStepType,
        requiresApproval: Boolean(parsed.requiresApproval),
        config: parsed.config || {},
      } satisfies WorkflowDefinitionStep;
    });

    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      steps,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapRunRow(row: any): WorkflowRun {
    return {
      id: row.id,
      workflowId: row.workflowId,
      projectId: row.projectId,
      status: row.status,
      input: row.inputJson ? JSON.parse(row.inputJson) : {},
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      steps: row.steps,
    };
  }
}

export const workflowManager = new WorkflowManager();
