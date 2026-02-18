// Supervisor management routes
import { Router } from 'express';
import { supervisor } from '../supervisor';
import { audit } from '../audit';
import { sandbox } from '../sandbox';

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

  audit.log(projectId, 'user', 'RUN_CREATE', { runId: run.id, type, timeoutMs }, clientId);

  res.status(201).json(run);
});

// POST /supervisor/runs/:id/start - Start command run (Phase 0 guarded execution)
router.post('/runs/:id/start', async (req, res) => {
  const { id } = req.params;
  const { cmd, args = [], projectId, cwd = '.' } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!projectId || !cmd || !Array.isArray(args)) {
    res.status(400).json({ error: 'projectId, cmd, and args[] required' });
    return;
  }

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (run.projectId !== projectId) {
    res.status(400).json({ error: 'Run projectId mismatch' });
    return;
  }

  if (run.status !== 'pending') {
    res.status(400).json({ error: 'Run is not pending' });
    return;
  }

  const cwdCheck = sandbox.validatePath(projectId, cwd);
  if (!cwdCheck.allowed) {
    res.status(403).json({ error: cwdCheck.error || 'Invalid cwd' });
    return;
  }

  const allowedCommands = new Set(['node', 'npm', 'bash', 'sh', 'python', 'python3']);
  if (!allowedCommands.has(cmd)) {
    res.status(403).json({ error: `Command not allowed in Phase 0: ${cmd}` });
    return;
  }

  await supervisor.spawnCommand(id, cmd, args, cwdCheck.realPath!);

  audit.log(projectId, 'user', 'RUN_START', { runId: id, cmd, args, cwd }, clientId);

  res.json({ success: true, runId: id });
});

// GET /supervisor/runs - List all runs
router.get('/runs', (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const runs = supervisor.listRuns(projectId);
  res.json({ runs });
});

// GET /supervisor/runs/:id - Get specific run
router.get('/runs/:id', (req, res) => {
  const { id } = req.params;
  const run = supervisor.getRun(id);

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  res.json(run);
});

// GET /supervisor/runs/:id/output - Get run output
router.get('/runs/:id/output', (req, res) => {
  const { id } = req.params;
  const lines = parseInt(req.query.lines as string) || 50;

  const output = supervisor.getRunOutput(id, lines);
  res.json({ output });
});

// POST /supervisor/runs/:id/kill - Kill a run
router.post('/runs/:id/kill', async (req, res) => {
  const { id } = req.params;
  const { reason = 'user' } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  const run = supervisor.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (run.status !== 'running') {
    res.status(400).json({ error: 'Run is not running' });
    return;
  }

  const success = await supervisor.killRun(id, reason);

  if (success) {
    audit.log(run.projectId, 'user', 'RUN_KILL', { runId: id, reason }, clientId);
    res.json({ success: true, message: 'Kill signal sent' });
  } else {
    res.status(500).json({ error: 'Failed to kill run' });
  }
});

// POST /supervisor/cleanup - Clean up stale/orphaned runs
router.post('/cleanup', (req, res) => {
  const { projectId } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  const cleaned = supervisor.cleanupRuns(projectId);

  if (cleaned > 0) {
    audit.log(projectId || 'system', 'user', 'SUPERVISOR_CLEANUP', { cleanedRuns: cleaned }, clientId);
  }

  res.json({ success: true, cleanedRuns: cleaned });
});

export { router as supervisorRouter };
