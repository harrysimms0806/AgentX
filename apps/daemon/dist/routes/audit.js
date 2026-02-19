"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
// Audit log endpoints
const express_1 = require("express");
const audit_1 = require("../audit");
const database_1 = require("../database");
const router = (0, express_1.Router)();
exports.auditRouter = router;
// GET /audit?projectId=&limit= - Get audit events
router.get('/', (req, res) => {
    const { projectId, limit } = req.query;
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    const parsedProjectId = projectId;
    const events = audit_1.audit.read(parsedProjectId, parsedLimit);
    res.json(events);
});
// GET /audit/metrics?projectId= - observability dashboard metrics
router.get('/metrics', (req, res) => {
    const projectId = req.query.projectId;
    const runs = projectId ? database_1.runDb.getByProject(projectId) : database_1.runDb.getAll();
    const events = audit_1.audit.read(projectId, 2000);
    const runsByDay = new Map();
    let durationTotalMs = 0;
    let durationCount = 0;
    for (const run of runs) {
        const started = run.startedAt ? new Date(run.startedAt) : null;
        if (started && !Number.isNaN(started.getTime())) {
            const day = started.toISOString().slice(0, 10);
            runsByDay.set(day, (runsByDay.get(day) || 0) + 1);
        }
        if (run.startedAt && run.endedAt) {
            const ms = new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
            if (Number.isFinite(ms) && ms >= 0) {
                durationTotalMs += ms;
                durationCount += 1;
            }
        }
    }
    const toolCallCounts = {};
    for (const event of events) {
        const key = event.actionType;
        toolCallCounts[key] = (toolCallCounts[key] || 0) + 1;
    }
    const failureReasons = runs
        .filter((run) => run.status === 'failed' || run.status === 'killed')
        .slice(0, 20)
        .map((run) => ({ runId: run.id, reason: run.summary || `exitCode:${run.exitCode ?? 'unknown'}` }));
    const expensiveRuns = runs
        .filter((run) => run.startedAt && run.endedAt)
        .map((run) => ({
        runId: run.id,
        projectId: run.projectId,
        status: run.status,
        durationMs: new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime(),
    }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10);
    res.json({
        runsPerDay: Array.from(runsByDay.entries()).map(([day, count]) => ({ day, count })),
        avgRunDurationMs: durationCount > 0 ? Math.round(durationTotalMs / durationCount) : 0,
        toolCallCounts,
        failureReasons,
        expensiveRuns,
        generatedAt: new Date().toISOString(),
    });
});
// GET /audit/export?projectId= - Export full audit log
router.get('/export', (req, res) => {
    const { projectId } = req.query;
    const parsedProjectId = projectId;
    const exportData = audit_1.audit.export(parsedProjectId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
    res.send(exportData);
});
