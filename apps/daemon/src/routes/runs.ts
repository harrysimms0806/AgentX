import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supervisor } from '../supervisor';
import { projects } from '../store/projects';
import { agentManager } from '../agents';
import { audit } from '../audit';

const router = Router();

function requireProjectAccess(projectId: string, res: any) {
  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  return project;
}

router.post('/agent', async (req, res) => {
  const { projectId, definitionId, prompt, contextPackId } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!projectId || !definitionId || !prompt) {
    res.status(400).json({ error: 'projectId, definitionId and prompt are required' });
    return;
  }

  const project = requireProjectAccess(projectId, res);
  if (!project) return;

  if (!project.settings.capabilities.OPENCLAW_RUN) {
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: clientId,
      actionType: 'CAPABILITY_DENIED',
      payload: { capability: 'OPENCLAW_RUN', reason: 'disabled' },
      createdAt: new Date().toISOString(),
    });
    res.status(403).json({ error: 'OpenClaw runs are disabled for this project (OPENCLAW_RUN off)' });
    return;
  }

  if (project.settings.safeMode) {
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: clientId,
      actionType: 'CAPABILITY_DENIED',
      payload: { capability: 'OPENCLAW_RUN', reason: 'safe_mode' },
      createdAt: new Date().toISOString(),
    });
    res.status(403).json({ error: 'OpenClaw run blocked: safe mode is enabled for this project' });
    return;
  }

  try {
    const { instance, runId } = await agentManager.spawn(definitionId, projectId, prompt, contextPackId);

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: clientId,
      actionType: 'RUN_AGENT_CREATE',
      payload: { runId, agentId: definitionId, instanceId: instance.id },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ runId, instanceId: instance.id, status: 'queued' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start agent run', message: err?.message });
  }
});

router.get('/', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const project = requireProjectAccess(projectId, res);
  if (!project) return;

  const runs = supervisor.listRuns(projectId);
  res.json({ runs });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const projectId = req.query.projectId as string | undefined;

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (run.projectId !== projectId) {
    res.status(403).json({ error: 'Run does not belong to provided projectId' });
    return;
  }

  res.json(run);
});

router.get('/:id/output', (req, res) => {
  const { id } = req.params;
  const projectId = req.query.projectId as string | undefined;
  const lines = parseInt(req.query.lines as string) || 50;

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (run.projectId !== projectId) {
    res.status(403).json({ error: 'Run does not belong to provided projectId' });
    return;
  }

  const output = supervisor.getRunOutput(id, lines);
  res.json({ output });
});

router.post('/:id/kill', async (req, res) => {
  const { id } = req.params;
  const { reason = 'user', projectId } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (run.projectId !== projectId) {
    res.status(403).json({ error: 'Run does not belong to provided projectId' });
    return;
  }

  if (run.status !== 'running' && run.status !== 'queued') {
    res.status(400).json({ error: 'Run is not active' });
    return;
  }

  const success = await supervisor.killRun(id, reason);
  if (!success) {
    res.status(500).json({ error: 'Failed to kill run' });
    return;
  }

  await audit.log({
    id: randomUUID(),
    projectId,
    actorType: 'user',
    actorId: clientId,
    actionType: 'RUN_AGENT_KILL',
    payload: { runId: id, reason },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true });
});

router.get('/:id/stream', (req, res) => {
  const { id } = req.params;
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (run.projectId !== projectId) {
    res.status(403).json({ error: 'Run does not belong to provided projectId' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onOutput = (event: any) => {
    if (event.runId !== id || event.projectId !== projectId) return;
    res.write(`event: output\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const onStatus = (event: any) => {
    if (event.id !== id || event.projectId !== projectId) return;
    res.write(`event: status\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  supervisor.on('run:output', onOutput);
  supervisor.on('run:status', onStatus);

  res.write(`event: status\n`);
  res.write(`data: ${JSON.stringify(run)}\n\n`);

  req.on('close', () => {
    supervisor.off('run:output', onOutput);
    supervisor.off('run:status', onStatus);
    res.end();
  });
});

export { router as runsRouter };
