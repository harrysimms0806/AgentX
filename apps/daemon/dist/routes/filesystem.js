"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fsRouter = void 0;
// Filesystem operations - ALL paths go through sandbox validation
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sandbox_1 = require("../sandbox");
const audit_1 = require("../audit");
const projects_1 = require("../store/projects");
const database_1 = require("../database");
const policy_engine_1 = require("../policy-engine");
const router = (0, express_1.Router)();
exports.fsRouter = router;
const TREE_IGNORES = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    'out',
    'coverage',
    'target',
    '.cache',
    '.turbo',
    '.idea',
    '.vscode',
]);
const MAX_TREE_NODES = 5000;
const MAX_FILE_READ_BYTES = 2 * 1024 * 1024; // 2MB
const READ_AUDIT_SAMPLE_RATE = Number(process.env.FILE_READ_AUDIT_SAMPLE_RATE ?? '0.1');
function actorIdFromReq(req) {
    return req.session?.clientId || req.headers['x-client-id'] || 'unknown';
}
// Helper to check write capabilities
function canWrite(projectId) {
    const project = projects_1.projects.get(projectId);
    if (!project) {
        return { allowed: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' };
    }
    if (project.settings.safeMode) {
        return { allowed: false, error: 'Write blocked: safe mode', code: 'SAFE_MODE_BLOCK' };
    }
    if (!project.settings.capabilities.FS_WRITE) {
        return { allowed: false, error: 'Write blocked: capability disabled', code: 'FS_WRITE_DISABLED' };
    }
    return { allowed: true };
}
function canonicalLockPath(projectId, filePath) {
    const check = sandbox_1.sandbox.validatePath(projectId, filePath);
    if (!check.allowed || !check.realPath) {
        return null;
    }
    const projectPath = sandbox_1.sandbox.getProjectPath(projectId);
    if (!projectPath.allowed) {
        return null;
    }
    const relative = path_1.default.relative(projectPath.path, check.realPath).replace(/\\/g, '/');
    if (relative.startsWith('..') || path_1.default.isAbsolute(relative)) {
        return null;
    }
    return relative || '.';
}
function requireLock(projectId, filePath, actorId) {
    database_1.lockDb.cleanupExpired(Number(process.env.LOCK_TTL_MS ?? `${10 * 60 * 1000}`));
    const normalizedPath = canonicalLockPath(projectId, filePath);
    if (!normalizedPath) {
        return { allowed: false, error: 'Path outside sandbox', code: 'PATH_OUTSIDE_SANDBOX' };
    }
    const lock = database_1.lockDb.get(projectId, normalizedPath);
    if (!lock) {
        return { allowed: false, error: 'Write blocked: no lock', code: 'LOCK_REQUIRED' };
    }
    if (lock.lockedBy !== actorId) {
        return { allowed: false, error: 'Write blocked: lock owned by another actor', code: 'LOCK_OWNED_BY_OTHER' };
    }
    return { allowed: true, normalizedPath };
}
function shouldIgnoreEntry(entryName) {
    if (TREE_IGNORES.has(entryName))
        return true;
    if (entryName.startsWith('.'))
        return true;
    return false;
}
function sortTreeNodes(nodes) {
    return nodes.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
}
// GET /fs/tree?projectId=&path=
router.get('/tree', (req, res) => {
    const { projectId, path: relativePath } = req.query;
    if (!projectId || typeof projectId !== 'string') {
        res.status(400).json({ error: 'projectId required' });
        return;
    }
    const requestedPath = typeof relativePath === 'string' ? relativePath : '.';
    const check = sandbox_1.sandbox.validatePath(projectId, requestedPath);
    if (!check.allowed) {
        res.status(403).json({ error: check.error });
        return;
    }
    try {
        const targetStats = fs_1.default.statSync(check.realPath);
        if (!targetStats.isDirectory()) {
            res.status(400).json({ error: 'Path is not a directory' });
            return;
        }
        const entries = fs_1.default.readdirSync(check.realPath, { withFileTypes: true });
        const nodes = [];
        for (const entry of entries) {
            if (shouldIgnoreEntry(entry.name))
                continue;
            const entryPath = path_1.default.posix.join(requestedPath === '.' ? '' : requestedPath, entry.name);
            const fullPath = path_1.default.join(check.realPath, entry.name);
            const stats = fs_1.default.lstatSync(fullPath);
            if (stats.isSymbolicLink()) {
                continue;
            }
            nodes.push({
                name: entry.name,
                path: entryPath,
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.isFile() ? stats.size : undefined,
                modifiedAt: stats.mtime.toISOString(),
            });
            if (nodes.length >= MAX_TREE_NODES) {
                break;
            }
        }
        res.json({
            path: requestedPath,
            truncated: nodes.length >= MAX_TREE_NODES,
            nodes: sortTreeNodes(nodes),
        });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to read directory: ${err}` });
    }
});
// GET /fs/read?projectId=&path=&startLine=&endLine= - Read file (optionally by line range)
router.get('/read', (req, res) => {
    const { projectId, path: filePath, startLine, endLine } = req.query;
    if (!projectId || !filePath || typeof projectId !== 'string' || typeof filePath !== 'string') {
        res.status(400).json({ error: 'projectId and path required' });
        return;
    }
    const check = sandbox_1.sandbox.validatePath(projectId, filePath);
    if (!check.allowed) {
        res.status(403).json({ error: check.error });
        return;
    }
    try {
        if (!fs_1.default.existsSync(check.realPath)) {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        const stats = fs_1.default.statSync(check.realPath);
        if (!stats.isFile()) {
            res.status(400).json({ error: 'Path is not a file' });
            return;
        }
        if (stats.size > MAX_FILE_READ_BYTES) {
            res.status(413).json({
                error: 'File too large to open safely',
                code: 'FILE_TOO_LARGE',
                size: stats.size,
                maxSize: MAX_FILE_READ_BYTES,
            });
            return;
        }
        const content = fs_1.default.readFileSync(check.realPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const parsedStart = typeof startLine === 'string' ? Number.parseInt(startLine, 10) : undefined;
        const parsedEnd = typeof endLine === 'string' ? Number.parseInt(endLine, 10) : undefined;
        if ((parsedStart !== undefined && (!Number.isFinite(parsedStart) || parsedStart < 1)) ||
            (parsedEnd !== undefined && (!Number.isFinite(parsedEnd) || parsedEnd < 1))) {
            res.status(400).json({ error: 'startLine/endLine must be positive integers' });
            return;
        }
        if (parsedStart !== undefined && parsedEnd !== undefined && parsedEnd < parsedStart) {
            res.status(400).json({ error: 'endLine must be greater than or equal to startLine' });
            return;
        }
        const safeStart = parsedStart ?? 1;
        const safeEnd = Math.min(lines.length, parsedEnd ?? lines.length);
        const contentToReturn = lines.slice(safeStart - 1, safeEnd).join('\n');
        if (Math.random() < READ_AUDIT_SAMPLE_RATE) {
            audit_1.audit.logLegacy(projectId, 'user', 'FILE_READ', {
                path: filePath,
                size: stats.size,
                startLine: safeStart,
                endLine: safeEnd,
            }, actorIdFromReq(req));
        }
        res.json({
            content: contentToReturn,
            size: stats.size,
            startLine: safeStart,
            endLine: safeEnd,
            totalLines: lines.length,
            truncated: safeStart !== 1 || safeEnd !== lines.length,
        });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to read file: ${err}` });
    }
});
// PUT /fs/write - Write file (requires capabilities + lock)
router.put('/write', (req, res) => {
    const { projectId, path: filePath, content } = req.body;
    if (!projectId || !filePath || typeof content !== 'string') {
        res.status(400).json({ error: 'projectId, path, and content required' });
        return;
    }
    const writeCheck = canWrite(projectId);
    if (!writeCheck.allowed) {
        res.status(403).json({ error: writeCheck.error || 'Write not allowed', code: writeCheck.code });
        return;
    }
    const policy = database_1.policyDb.getByProject(projectId) || policy_engine_1.defaultProjectPolicy;
    const policyCheck = (0, policy_engine_1.checkWritePathPolicy)(policy, filePath);
    if (!policyCheck.allowed) {
        res.status(403).json({ error: `Policy blocked: ${policyCheck.reason}`, code: policyCheck.code, requestApproval: policyCheck.requestApproval });
        return;
    }
    const actorId = actorIdFromReq(req);
    const lockCheck = requireLock(projectId, filePath, actorId);
    if (!lockCheck.allowed) {
        res.status(403).json({ error: lockCheck.error, code: lockCheck.code });
        return;
    }
    const check = sandbox_1.sandbox.validatePath(projectId, filePath);
    if (!check.allowed) {
        res.status(403).json({ error: check.error });
        return;
    }
    try {
        const parentDir = path_1.default.dirname(check.realPath);
        if (!fs_1.default.existsSync(parentDir)) {
            fs_1.default.mkdirSync(parentDir, { recursive: true });
        }
        fs_1.default.writeFileSync(check.realPath, content, 'utf8');
        audit_1.audit.logLegacy(projectId, 'user', 'FILE_WRITE', { path: filePath, size: content.length }, actorId);
        res.json({ success: true, path: filePath });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to write file: ${err}` });
    }
});
// POST /fs/delete - Soft delete file
router.post('/delete', (req, res) => {
    const { projectId, path: filePath } = req.body;
    if (!projectId || !filePath) {
        res.status(400).json({ error: 'projectId and path required' });
        return;
    }
    const writeCheck = canWrite(projectId);
    if (!writeCheck.allowed) {
        res.status(403).json({ error: writeCheck.error || 'Delete not allowed', code: writeCheck.code });
        return;
    }
    const deletePolicy = database_1.policyDb.getByProject(projectId) || policy_engine_1.defaultProjectPolicy;
    const deletePolicyCheck = (0, policy_engine_1.checkWritePathPolicy)(deletePolicy, filePath);
    if (!deletePolicyCheck.allowed) {
        res.status(403).json({ error: `Policy blocked: ${deletePolicyCheck.reason}`, code: deletePolicyCheck.code, requestApproval: deletePolicyCheck.requestApproval });
        return;
    }
    const actorId = actorIdFromReq(req);
    const lockCheck = requireLock(projectId, filePath, actorId);
    if (!lockCheck.allowed) {
        res.status(403).json({ error: lockCheck.error, code: lockCheck.code });
        return;
    }
    const result = sandbox_1.sandbox.softDelete(projectId, filePath);
    if (!result.allowed) {
        res.status(403).json({ error: result.error });
        return;
    }
    audit_1.audit.logLegacy(projectId, 'user', 'FILE_DELETE', { path: filePath, trashPath: result.realPath }, actorId);
    res.json({ success: true, trashPath: result.realPath });
});
// POST /fs/rename - Rename file
router.post('/rename', (req, res) => {
    const { projectId, oldPath, newPath } = req.body;
    if (!projectId || !oldPath || !newPath) {
        res.status(400).json({ error: 'projectId, oldPath, and newPath required' });
        return;
    }
    const writeCheck = canWrite(projectId);
    if (!writeCheck.allowed) {
        res.status(403).json({ error: writeCheck.error || 'Rename not allowed', code: writeCheck.code });
        return;
    }
    const actorId = actorIdFromReq(req);
    const sourceLockCheck = requireLock(projectId, oldPath, actorId);
    if (!sourceLockCheck.allowed) {
        res.status(403).json({ error: sourceLockCheck.error, code: sourceLockCheck.code });
        return;
    }
    const oldCheck = sandbox_1.sandbox.validatePath(projectId, oldPath);
    const newCheck = sandbox_1.sandbox.validatePath(projectId, newPath);
    if (!oldCheck.allowed) {
        res.status(403).json({ error: `Source: ${oldCheck.error}` });
        return;
    }
    if (!newCheck.allowed) {
        res.status(403).json({ error: `Destination: ${newCheck.error}` });
        return;
    }
    try {
        fs_1.default.renameSync(oldCheck.realPath, newCheck.realPath);
        // Move lock ownership to new path after rename
        database_1.lockDb.release(projectId, sourceLockCheck.normalizedPath, actorId);
        const normalizedNewPath = canonicalLockPath(projectId, newPath) || newPath;
        database_1.lockDb.acquire({
            projectId,
            filePath: normalizedNewPath,
            lockedBy: actorId,
            lockedAt: new Date().toISOString(),
        });
        audit_1.audit.logLegacy(projectId, 'user', 'FILE_RENAME', { oldPath, newPath }, actorId);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: `Failed to rename: ${err}` });
    }
});
