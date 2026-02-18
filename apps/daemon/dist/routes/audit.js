"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
// Audit log endpoints
const express_1 = require("express");
const audit_1 = require("../audit");
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
// GET /audit/export?projectId= - Export full audit log
router.get('/export', (req, res) => {
    const { projectId } = req.query;
    const parsedProjectId = projectId;
    const exportData = audit_1.audit.export(parsedProjectId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
    res.send(exportData);
});
