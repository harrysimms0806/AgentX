import fs from 'fs';
import { ChildProcess } from 'child_process';
import { Run } from '@agentx/api-types';
interface RunRecord extends Run {
    process?: ChildProcess;
    outputBuffer: string[];
    logStream?: fs.WriteStream;
}
declare class Supervisor {
    private runs;
    private logsDir;
    constructor();
    initialize(): Promise<void>;
    /**
     * Create a new run record
     */
    createRun(projectId: string, type: 'agent' | 'command' | 'git' | 'index', ownerAgentId?: string): RunRecord;
    /**
     * Spawn a command
     * Phase 0: Basic skeleton - full implementation in Phase 3
     */
    spawnCommand(runId: string, command: string, cwd: string, env?: Record<string, string>): Promise<void>;
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
     * Mark stale sessions on restart
     * Call this on daemon startup
     */
    markStaleSessions(): void;
    /**
     * Cleanup old logs
     */
    rotateLogs(): void;
}
export declare const supervisor: Supervisor;
export {};
