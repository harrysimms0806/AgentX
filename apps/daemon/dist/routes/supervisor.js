"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supervisorRouter = void 0;
// Supervisor management routes
const express_1 = require("express");
const supervisor_1 = require("../supervisor");
const audit_1 = require("../audit");
const sandbox_1 = require("../sandbox");
const projects_1 = require("../store/projects");
const database_1 = require("../database");
const policy_engine_1 = require("../policy-engine");
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
    audit_1.audit.logLegacy(projectId, 'user', 'RUN_CREATE', { runId: run.id, type, timeoutMs }, clientId);
    res.status(201).json(run);
});
// POST /supervisor/runs/:id/spawn - Spawn a command in the run
router.post('/runs/:id/spawn', async (req, res) => {
    const { id } = req.params;
    const { cmd, args, env } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    if (!cmd || typeof cmd !== 'string') {
        res.status(400).json({ error: 'cmd required (string)' });
        return;
    }
    if (!Array.isArray(args)) {
        res.status(400).json({ error: 'args must be an array' });
        return;
    }
    const run = supervisor_1.supervisor.getRun(id);
    if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
    }
    const project = projects_1.projects.get(run.projectId);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (!project.settings.capabilities.EXEC_SHELL) {
        res.status(403).json({ error: 'EXEC_SHELL capability not enabled for this project' });
        return;
    }
    const policy = database_1.policyDb.getByProject(run.projectId) || policy_engine_1.defaultProjectPolicy;
    const commandString = [cmd, ...args].join(' ');
    const policyCheck = (0, policy_engine_1.checkCommandPolicy)(policy, commandString);
    if (!policyCheck.allowed) {
        res.status(403).json({
            error: `Policy blocked: ${policyCheck.reason}`,
            code: policyCheck.code,
            requestApproval: policyCheck.requestApproval,
        });
        return;
    }
    const pathResult = sandbox_1.sandbox.getProjectPath(run.projectId);
    if (!pathResult.allowed) {
        res.status(403).json({ error: pathResult.error || 'Invalid project path' });
        return;
    }
    audit_1.audit.logLegacy(run.projectId, 'user', 'RUN_SPAWN', { runId: id, cmd, args }, clientId);
    try {
        await supervisor_1.supervisor.spawnCommand(id, cmd, args, pathResult.path, env);
        res.json({ success: true, message: 'Command spawned', runId: id });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to spawn: ${err.message}` });
    }
});
// GET /supervisor/runs - List all runs (project-scoped)
router.get('/runs', (req, res) => {
    const projectId = req.query.projectId;
    if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    const runs = supervisor_1.supervisor.listRuns(projectId);
    res.json({ runs });
});
// GET /supervisor/runs/:id - Get specific run (project-scoped)
router.get('/runs/:id', (req, res) => {
    const { id } = req.params;
    const projectId = req.query.projectId;
    if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    const run = supervisor_1.supervisor.getRun(id);
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
    const projectId = req.query.projectId;
    const lines = parseInt(req.query.lines) || 50;
    if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    const run = supervisor_1.supervisor.getRun(id);
    if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
    }
    if (run.projectId !== projectId) {
        res.status(403).json({ error: 'Run does not belong to provided projectId' });
        return;
    }
    const output = supervisor_1.supervisor.getRunOutput(id, lines);
    res.json({ output });
});
// POST /supervisor/runs/:id/kill - Kill a run
router.post('/runs/:id/kill', async (req, res) => {
    const { id } = req.params;
    const { reason = 'user', projectId } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
    }
    const run = supervisor_1.supervisor.getRun(id);
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
    const success = await supervisor_1.supervisor.killRun(id, reason);
    if (success) {
        audit_1.audit.logLegacy(run.projectId, 'user', 'RUN_KILL', { runId: id, reason }, clientId);
        res.json({ success: true, message: 'Kill signal sent' });
    }
    else {
        res.status(500).json({ error: 'Failed to kill run' });
    }
});
// POST /supervisor/cleanup - Clean up stale/orphaned runs
router.post('/cleanup', (req, res) => {
    const { projectId, maxAgeHours } = req.body;
    const clientId = req.session?.clientId || 'unknown';
    const maxAgeMs = maxAgeHours ? maxAgeHours * 60 * 60 * 1000 : undefined;
    const cleaned = supervisor_1.supervisor.cleanupRuns(projectId, maxAgeMs);
    if (cleaned > 0) {
        audit_1.audit.logLegacy(projectId || 'system', 'user', 'SUPERVISOR_CLEANUP', { cleanedRuns: cleaned }, clientId);
    }
    res.json({ success: true, cleanedRuns: cleaned });
});
