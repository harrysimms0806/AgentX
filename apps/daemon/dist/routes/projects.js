"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectsRouter = void 0;
// Projects management
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sandbox_1 = require("../sandbox");
const audit_1 = require("../audit");
const projects_1 = require("../store/projects");
const database_1 = require("../database");
const policy_engine_1 = require("../policy-engine");
const router = (0, express_1.Router)();
exports.projectsRouter = router;
// Default project settings
const defaultSettings = {
    capabilities: {
        FS_READ: true,
        FS_WRITE: false, // Safe mode default
        EXEC_SHELL: false,
        NETWORK: false,
        GIT_WRITE: false,
        OPENCLAW_RUN: false,
    },
    safeMode: true,
    preferredAgents: [],
};
// GET /projects - List all projects
router.get('/', (req, res) => {
    const projectList = Array.from(projects_1.projects.values());
    res.json(projectList);
});
// POST /projects - Create new project
router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Project name required' });
        return;
    }
    // Create safe project ID from name
    const id = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (projects_1.projects.has(id)) {
        res.status(409).json({ error: 'Project already exists' });
        return;
    }
    // Create sandbox directory
    const createResult = sandbox_1.sandbox.createProject(id);
    if (!createResult.success) {
        // Return 400 for validation errors, 403 for sandbox violations
        const statusCode = createResult.error?.includes('Invalid') ? 400 : 403;
        res.status(statusCode).json({ error: createResult.error || 'Failed to create project directory' });
        return;
    }
    // Get project path
    const pathResult = sandbox_1.sandbox.getProjectPath(id);
    if (!pathResult.allowed) {
        const statusCode = pathResult.error?.includes('Invalid') ? 400 : 403;
        res.status(statusCode).json({ error: pathResult.error || 'Failed to get project path' });
        return;
    }
    // Create project structure
    const projectPath = pathResult.path;
    fs_1.default.mkdirSync(path_1.default.join(projectPath, 'app'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(projectPath, 'docs'), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.join(projectPath, 'memory'), { recursive: true });
    // Create PROJECT.md template
    fs_1.default.writeFileSync(path_1.default.join(projectPath, 'PROJECT.md'), `# ${name}\n\nCreated: ${new Date().toISOString()}\n\n## Description\n\n## Goals\n\n## Notes\n`);
    // Create RULES.md
    fs_1.default.writeFileSync(path_1.default.join(projectPath, 'RULES.md'), `# ${name} Rules\n\nSafe Mode: ON\nCapabilities: READ ONLY\n`);
    const project = {
        id,
        name,
        rootPath: projectPath,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        settings: defaultSettings,
    };
    projects_1.projects.set(id, project);
    database_1.policyDb.upsert(id, policy_engine_1.defaultProjectPolicy);
    // Audit log
    audit_1.audit.logLegacy(id, 'system', 'PROJECT_CREATE', { name }, 'daemon');
    res.status(201).json(project);
});
// POST /projects/:id/open - Open/switch to project
router.post('/:id/open', (req, res) => {
    const { id } = req.params;
    const project = projects_1.projects.get(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    project.lastOpenedAt = new Date().toISOString();
    audit_1.audit.logLegacy(id, 'user', 'PROJECT_OPEN', {}, req.session?.clientId);
    res.json(project);
});
// GET /projects/:id/settings - Get project settings
router.get('/:id/settings', (req, res) => {
    const { id } = req.params;
    const project = projects_1.projects.get(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    res.json(project.settings);
});
// PUT /projects/:id/settings - Update project settings
router.put('/:id/settings', (req, res) => {
    const { id } = req.params;
    const project = projects_1.projects.get(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const { capabilities, safeMode, preferredAgents } = req.body;
    // Validate capability changes
    if (capabilities) {
        // Log capability changes for audit
        const oldCaps = project.settings.capabilities;
        const newCaps = { ...oldCaps, ...capabilities };
        audit_1.audit.logLegacy(id, 'user', 'SETTINGS_CHANGE', {
            oldCapabilities: oldCaps,
            newCapabilities: newCaps,
        }, req.session?.clientId);
        project.settings.capabilities = newCaps;
    }
    if (typeof safeMode === 'boolean') {
        audit_1.audit.logLegacy(id, 'user', 'SAFE_MODE_CHANGE', {
            old: project.settings.safeMode,
            new: safeMode,
        }, req.session?.clientId);
        project.settings.safeMode = safeMode;
    }
    if (preferredAgents) {
        project.settings.preferredAgents = preferredAgents;
    }
    res.json(project.settings);
});
// GET /projects/:id/policy - Get project policy
router.get('/:id/policy', (req, res) => {
    const { id } = req.params;
    const project = projects_1.projects.get(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const policy = database_1.policyDb.getByProject(id) || policy_engine_1.defaultProjectPolicy;
    res.json(policy);
});
// PUT /projects/:id/policy - Update project policy
router.put('/:id/policy', (req, res) => {
    const { id } = req.params;
    const project = projects_1.projects.get(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const current = database_1.policyDb.getByProject(id) || policy_engine_1.defaultProjectPolicy;
    const next = {
        ...current,
        ...req.body,
    };
    if (!Array.isArray(next.allowedWriteGlobs) || !Array.isArray(next.blockedCommandPatterns) || !Array.isArray(next.approvalRequiredFor)) {
        res.status(400).json({ error: 'Invalid policy payload' });
        return;
    }
    if (typeof next.maxFilesChangedPerRun !== 'number' || next.maxFilesChangedPerRun < 1 || next.maxFilesChangedPerRun > 1000) {
        res.status(400).json({ error: 'maxFilesChangedPerRun must be a number between 1 and 1000' });
        return;
    }
    database_1.policyDb.upsert(id, next);
    audit_1.audit.logLegacy(id, 'user', 'POLICY_UPDATE', {
        allowedWriteGlobs: next.allowedWriteGlobs.length,
        blockedCommandPatterns: next.blockedCommandPatterns.length,
        approvalRequiredFor: next.approvalRequiredFor,
        maxFilesChangedPerRun: next.maxFilesChangedPerRun,
    }, req.session?.clientId);
    res.json(next);
});
