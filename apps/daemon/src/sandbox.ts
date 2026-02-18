// Sandbox filesystem enforcement
import fs from 'fs';
import path from 'path';
import { config } from './config';

interface SandboxCheck {
  allowed: boolean;
  realPath?: string;
  error?: string;
}

class Sandbox {
  private root: string;
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

  constructor() {
    this.root = config.sandboxRoot;
  }

  async initialize(): Promise<void> {
    // Ensure sandbox root exists
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
      console.log(`📁 Created sandbox root: ${this.root}`);
    }
    
    // Ensure trash directory exists
    const trashDir = path.join(this.root, '.agentx-trash');
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
  }

  /**
   * Validate and resolve a path within the sandbox
   * @param projectId - The project context
   * @param relativePath - Path relative to project root
   * @returns SandboxCheck with result
   */
  validatePath(projectId: string, relativePath: string): SandboxCheck {
    // Prevent path traversal
    if (relativePath.includes('..')) {
      return {
        allowed: false,
        error: 'Path traversal not allowed',
      };
    }

    // Resolve to absolute path within project
    const projectPath = path.join(this.root, projectId);
    const targetPath = path.join(projectPath, relativePath);
    
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

    // Ensure real path is within sandbox
    const realRoot = fs.realpathSync(this.root);
    if (!realPath.startsWith(realRoot)) {
      return {
        allowed: false,
        realPath,
        error: 'Access denied: outside sandbox',
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
   */
  getTrashPath(projectId: string): string {
    const trashDir = path.join(this.root, '.agentx-trash', projectId);
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
    return trashDir;
  }

  /**
   * Soft delete a file/directory
   */
  softDelete(projectId: string, relativePath: string): SandboxCheck {
    const check = this.validatePath(projectId, relativePath);
    if (!check.allowed) return check;

    const trashDir = this.getTrashPath(projectId);
    const timestamp = Date.now();
    const trashName = `${path.basename(relativePath)}.${timestamp}`;
    const trashPath = path.join(trashDir, trashName);

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
  createProject(projectId: string): boolean {
    const projectPath = path.join(this.root, projectId);
    if (fs.existsSync(projectPath)) {
      return false;
    }
    fs.mkdirSync(projectPath, { recursive: true });
    return true;
  }

  getProjectPath(projectId: string): string {
    return path.join(this.root, projectId);
  }
}

export const sandbox = new Sandbox();
