"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supervisor = void 0;
// Process supervisor - manages all spawned processes
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const config_1 = require("./config");
class Supervisor {
    runs = new Map();
    logsDir;
    constructor() {
        this.logsDir = path_1.default.join(config_1.config.runtimeDir, 'logs');
    }
    async initialize() {
        // Ensure logs directory exists
        if (!fs_1.default.existsSync(this.logsDir)) {
            fs_1.default.mkdirSync(this.logsDir, { recursive: true });
        }
        // TODO: Load any persisted runs from database
        // For Phase 0, we start fresh
        console.log(`🔧 Supervisor initialized`);
    }
    /**
     * Create a new run record
     */
    createRun(projectId, type, ownerAgentId) {
        const id = (0, crypto_1.randomUUID)();
        const run = {
            id,
            projectId,
            type,
            ownerAgentId,
            status: 'pending',
            logsPath: path_1.default.join(this.logsDir, `${id}.log`),
            outputBuffer: [],
        };
        this.runs.set(id, run);
        // Create log file
        run.logStream = fs_1.default.createWriteStream(run.logsPath);
        console.log(`▶️ Created run ${id} (${type})`);
        return run;
    }
    /**
     * Spawn a command
     * Phase 0: Basic skeleton - full implementation in Phase 3
     */
    async spawnCommand(runId, command, cwd, env) {
        const run = this.runs.get(runId);
        if (!run)
            throw new Error('Run not found');
        run.status = 'running';
        run.startedAt = new Date().toISOString();
        // Parse command
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);
        // Spawn process
        const child = (0, child_process_1.spawn)(cmd, args, {
            cwd,
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        run.process = child;
        // Track output
        child.stdout?.on('data', (data) => {
            const line = data.toString();
            run.outputBuffer.push(line);
            run.logStream?.write(line);
            // Limit buffer size
            if (run.outputBuffer.length > 1000) {
                run.outputBuffer.shift();
            }
        });
        child.stderr?.on('data', (data) => {
            const line = `stderr: ${data}`;
            run.outputBuffer.push(line);
            run.logStream?.write(line);
        });
        child.on('close', (code) => {
            run.status = code === 0 ? 'completed' : 'error';
            run.exitCode = code ?? undefined;
            run.endedAt = new Date().toISOString();
            run.logStream?.end();
            console.log(`⏹️ Run ${runId} finished with code ${code}`);
        });
        // Set timeout
        setTimeout(() => {
            if (run.status === 'running') {
                this.killRun(runId, 'timeout');
            }
        }, config_1.config.defaultTimeout);
    }
    /**
     * Kill a run
     * Phase 0: Basic SIGTERM, escalate to SIGKILL after delay
     */
    async killRun(runId, reason = 'user') {
        const run = this.runs.get(runId);
        if (!run || !run.process)
            return false;
        console.log(`🛑 Killing run ${runId} (${reason})`);
        // Try graceful termination first
        run.process.kill('SIGTERM');
        // Escalate to SIGKILL after 5 seconds if still running
        setTimeout(() => {
            if (!run.process?.killed) {
                console.log(`💀 Force killing run ${runId}`);
                run.process?.kill('SIGKILL');
            }
        }, 5000);
        run.status = 'killed';
        run.endedAt = new Date().toISOString();
        run.summary = `Killed: ${reason}`;
        return true;
    }
    /**
     * Get run status
     */
    getRun(runId) {
        return this.runs.get(runId);
    }
    /**
     * Get all runs for a project
     */
    getProjectRuns(projectId) {
        return Array.from(this.runs.values())
            .filter(r => r.projectId === projectId)
            .map(r => ({
            id: r.id,
            projectId: r.projectId,
            type: r.type,
            ownerAgentId: r.ownerAgentId,
            status: r.status,
            startedAt: r.startedAt,
            endedAt: r.endedAt,
            exitCode: r.exitCode,
            logsPath: r.logsPath,
            summary: r.summary,
        }));
    }
    /**
     * Get recent output from a run
     */
    getRunOutput(runId, lines = 50) {
        const run = this.runs.get(runId);
        if (!run)
            return [];
        return run.outputBuffer.slice(-lines);
    }
    /**
     * Mark stale sessions on restart
     * Call this on daemon startup
     */
    markStaleSessions() {
        for (const run of this.runs.values()) {
            if (run.status === 'running') {
                run.status = 'error';
                run.summary = 'Daemon restart - session stale';
                run.endedAt = new Date().toISOString();
            }
        }
    }
    /**
     * Cleanup old logs
     */
    rotateLogs() {
        const now = Date.now();
        const files = fs_1.default.readdirSync(this.logsDir);
        for (const file of files) {
            const filePath = path_1.default.join(this.logsDir, file);
            const stats = fs_1.default.statSync(filePath);
            if (now - stats.mtimeMs > config_1.config.logRetention) {
                fs_1.default.unlinkSync(filePath);
                console.log(`🗑️ Rotated log: ${file}`);
            }
        }
    }
}
exports.supervisor = new Supervisor();
