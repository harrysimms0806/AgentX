interface SandboxCheck {
    allowed: boolean;
    realPath?: string;
    error?: string;
}
declare class Sandbox {
    private root;
    private denyList;
    constructor();
    initialize(): Promise<void>;
    /**
     * Validate and resolve a path within the sandbox
     * @param projectId - The project context
     * @param relativePath - Path relative to project root
     * @returns SandboxCheck with result
     */
    validatePath(projectId: string, relativePath: string): SandboxCheck;
    /**
     * Get trash directory path for a project
     */
    getTrashPath(projectId: string): string;
    /**
     * Soft delete a file/directory
     */
    softDelete(projectId: string, relativePath: string): SandboxCheck;
    /**
     * Create project directory
     */
    createProject(projectId: string): boolean;
    getProjectPath(projectId: string): string;
}
export declare const sandbox: Sandbox;
export {};
