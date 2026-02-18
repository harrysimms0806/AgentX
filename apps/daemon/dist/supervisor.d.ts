import fs from 'fs';
import { ChildProcess } from 'child_process';
import { Run } from '@agentx/api-types';
interface RunRecord extends Run {
    process?: ChildProcess;
    outputBuffer: string[];
    bufferedBytes: number;
    logStream?: fs.WriteStream;
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
     */
    createRun(projectId: string, type: 'agent' | 'command' | 'git' | 'index', ownerAgentId?: string): RunRecord;
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
     * Shutdown cleanup
     */
    shutdown(): Promise<void>;
}
export declare const supervisor: Supervisor;
export {};
