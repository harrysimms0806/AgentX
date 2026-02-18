import fs from 'fs';
import { ChildProcess } from 'child_process';
import { type IPty } from 'node-pty';
import { EventEmitter } from 'events';
import { Run } from '@agentx/api-types';
interface RunRecord extends Run {
    process?: ChildProcess;
    outputBuffer: string[];
    bufferedBytes: number;
    logStream?: fs.WriteStream;
    timeoutMs?: number;
}
interface TerminalRecord {
    id: string;
    projectId: string;
    cwd: string;
    title: string;
    status: 'active' | 'closed' | 'stale';
    createdAt: string;
    lastActiveAt: string;
    pid?: number;
    pty?: IPty;
    outputBuffer: string[];
    bufferedBytes: number;
    logsPath: string;
    logStream?: fs.WriteStream;
}
declare class Supervisor extends EventEmitter {
    private runs;
    private logsDir;
    private runtimeDir;
    private defaultTimeout;
    private logRetention;
    private maxLogSize;
    private maxOutputBuffer;
    private initialized;
    private runsFile;
    private rotationInterval;
    private terminals;
    private terminalsFile;
    private maxTerminalBufferBytes;
    constructor();
    private toPublicRun;
    initialize(): Promise<void>;
    /**
     * Persist runs to disk for recovery after restart
     */
    private persistRuns;
    /**
     * Load persisted runs and mark any "running" as stale
     */
    private loadPersistedRuns;
    /**
     * Create a new run record
     * @param timeoutMs - Optional timeout in milliseconds (clamped to safe max)
     */
    createRun(projectId: string, type: 'agent' | 'command' | 'git' | 'index', ownerAgentId?: string, timeoutMs?: number): RunRecord;
    /**
     * Spawn a command
     * Phase 0: Basic skeleton - full implementation in Phase 3
     * @param runId - The run ID
     * @param cmd - Command executable (e.g., 'npm', 'node')
     * @param args - Array of arguments (e.g., ['run', 'build'])
     * @param cwd - Working directory
     * @param env - Optional environment variables
     */
    spawnCommand(runId: string, cmd: string, args: string[], cwd: string, env?: Record<string, string>): Promise<void>;
    /**
     * Kill a run
     * Phase 0: Basic SIGTERM, escalate to SIGKILL after delay
     */
    killRun(runId: string, reason?: string): Promise<boolean>;
    /**
     * Get run status
     */
    getRun(runId: string): Run | undefined;
    /**
     * Get all runs for a project
     */
    getProjectRuns(projectId: string): Run[];
    /**
     * Get recent output from a run
     */
    getRunOutput(runId: string, lines?: number): string[];
    /**
     * Check log file size and rotate if exceeded
     */
    private checkLogSize;
    /**
     * Mark stale sessions on restart
     * Call this on daemon startup
     */
    markStaleSessions(): void;
    /**
     * Cleanup old logs by age and enforce total size limit
     */
    rotateLogs(): void;
    /**
     * List all runs (public method for route encapsulation)
     */
    listRuns(projectId?: string): Run[];
    /**
     * Cleanup old runs (public method for route encapsulation)
     */
    cleanupRuns(projectId?: string, maxAgeMs?: number): number;
    private persistTerminals;
    private loadPersistedTerminals;
    private appendTerminalOutput;
    createTerminal(projectId: string, cwd: string, shell?: string): TerminalRecord;
    listTerminals(projectId?: string): TerminalRecord[];
    getTerminal(id: string): TerminalRecord | undefined;
    writeTerminal(id: string, data: string): boolean;
    resizeTerminal(id: string, cols: number, rows: number): boolean;
    killTerminal(id: string, reason?: string): Promise<boolean>;
    clearTerminal(id: string): boolean;
    getTerminalOutput(id: string): string[];
    /**
     * Spawn an agent run (Phase 4)
     * Creates a supervised process for an AI agent
     */
    spawnAgentRun(projectId: string, agentInstanceId: string, agentDefinition: any, prompt: string, contextPackId: string): Promise<string>;
    /**
     * Shutdown cleanup
     */
    shutdown(): Promise<void>;
}
export declare const supervisor: Supervisor;
export {};
