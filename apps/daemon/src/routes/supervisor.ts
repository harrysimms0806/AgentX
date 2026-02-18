// Supervisor management routes
import { Router } from 'express';
import { supervisor } from '../supervisor';
import { audit } from '../audit';
import { sandbox } from '../sandbox';
import { projects } from '../store/projects';

const router = Router();

// POST /supervisor/runs - Create a new run
router.post('/runs', (req, res) => {
  const { projectId, type, timeoutMs } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!projectId || !type) {
    res.status(400).json({ error: 'projectId and type required' });
    return;
  }

  if (!['agent', 'command', 'git', 'index'].includes(type)) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }

  const run = supervisor.createRun(projectId, type, clientId, timeoutMs);
  audit.logLegacy(projectId, 'user', 'RUN_CREATE', { runId: run.id, type, timeoutMs }, clientId);
  res.status(201).json(run);
});

// POST /supervisor/runs/:id/spawn - Spawn a command in the run
router.post('/runs/:id/spawn', async (req, res) => {
  const { id } = req.params;
  const { cmd, args, env } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!cmd || typeof cmd !== 'string') {
    res.status(400).json({ error: 'cmd required (string)' });
    return;
  }

  if (!Array.isArray(args)) {
    res.status(400).json({ error: 'args must be an array' });
    return;
  }

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const project = projects.get(run.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (!project.settings.capabilities.EXEC_SHELL) {
    res.status(403).json({ error: 'EXEC_SHELL capability not enabled for this project' });
    return;
  }

  const pathResult = sandbox.getProjectPath(run.projectId);
  if (!pathResult.allowed) {
    res.status(403).json({ error: pathResult.error || 'Invalid project path' });
    return;
  }

  audit.logLegacy(run.projectId, 'user', 'RUN_SPAWN', { runId: id, cmd, args }, clientId);

  try {
    await supervisor.spawnCommand(id, cmd, args, pathResult.path, env);
    res.json({ success: true, message: 'Command spawned', runId: id });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to spawn: ${err.message}` });
  }
});

// GET /supervisor/runs - List all runs (project-scoped)
router.get('/runs', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const runs = supervisor.listRuns(projectId);
  res.json({ runs });
});

// GET /supervisor/runs/:id - Get specific run (project-scoped)
router.get('/runs/:id', (req, res) => {
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

// GET /supervisor/runs/:id/output - Get run output (project-scoped)
router.get('/runs/:id/output', (req, res) => {
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

// POST /supervisor/runs/:id/kill - Kill a run
router.post('/runs/:id/kill', async (req, res) => {
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
  if (success) {
    audit.logLegacy(run.projectId, 'user', 'RUN_KILL', { runId: id, reason }, clientId);
    res.json({ success: true, message: 'Kill signal sent' });
  } else {
    res.status(500).json({ error: 'Failed to kill run' });
  }
});

// POST /supervisor/cleanup - Clean up stale/orphaned runs
router.post('/cleanup', (req, res) => {
  const { projectId, maxAgeHours } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  const maxAgeMs = maxAgeHours ? maxAgeHours * 60 * 60 * 1000 : undefined;
  const cleaned = supervisor.cleanupRuns(projectId, maxAgeMs);

  if (cleaned > 0) {
    audit.logLegacy(projectId || 'system', 'user', 'SUPERVISOR_CLEANUP', { cleanedRuns: cleaned }, clientId);
  }

  res.json({ success: true, cleanedRuns: cleaned });
});

export { router as supervisorRouter };
