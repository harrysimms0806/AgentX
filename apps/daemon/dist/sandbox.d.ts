interface SandboxCheck {
    allowed: boolean;
    realPath?: string;
    error?: string;
}
declare class Sandbox {
    private root;
    private realRoot;
    private denyList;
    initialize(): Promise<void>;
    /**
     * Validate project ID format to prevent traversal attacks
     * Only allows lowercase letters, numbers, and hyphens
     */
    private validateProjectId;
    /**
     * Boundary-safe check: ensure path is within sandbox root
     * Uses path.relative to detect escape attempts
     */
    private isWithinSandbox;
    /**
     * Validate and resolve a path within the sandbox
     * @param projectId - The project context (validated for safe format)
     * @param relativePath - Path relative to project root
     * @returns SandboxCheck with result
     */
    validatePath(projectId: string, relativePath: string): SandboxCheck;
    /**
     * Get trash directory path for a project
     * Uses boundary-safe validation
     */
    getTrashPath(projectId: string): {
        path: string;
        allowed: boolean;
        error?: string;
    };
    /**
     * Soft delete a file/directory
     */
    softDelete(projectId: string, relativePath: string): SandboxCheck;
    /**
     * Create project directory
     */
    createProject(projectId: string): {
        success: boolean;
        error?: string;
    };
    getProjectPath(projectId: string): {
        path: string;
        allowed: boolean;
        error?: string;
    };
}
export declare const sandbox: Sandbox;
export {};
