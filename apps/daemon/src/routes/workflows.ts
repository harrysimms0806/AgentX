import { Router } from 'express';
import { workflowManager } from '../workflows';
import { projects } from '../store/projects';
import { randomUUID } from 'crypto';
import { audit } from '../audit';

const router = Router();

function actorIdFromReq(req: any): string {
  return req.session?.clientId || (req.headers['x-client-id'] as string) || 'unknown';
}

router.get('/templates', (_req, res) => {
  res.json({ templates: workflowManager.listTemplates() });
});

router.post('/runs', async (req, res) => {
  const { templateId, projectId } = req.body;
  if (!templateId || !projectId) {
    res.status(400).json({ error: 'templateId and projectId are required' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const run = workflowManager.startRun(templateId, projectId, project.rootPath);

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: actorIdFromReq(req),
      actionType: 'WORKFLOW_RUN_START',
      payload: { runId: run.id, templateId, checkpointBefore: run.checkpointBefore },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ run });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to start workflow run' });
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
