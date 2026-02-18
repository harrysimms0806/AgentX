import fs from 'fs';
import { ChildProcess } from 'child_process';
import { Run } from '@agentx/api-types';
interface RunRecord extends Run {
    process?: ChildProcess;
    outputBuffer: string[];
    bufferedBytes: number;
    logStream?: fs.WriteStream;
    timeoutMs?: number;
}
declare class Supervisor {
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
     * List runs with optional project filter
     */
    listRuns(projectId?: string): Run[];
    /**
     * Cleanup stale completed runs older than maxAgeMs
     */
    cleanupRuns(projectId?: string, maxAgeMs?: number): number;
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
     * Shutdown cleanup
     */
    shutdown(): Promise<void>;
}
export declare const supervisor: Supervisor;
export {};
