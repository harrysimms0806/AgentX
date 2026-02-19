import { Router } from 'express';
import { workflowManager } from '../workflows';
import { projects } from '../store/projects';
import { randomUUID } from 'crypto';
import { audit } from '../audit';

const router = Router();

function actorIdFromReq(req: any): string {
  return req.session?.clientId || (req.headers['x-client-id'] as string) || 'unknown';
}

router.get('/templates', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  res.json({ templates: workflowManager.listWorkflows(projectId) });
});

router.post('/templates', async (req, res) => {
  const { projectId, name, steps } = req.body;
  if (!projectId || !name || !Array.isArray(steps)) {
    res.status(400).json({ error: 'projectId, name, and steps are required' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const workflow = workflowManager.createWorkflow({ projectId, name, steps });
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: actorIdFromReq(req),
      actionType: 'WORKFLOW_CREATE',
      payload: { workflowId: workflow.id, stepCount: workflow.steps.length },
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ workflow });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to create workflow' });
  }
});

router.post('/runs', async (req, res) => {
  const { workflowId, projectId, input } = req.body;
  if (!workflowId || !projectId) {
    res.status(400).json({ error: 'workflowId and projectId are required' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const run = workflowManager.startRun(workflowId, projectId, input || {});

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: actorIdFromReq(req),
      actionType: 'WORKFLOW_RUN_START',
      payload: { runId: run.id, workflowId },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ run });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to start workflow run' });
  }
});

router.post('/runs/:id/approve', async (req, res) => {
  const runId = req.params.id;
  const { runStepId } = req.body;
  if (!runStepId) {
    res.status(400).json({ error: 'runStepId is required' });
    return;
  }

  try {
    const run = workflowManager.approveStep(runId, runStepId);
    await audit.log({
      id: randomUUID(),
      projectId: run.projectId,
      actorType: 'user',
      actorId: actorIdFromReq(req),
      actionType: 'WORKFLOW_STEP_APPROVED',
      payload: { runId, runStepId },
      createdAt: new Date().toISOString(),
    });

    res.json({ run });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to approve step' });
  }
});

router.get('/runs', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  res.json({ runs: workflowManager.listRuns(projectId) });
});

router.get('/runs/:id', (req, res) => {
  const { id } = req.params;
  const run = workflowManager.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Workflow run not found' });
    return;
  }

  res.json({ run });
});

export { router as workflowsRouter };
