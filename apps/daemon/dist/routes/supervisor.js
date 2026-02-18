"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supervisorRouter = void 0;
// Supervisor management routes
const express_1 = require("express");
const supervisor_1 = require("../supervisor");
const audit_1 = require("../audit");
const sandbox_1 = require("../sandbox");
const router = (0, express_1.Router)();
exports.supervisorRouter = router;
// POST /supervisor/runs - Create a new run
router.post('/runs', (req, res) => {
    const { projectId, type, timeoutMs } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    if (!projectId || !type) {
        res.status(400).json({ error: 'projectId and type required' });
        return;
    }
    if (!['agent', 'command', 'git', 'index'].includes(type)) {
        res.status(400).json({ error: 'Invalid type' });
        return;
    }
    const run = supervisor_1.supervisor.createRun(projectId, type, clientId, timeoutMs);
    audit_1.audit.log(projectId, 'user', 'RUN_CREATE', { runId: run.id, type, timeoutMs }, clientId);
    res.status(201).json(run);
});
// POST /supervisor/runs/:id/start - Start command run (Phase 0 guarded execution)
router.post('/runs/:id/start', async (req, res) => {
    const { id } = req.params;
    const { cmd, args = [], projectId, cwd = '.' } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    if (!projectId || !cmd || !Array.isArray(args)) {
        res.status(400).json({ error: 'projectId, cmd, and args[] required' });
        return;
    }
    const run = supervisor_1.supervisor.getRun(id);
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
    const cwdCheck = sandbox_1.sandbox.validatePath(projectId, cwd);
    if (!cwdCheck.allowed) {
        res.status(403).json({ error: cwdCheck.error || 'Invalid cwd' });
        return;
    }
    const allowedCommands = new Set(['node', 'npm', 'bash', 'sh', 'python', 'python3']);
    if (!allowedCommands.has(cmd)) {
        res.status(403).json({ error: `Command not allowed in Phase 0: ${cmd}` });
        return;
    }
    await supervisor_1.supervisor.spawnCommand(id, cmd, args, cwdCheck.realPath);
    audit_1.audit.log(projectId, 'user', 'RUN_START', { runId: id, cmd, args, cwd }, clientId);
    res.json({ success: true, runId: id });
});
// GET /supervisor/runs - List all runs
router.get('/runs', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const runs = supervisor_1.supervisor.listRuns(projectId);
    res.json({ runs });
});
// GET /supervisor/runs/:id - Get specific run
router.get('/runs/:id', (req, res) => {
    const { id } = req.params;
    const run = supervisor_1.supervisor.getRun(id);
    if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
    }
    res.json(run);
});
// GET /supervisor/runs/:id/output - Get run output
router.get('/runs/:id/output', (req, res) => {
    const { id } = req.params;
    const lines = parseInt(req.query.lines) || 50;
    const output = supervisor_1.supervisor.getRunOutput(id, lines);
    res.json({ output });
});
// POST /supervisor/runs/:id/kill - Kill a run
router.post('/runs/:id/kill', async (req, res) => {
    const { id } = req.params;
    const { reason = 'user' } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    const run = supervisor_1.supervisor.getRun(id);
    if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
    }
    if (run.status !== 'running') {
        res.status(400).json({ error: 'Run is not running' });
        return;
    }
    const success = await supervisor_1.supervisor.killRun(id, reason);
    if (success) {
        audit_1.audit.log(run.projectId, 'user', 'RUN_KILL', { runId: id, reason }, clientId);
        res.json({ success: true, message: 'Kill signal sent' });
    }
    else {
        res.status(500).json({ error: 'Failed to kill run' });
    }
});
// POST /supervisor/cleanup - Clean up stale/orphaned runs
router.post('/cleanup', (req, res) => {
    const { projectId } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    const cleaned = supervisor_1.supervisor.cleanupRuns(projectId);
    if (cleaned > 0) {
        audit_1.audit.log(projectId || 'system', 'user', 'SUPERVISOR_CLEANUP', { cleanedRuns: cleaned }, clientId);
    }
    res.json({ success: true, cleanedRuns: cleaned });
});
