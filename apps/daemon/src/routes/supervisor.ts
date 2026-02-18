// Supervisor management routes
import { Router } from 'express';
import { supervisor } from '../supervisor';
import { audit } from '../audit';

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

// GET /supervisor/runs - List all runs
router.get('/runs', (req, res) => {
  const { projectId } = req.query;
  
  let runs = Array.from(supervisor['runs'].values()).map(r => ({
    id: r.id,
    projectId: r.projectId,
    type: r.type,
    ownerAgentId: r.ownerAgentId,
    status: r.status,
    pid: r.pid,
    timeoutMs: r.timeoutMs,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    exitCode: r.exitCode,
    logsPath: r.logsPath,
    summary: r.summary,
  }));

  if (projectId) {
    runs = runs.filter(r => r.projectId === projectId);
  }

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
  
  const runs = Array.from(supervisor['runs'].values());
  let cleaned = 0;

  for (const run of runs) {
    // Clean up completed/error/killed runs older than 24 hours
    if (run.endedAt && run.status !== 'running') {
      const endedTime = new Date(run.endedAt).getTime();
      const age = Date.now() - endedTime;
      
      if (age > 24 * 60 * 60 * 1000) { // 24 hours
        if (!projectId || run.projectId === projectId) {
          supervisor['runs'].delete(run.id);
          cleaned++;
        }
      }
    }
  }

  if (cleaned > 0) {
    supervisor['persistRuns']();
    audit.log(projectId || 'system', 'user', 'SUPERVISOR_CLEANUP', { cleanedRuns: cleaned }, clientId);
  }

  res.json({ success: true, cleanedRuns: cleaned });
});

export { router as supervisorRouter };
