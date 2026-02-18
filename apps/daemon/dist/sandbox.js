"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandbox = void 0;
// Sandbox filesystem enforcement
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
class Sandbox {
    root;
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
    constructor() {
        this.root = config_1.config.sandboxRoot;
    }
    async initialize() {
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
     * Validate and resolve a path within the sandbox
     * @param projectId - The project context
     * @param relativePath - Path relative to project root
     * @returns SandboxCheck with result
     */
    validatePath(projectId, relativePath) {
        // Prevent path traversal
        if (relativePath.includes('..')) {
            return {
                allowed: false,
                error: 'Path traversal not allowed',
            };
        }
        // Resolve to absolute path within project
        const projectPath = path_1.default.join(this.root, projectId);
        const targetPath = path_1.default.join(projectPath, relativePath);
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
        // Ensure real path is within sandbox
        const realRoot = fs_1.default.realpathSync(this.root);
        if (!realPath.startsWith(realRoot)) {
            return {
                allowed: false,
                realPath,
                error: 'Access denied: outside sandbox',
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
     */
    getTrashPath(projectId) {
        const trashDir = path_1.default.join(this.root, '.agentx-trash', projectId);
        if (!fs_1.default.existsSync(trashDir)) {
            fs_1.default.mkdirSync(trashDir, { recursive: true });
        }
        return trashDir;
    }
    /**
     * Soft delete a file/directory
     */
    softDelete(projectId, relativePath) {
        const check = this.validatePath(projectId, relativePath);
        if (!check.allowed)
            return check;
        const trashDir = this.getTrashPath(projectId);
        const timestamp = Date.now();
        const trashName = `${path_1.default.basename(relativePath)}.${timestamp}`;
        const trashPath = path_1.default.join(trashDir, trashName);
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
        const projectPath = path_1.default.join(this.root, projectId);
        if (fs_1.default.existsSync(projectPath)) {
            return false;
        }
        fs_1.default.mkdirSync(projectPath, { recursive: true });
        return true;
    }
    getProjectPath(projectId) {
        return path_1.default.join(this.root, projectId);
    }
}
exports.sandbox = new Sandbox();
