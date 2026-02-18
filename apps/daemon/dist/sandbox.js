"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandbox = void 0;
// Sandbox filesystem enforcement
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Sandbox {
    root = '';
    realRoot = '';
    denyList = [
        '.ssh',
        '.gnupg',
        '.aws',
        '.docker',
        '.kube',
        '.npmrc',
        '.pypirc',
        'id_rsa',
        'id_ed25519',
        '.env', // .env outside project context
    ];
    async initialize() {
        // Get config at initialization time (after port discovery)
        const { config } = await Promise.resolve().then(() => __importStar(require('./config')));
        this.root = config.sandboxRoot;
        this.realRoot = fs_1.default.realpathSync(this.root);
        // Ensure sandbox root exists
        if (!fs_1.default.existsSync(this.root)) {
            fs_1.default.mkdirSync(this.root, { recursive: true });
            console.log(`📁 Created sandbox root: ${this.root}`);
        }
        // Ensure trash directory exists
        const trashDir = path_1.default.join(this.root, '.agentx-trash');
        if (!fs_1.default.existsSync(trashDir)) {
            fs_1.default.mkdirSync(trashDir, { recursive: true });
        }
    }
    /**
     * Validate project ID format to prevent traversal attacks
     * Only allows lowercase letters, numbers, and hyphens
     */
    validateProjectId(projectId) {
        // Reject any path traversal attempts
        if (projectId.includes('..') || projectId.includes('/') || projectId.includes('\\')) {
            return { valid: false, error: 'Invalid project ID format: path traversal detected' };
        }
        // Enforce safe project ID format: lowercase letters, numbers, hyphens only
        const safeProjectIdPattern = /^[a-z0-9-]+$/;
        if (!safeProjectIdPattern.test(projectId)) {
            return { valid: false, error: 'Invalid project ID format: only lowercase letters, numbers, and hyphens allowed' };
        }
        return { valid: true };
    }
    /**
     * Boundary-safe check: ensure path is within sandbox root
     * Uses path.relative to detect escape attempts
     */
    isWithinSandbox(realPath) {
        // Get relative path from sandbox root
        const relative = path_1.default.relative(this.realRoot, realPath);
        // Path is outside sandbox if:
        // 1. relative starts with '..' (going above root)
        // 2. relative is absolute (different drive on Windows, or somehow absolute)
        if (relative.startsWith('..') || path_1.default.isAbsolute(relative)) {
            return false;
        }
        return true;
    }
    /**
     * Validate and resolve a path within the sandbox
     * @param projectId - The project context (validated for safe format)
     * @param relativePath - Path relative to project root
     * @returns SandboxCheck with result
     */
    validatePath(projectId, relativePath) {
        // Validate project ID format first
        const projectIdCheck = this.validateProjectId(projectId);
        if (!projectIdCheck.valid) {
            return {
                allowed: false,
                error: projectIdCheck.error,
            };
        }
        // Prevent path traversal in relativePath
        if (relativePath.includes('..')) {
            return {
                allowed: false,
                error: 'Path traversal not allowed',
            };
        }
        // Canonicalize project root with safe project ID
        const projectRoot = path_1.default.join(this.realRoot, projectId);
        let realProjectRoot;
        try {
            // Create project directory if it doesn't exist
            if (!fs_1.default.existsSync(projectRoot)) {
                fs_1.default.mkdirSync(projectRoot, { recursive: true });
            }
            realProjectRoot = fs_1.default.realpathSync(projectRoot);
        }
        catch (err) {
            return {
                allowed: false,
                error: `Failed to resolve project root: ${err}`,
            };
        }
        // Resolve target path within canonicalized project root
        const targetPath = path_1.default.join(realProjectRoot, relativePath);
        // Use realpath to resolve symlinks and get canonical path
        let realPath;
        try {
            // If path doesn't exist, resolve the parent
            if (!fs_1.default.existsSync(targetPath)) {
                const parent = path_1.default.dirname(targetPath);
                if (!fs_1.default.existsSync(parent)) {
                    return {
                        allowed: false,
                        error: 'Parent directory does not exist',
                    };
                }
                const realParent = fs_1.default.realpathSync(parent);
                realPath = path_1.default.join(realParent, path_1.default.basename(targetPath));
            }
            else {
                realPath = fs_1.default.realpathSync(targetPath);
            }
        }
        catch (err) {
            return {
                allowed: false,
                error: `Failed to resolve path: ${err}`,
            };
        }
        // Ensure real path is within sandbox using boundary-safe check
        if (!this.isWithinSandbox(realPath)) {
            return {
                allowed: false,
                realPath,
                error: 'Access denied: outside sandbox',
            };
        }
        // Ensure real path is within the specific project (prevent cross-project access)
        const relativeToProject = path_1.default.relative(realProjectRoot, realPath);
        if (relativeToProject.startsWith('..') || path_1.default.isAbsolute(relativeToProject)) {
            return {
                allowed: false,
                realPath,
                error: 'Access denied: outside project boundary',
            };
        }
        // Check denylist
        const basename = path_1.default.basename(realPath);
        if (this.denyList.includes(basename)) {
            return {
                allowed: false,
                realPath,
                error: `Access denied: '${basename}' is blocked`,
            };
        }
        return {
            allowed: true,
            realPath,
        };
    }
    /**
     * Get trash directory path for a project
     * Uses boundary-safe validation
     */
    getTrashPath(projectId) {
        // Validate project ID format
        const projectIdCheck = this.validateProjectId(projectId);
        if (!projectIdCheck.valid) {
            return { path: '', allowed: false, error: projectIdCheck.error };
        }
        // Build trash path within sandbox root
        const trashDir = path_1.default.join(this.realRoot, '.agentx-trash', projectId);
        // Verify trash path is within sandbox
        if (!this.isWithinSandbox(trashDir)) {
            return { path: '', allowed: false, error: 'Trash path outside sandbox' };
        }
        // Create if doesn't exist
        if (!fs_1.default.existsSync(trashDir)) {
            fs_1.default.mkdirSync(trashDir, { recursive: true });
        }
        return { path: trashDir, allowed: true };
    }
    /**
     * Soft delete a file/directory
     */
    softDelete(projectId, relativePath) {
        const check = this.validatePath(projectId, relativePath);
        if (!check.allowed)
            return check;
        const trashCheck = this.getTrashPath(projectId);
        if (!trashCheck.allowed) {
            return {
                allowed: false,
                error: trashCheck.error || 'Invalid trash path',
            };
        }
        const timestamp = Date.now();
        const trashName = `${path_1.default.basename(relativePath)}.${timestamp}`;
        const trashPath = path_1.default.join(trashCheck.path, trashName);
        try {
            fs_1.default.renameSync(check.realPath, trashPath);
            return {
                allowed: true,
                realPath: trashPath,
            };
        }
        catch (err) {
            return {
                allowed: false,
                error: `Failed to move to trash: ${err}`,
            };
        }
    }
    /**
     * Create project directory
     */
    createProject(projectId) {
        // Validate project ID format
        const projectIdCheck = this.validateProjectId(projectId);
        if (!projectIdCheck.valid) {
            return { success: false, error: projectIdCheck.error };
        }
        const projectPath = path_1.default.join(this.realRoot, projectId);
        // Ensure project path is within sandbox
        if (!this.isWithinSandbox(projectPath)) {
            return { success: false, error: 'Project path outside sandbox' };
        }
        if (fs_1.default.existsSync(projectPath)) {
            return { success: false, error: 'Project already exists' };
        }
        fs_1.default.mkdirSync(projectPath, { recursive: true });
        return { success: true };
    }
    getProjectPath(projectId) {
        // Validate project ID format
        const projectIdCheck = this.validateProjectId(projectId);
        if (!projectIdCheck.valid) {
            return { path: '', allowed: false, error: projectIdCheck.error };
        }
        const projectPath = path_1.default.join(this.realRoot, projectId);
        // Ensure project path is within sandbox
        if (!this.isWithinSandbox(projectPath)) {
            return { path: '', allowed: false, error: 'Project path outside sandbox' };
        }
        return { path: projectPath, allowed: true };
    }
}
exports.sandbox = new Sandbox();
