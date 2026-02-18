export interface HealthResponse {
    status: 'ok';
    version: string;
    timestamp: string;
    uptime: number;
}
export interface AuthSessionRequest {
    clientId: string;
}
export interface AuthSessionResponse {
    token: string;
    expiresAt: string;
}
export interface Project {
    id: string;
    name: string;
    rootPath: string;
    createdAt: string;
    lastOpenedAt: string;
    settings: ProjectSettings;
}
export interface ProjectSettings {
    capabilities: Capabilities;
    safeMode: boolean;
    preferredAgents: string[];
}
export interface Capabilities {
    FS_READ: boolean;
    FS_WRITE: boolean;
    EXEC_SHELL: boolean;
    NETWORK: boolean;
    GIT_WRITE: boolean;
    OPENCLAW_RUN: boolean;
}
export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    size?: number;
    modifiedAt?: string;
    gitStatus?: 'untracked' | 'modified' | 'staged' | 'clean';
}
export interface FileLock {
    projectId: string;
    filePath: string;
    lockedBy: string;
    lockedAt: string;
}
export interface TerminalSession {
    id: string;
    projectId: string;
    cwd: string;
    pid?: number;
    createdAt: string;
    lastActiveAt: string;
    title: string;
    status: 'active' | 'closed' | 'stale';
}
export interface Run {
    id: string;
    projectId: string;
    type: 'agent' | 'command' | 'git' | 'index';
    ownerAgentId?: string;
    status: 'pending' | 'running' | 'completed' | 'error' | 'killed';
    startedAt?: string;
    endedAt?: string;
    exitCode?: number;
    logsPath: string;
    summary?: string;
}
export interface ContextPack {
    id: string;
    projectId: string;
    runId: string;
    createdAt: string;
    injectedSections: {
        summary: string;
        files: string[];
        diffs: string[];
        memories: string[];
        userNotes: string;
    };
    sizeChars: number;
}
export interface AuditEvent {
    id: string;
    projectId: string;
    actorType: 'user' | 'agent' | 'system';
    actorId?: string;
    actionType: string;
    payload: Record<string, unknown>;
    createdAt: string;
}
export interface RuntimeConfig {
    uiPort: number;
    daemonPort: number;
    startedAt: string;
    sandboxRoot: string;
}
export interface CreateProjectRequest {
    name: string;
    template?: string;
}
export interface FileWriteRequest {
    projectId: string;
    path: string;
    content: string;
}
export interface CreateTerminalRequest {
    projectId: string;
    cwd?: string;
}
export interface RunCommandRequest {
    projectId: string;
    command: string;
    cwd?: string;
    env?: Record<string, string>;
}
export interface RunAgentRequest {
    projectId: string;
    agentId: string;
    prompt: string;
    contextPackId?: string;
}
export interface GitStatusResponse {
    branch: string;
    modified: string[];
    staged: string[];
    untracked: string[];
}
