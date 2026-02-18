// Sandbox filesystem enforcement
import fs from 'fs';
import path from 'path';

interface SandboxCheck {
  allowed: boolean;
  realPath?: string;
  error?: string;
}

class Sandbox {
  private root: string = '';
  private realRoot: string = '';
  private denyList: string[] = [
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

  async initialize(): Promise<void> {
    // Get config at initialization time (after port discovery)
    const { config } = await import('./config');
    this.root = config.sandboxRoot;
    
    // Ensure sandbox root exists BEFORE calling realpathSync
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
      console.log(`📁 Created sandbox root: ${this.root}`);
    }
    
    // Now safe to get realpath
    this.realRoot = fs.realpathSync(this.root);
    
    // Ensure trash directory exists
    const trashDir = path.join(this.root, '.agentx-trash');
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
  }

  /**
   * Validate project ID format to prevent traversal attacks
   * Only allows lowercase letters, numbers, and hyphens
   */
  private validateProjectId(projectId: string): { valid: boolean; error?: string } {
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
  private isWithinSandbox(realPath: string): boolean {
    // Get relative path from sandbox root
    const relative = path.relative(this.realRoot, realPath);
    
    // Path is outside sandbox if:
    // 1. relative starts with '..' (going above root)
    // 2. relative is absolute (different drive on Windows, or somehow absolute)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
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
  validatePath(projectId: string, relativePath: string): SandboxCheck {
    // Validate project ID format first
    const projectIdCheck = this.validateProjectId(projectId);
    if (!projectIdCheck.valid) {
      return {
        allowed: false,
        error: projectIdCheck.error,
      };
    }

    // Reject absolute paths explicitly
    if (path.isAbsolute(relativePath)) {
      return {
        allowed: false,
        error: 'Access denied: absolute paths not allowed',
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
    const projectRoot = path.join(this.realRoot, projectId);
    let realProjectRoot: string;
    try {
      // Create project directory if it doesn't exist
      if (!fs.existsSync(projectRoot)) {
        fs.mkdirSync(projectRoot, { recursive: true });
      }
      realProjectRoot = fs.realpathSync(projectRoot);
    } catch (err) {
      return {
        allowed: false,
        error: `Failed to resolve project root: ${err}`,
      };
    }

    // Resolve target path within canonicalized project root
    const targetPath = path.join(realProjectRoot, relativePath);
    
    // Use realpath to resolve symlinks and get canonical path
    let realPath: string;
    try {
      // If path doesn't exist, resolve the parent
      if (!fs.existsSync(targetPath)) {
        const parent = path.dirname(targetPath);
        if (!fs.existsSync(parent)) {
          return {
            allowed: false,
            error: 'Parent directory does not exist',
          };
        }
        const realParent = fs.realpathSync(parent);
        realPath = path.join(realParent, path.basename(targetPath));
      } else {
        realPath = fs.realpathSync(targetPath);
      }
    } catch (err) {
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
    const relativeToProject = path.relative(realProjectRoot, realPath);
    if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) {
      return {
        allowed: false,
        realPath,
        error: 'Access denied: outside project boundary',
      };
    }

    // Check denylist
    const basename = path.basename(realPath);
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
  getTrashPath(projectId: string): { path: string; allowed: boolean; error?: string } {
    // Validate project ID format
    const projectIdCheck = this.validateProjectId(projectId);
    if (!projectIdCheck.valid) {
      return { path: '', allowed: false, error: projectIdCheck.error };
    }

    // Build trash path within sandbox root
    const trashDir = path.join(this.realRoot, '.agentx-trash', projectId);
    
    // Verify trash path is within sandbox
    if (!this.isWithinSandbox(trashDir)) {
      return { path: '', allowed: false, error: 'Trash path outside sandbox' };
    }

    // Create if doesn't exist
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
    
    return { path: trashDir, allowed: true };
  }

  /**
   * Soft delete a file/directory
   */
  softDelete(projectId: string, relativePath: string): SandboxCheck {
    const check = this.validatePath(projectId, relativePath);
    if (!check.allowed) return check;

    const trashCheck = this.getTrashPath(projectId);
    if (!trashCheck.allowed) {
      return {
        allowed: false,
        error: trashCheck.error || 'Invalid trash path',
      };
    }

    const timestamp = Date.now();
    const trashName = `${path.basename(relativePath)}.${timestamp}`;
    const trashPath = path.join(trashCheck.path, trashName);

    try {
      fs.renameSync(check.realPath!, trashPath);
      return {
        allowed: true,
        realPath: trashPath,
      };
    } catch (err) {
      return {
        allowed: false,
        error: `Failed to move to trash: ${err}`,
      };
    }
  }

  /**
   * Create project directory
   */
  createProject(projectId: string): { success: boolean; error?: string } {
    // Validate project ID format
    const projectIdCheck = this.validateProjectId(projectId);
    if (!projectIdCheck.valid) {
      return { success: false, error: projectIdCheck.error };
    }

    const projectPath = path.join(this.realRoot, projectId);
    
    // Ensure project path is within sandbox
    if (!this.isWithinSandbox(projectPath)) {
      return { success: false, error: 'Project path outside sandbox' };
    }

    if (fs.existsSync(projectPath)) {
      return { success: false, error: 'Project already exists' };
    }
    fs.mkdirSync(projectPath, { recursive: true });
    return { success: true };
  }

  getProjectPath(projectId: string): { path: string; allowed: boolean; error?: string } {
    // Validate project ID format
    const projectIdCheck = this.validateProjectId(projectId);
    if (!projectIdCheck.valid) {
      return { path: '', allowed: false, error: projectIdCheck.error };
    }

    const projectPath = path.join(this.realRoot, projectId);
    
    // Ensure project path is within sandbox
    if (!this.isWithinSandbox(projectPath)) {
      return { path: '', allowed: false, error: 'Project path outside sandbox' };
    }

    return { path: projectPath, allowed: true };
  }
}

export const sandbox = new Sandbox();
