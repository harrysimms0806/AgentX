"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
class Supervisor {
    runs = new Map();
    logsDir = '';
    runtimeDir = '';
    defaultTimeout = 300000;
    logRetention = 604800000;
    maxLogSize = 10 * 1024 * 1024; // 10MB max log file size
    maxOutputBuffer = 10 * 1024 * 1024; // 10MB max buffer size
    initialized = false;
    runsFile = '';
    rotationInterval = null;
    async initialize() {
        const { config } = await Promise.resolve().then(() => __importStar(require('./config')));
        this.logsDir = path_1.default.join(config.runtimeDir, 'logs');
        this.runtimeDir = config.runtimeDir;
        this.defaultTimeout = config.defaultTimeout;
        this.logRetention = config.logRetention;
        this.maxOutputBuffer = config.maxOutputBuffer;
        this.runsFile = path_1.default.join(config.runtimeDir, 'runs.json');
        this.initialized = true;
        // Ensure logs directory exists
        if (!fs_1.default.existsSync(this.logsDir)) {
            fs_1.default.mkdirSync(this.logsDir, { recursive: true });
        }
        // Load persisted runs and mark stale
        await this.loadPersistedRuns();
        // Start log rotation scheduler (every hour)
        this.rotationInterval = setInterval(() => {
            this.rotateLogs();
        }, 60 * 60 * 1000);
        console.log(`🔧 Supervisor initialized`);
    }
    /**
     * Persist runs to disk for recovery after restart
     */
    persistRuns() {
        if (!this.runsFile)
            return;
        // Only persist metadata, not process handles
        const serializableRuns = Array.from(this.runs.values()).map(r => ({
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
        fs_1.default.writeFileSync(this.runsFile, JSON.stringify({ runs: serializableRuns }, null, 2));
    }
    /**
     * Load persisted runs and mark any "running" as stale
     */
    async loadPersistedRuns() {
        if (!fs_1.default.existsSync(this.runsFile))
            return;
        try {
            const data = JSON.parse(fs_1.default.readFileSync(this.runsFile, 'utf8'));
            const persistedRuns = data.runs || [];
            for (const run of persistedRuns) {
                // Mark previously running runs as stale
                if (run.status === 'running') {
                    run.status = 'error';
                    run.summary = 'Daemon restart - session stale';
                    run.endedAt = new Date().toISOString();
                    console.log(`⚠️ Marked stale run: ${run.id}`);
                }
                // Reconstruct RunRecord without process handle
                const runRecord = {
                    ...run,
                    outputBuffer: [],
                    bufferedBytes: 0,
                    logsPath: run.logsPath || path_1.default.join(this.logsDir, `${run.id}.log`),
                };
                this.runs.set(run.id, runRecord);
            }
            if (persistedRuns.length > 0) {
                console.log(`📋 Loaded ${persistedRuns.length} persisted run(s), marked stale sessions`);
                this.persistRuns(); // Save updated statuses
            }
        }
        catch (err) {
            console.warn('Failed to load persisted runs:', err);
        }
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
            bufferedBytes: 0,
        };
        this.runs.set(id, run);
        // Create log file
        run.logStream = fs_1.default.createWriteStream(run.logsPath);
        // Persist new run
        this.persistRuns();
        console.log(`▶️ Created run ${id} (${type})`);
        return run;
    }
    /**
     * Spawn a command
     * Phase 0: Basic skeleton - full implementation in Phase 3
     * @param runId - The run ID
     * @param cmd - Command executable (e.g., 'npm', 'node')
     * @param args - Array of arguments (e.g., ['run', 'build'])
     * @param cwd - Working directory
     * @param env - Optional environment variables
     */
    async spawnCommand(runId, cmd, args, cwd, env) {
        const run = this.runs.get(runId);
        if (!run)
            throw new Error('Run not found');
        run.status = 'running';
        run.startedAt = new Date().toISOString();
        // Spawn process with structured command
        const child = (0, child_process_1.spawn)(cmd, args, {
            cwd,
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        run.process = child;
        // Track output
        child.stdout?.on('data', (data) => {
            const line = data.toString();
            const lineBytes = Buffer.byteLength(line, 'utf8');
            // Check buffer size limit before adding
            if (run.bufferedBytes + lineBytes > this.maxOutputBuffer) {
                // Remove oldest lines until we have room
                while (run.outputBuffer.length > 0 && run.bufferedBytes + lineBytes > this.maxOutputBuffer) {
                    const removed = run.outputBuffer.shift();
                    if (removed) {
                        run.bufferedBytes -= Buffer.byteLength(removed, 'utf8');
                    }
                }
            }
            run.outputBuffer.push(line);
            run.bufferedBytes += lineBytes;
            // Check log file size before writing
            this.checkLogSize(run);
            run.logStream?.write(line);
        });
        child.stderr?.on('data', (data) => {
            const line = `stderr: ${data}`;
            const lineBytes = Buffer.byteLength(line, 'utf8');
            // Check buffer size limit before adding (same logic as stdout)
            if (run.bufferedBytes + lineBytes > this.maxOutputBuffer) {
                // Remove oldest lines until we have room
                while (run.outputBuffer.length > 0 && run.bufferedBytes + lineBytes > this.maxOutputBuffer) {
                    const removed = run.outputBuffer.shift();
                    if (removed) {
                        run.bufferedBytes -= Buffer.byteLength(removed, 'utf8');
                    }
                }
            }
            run.outputBuffer.push(line);
            run.bufferedBytes += lineBytes;
            // Check log file size before writing
            this.checkLogSize(run);
            run.logStream?.write(line);
        });
        child.on('close', (code) => {
            run.status = code === 0 ? 'completed' : 'error';
            run.exitCode = code ?? undefined;
            run.endedAt = new Date().toISOString();
            run.logStream?.end();
            // Persist final state
            this.persistRuns();
            console.log(`⏹️ Run ${runId} finished with code ${code}`);
        });
        // Set timeout
        setTimeout(() => {
            if (run.status === 'running') {
                this.killRun(runId, 'timeout');
            }
        }, this.defaultTimeout);
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
        // Persist state change
        this.persistRuns();
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
     * Check log file size and rotate if exceeded
     */
    checkLogSize(run) {
        if (!run.logsPath || !fs_1.default.existsSync(run.logsPath))
            return;
        try {
            const stats = fs_1.default.statSync(run.logsPath);
            if (stats.size > this.maxLogSize) {
                // Rotate: close current, rename to .1, create new
                run.logStream?.end();
                const rotatedPath = `${run.logsPath}.1`;
                if (fs_1.default.existsSync(rotatedPath)) {
                    fs_1.default.unlinkSync(rotatedPath);
                }
                fs_1.default.renameSync(run.logsPath, rotatedPath);
                run.logStream = fs_1.default.createWriteStream(run.logsPath);
                run.logStream.write(`--- Log rotated at ${new Date().toISOString()} ---\n`);
                console.log(`🔄 Rotated log for run ${run.id}`);
            }
        }
        catch (err) {
            // Ignore errors during size check
        }
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
     * Cleanup old logs by age and enforce total size limit
     */
    rotateLogs() {
        const now = Date.now();
        const files = fs_1.default.readdirSync(this.logsDir);
        let totalSize = 0;
        const logFiles = [];
        // Collect all log files with metadata
        for (const file of files) {
            const filePath = path_1.default.join(this.logsDir, file);
            try {
                const stats = fs_1.default.statSync(filePath);
                totalSize += stats.size;
                logFiles.push({ path: filePath, mtime: stats.mtimeMs, size: stats.size });
            }
            catch (err) {
                // Skip files we can't stat
            }
        }
        // Sort by modification time (oldest first)
        logFiles.sort((a, b) => a.mtime - b.mtime);
        // Enforce max total size (100MB) and age limit
        const maxTotalSize = 100 * 1024 * 1024; // 100MB
        for (const file of logFiles) {
            const ageExceeded = now - file.mtime > this.logRetention;
            const sizeExceeded = totalSize > maxTotalSize;
            if (ageExceeded || sizeExceeded) {
                try {
                    fs_1.default.unlinkSync(file.path);
                    totalSize -= file.size;
                    console.log(`🗑️ Rotated log: ${path_1.default.basename(file.path)} (${ageExceeded ? 'age' : 'size'})`);
                }
                catch (err) {
                    // Ignore errors during cleanup
                }
            }
        }
    }
    /**
     * Shutdown cleanup
     */
    shutdown() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }
        // Persist final state
        this.persistRuns();
        console.log('🔧 Supervisor shutdown complete');
    }
}
exports.supervisor = new Supervisor();
