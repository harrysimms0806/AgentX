import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  allowedAgents: string[];
  requiredApprovals: Array<'write_files' | 'run_commands' | 'git_commit'>;
  steps: string[];
};

export type WorkflowRun = {
  id: string;
  templateId: string;
  projectId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  checkpointBefore?: string;
  checkpointAfter?: string;
  steps: Array<{ id: string; label: string; status: 'pending' | 'running' | 'succeeded' | 'failed'; startedAt?: string; endedAt?: string }>;
};

const templates: WorkflowTemplate[] = [
  {
    id: 'fix-failing-tests',
    name: 'Fix failing tests',
    description: 'Run tests, identify failures, apply fixes, and re-run tests.',
    allowedAgents: ['agent-coder', 'agent-reviewer'],
    requiredApprovals: ['write_files'],
    steps: ['Plan approach', 'Run tests', 'Fix failing tests', 'Re-run tests', 'Summarize changes'],
  },
  {
    id: 'refactor-safely',
    name: 'Refactor safely',
    description: 'Perform incremental refactor with checks between steps.',
    allowedAgents: ['agent-coder', 'agent-architect'],
    requiredApprovals: ['write_files', 'run_commands'],
    steps: ['Plan refactor', 'Create checkpoint', 'Refactor target', 'Run validations', 'Summarize impact'],
  },
  {
    id: 'implement-feature-from-spec',
    name: 'Implement feature from spec',
    description: 'Translate a spec into code changes and verification.',
    allowedAgents: ['agent-coder', 'agent-architect', 'agent-reviewer'],
    requiredApprovals: ['write_files', 'run_commands'],
    steps: ['Parse specification', 'Create implementation plan', 'Implement feature', 'Run tests', 'Write summary'],
  },
];

const runs = new Map<string, WorkflowRun>();

function runGit(projectRoot: string, args: string[]): string {
  return execFileSync('git', args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function isGitRepo(projectRoot: string): boolean {
  try {
    return runGit(projectRoot, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

function createCheckpoint(projectRoot: string, workflowRunId: string, phase: 'before' | 'after'): string {
  if (isGitRepo(projectRoot)) {
    const tag = `agentx-${workflowRunId}-${phase}`;
    runGit(projectRoot, ['tag', '-f', tag]);
    return `git-tag:${tag}`;
  }

  const patchDir = path.join(projectRoot, '.agentx-checkpoints');
  fs.mkdirSync(patchDir, { recursive: true });
  const file = path.join(patchDir, `${workflowRunId}-${phase}.patch`);
  fs.writeFileSync(file, 'Non-git checkpoint placeholder\n');
  return `patch:${file}`;
}

class WorkflowManager {
  listTemplates(): WorkflowTemplate[] {
    return templates;
  }

  getRun(id: string): WorkflowRun | undefined {
    return runs.get(id);
  }

  listRuns(projectId: string): WorkflowRun[] {
    return Array.from(runs.values()).filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  startRun(templateId: string, projectId: string, projectRoot: string): WorkflowRun {
    const template = templates.find((item) => item.id === templateId);
    if (!template) throw new Error('Workflow template not found');

    const id = `workflow-${randomUUID()}`;
    const run: WorkflowRun = {
      id,
      templateId,
      projectId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      steps: template.steps.map((label, index) => ({ id: `${id}-step-${index + 1}`, label, status: 'pending' })),
    };

    run.checkpointBefore = createCheckpoint(projectRoot, id, 'before');
    runs.set(id, run);
    this.executeRun(run, projectRoot);
    return run;
  }

  private async executeRun(run: WorkflowRun, projectRoot: string) {
    run.status = 'running';
    run.startedAt = new Date().toISOString();

    for (const step of run.steps) {
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 450));
      step.status = 'succeeded';
      step.endedAt = new Date().toISOString();
    }

    run.checkpointAfter = createCheckpoint(projectRoot, run.id, 'after');
    run.status = 'succeeded';
    run.endedAt = new Date().toISOString();
  }
}

export const workflowManager = new WorkflowManager();
