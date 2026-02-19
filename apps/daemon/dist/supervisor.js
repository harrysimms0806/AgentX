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
const node_pty_1 = require("node-pty");
const events_1 = require("events");
const openclaw_adapter_1 = require("./openclaw-adapter");
const git_inspector_1 = require("./git-inspector");
class Supervisor extends events_1.EventEmitter {
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
    terminals = new Map();
    terminalsFile = '';
    maxTerminalBufferBytes = 2 * 1024 * 1024;
    constructor() {
        super();
    }
    toPublicRun(run) {
        return {
            id: run.id,
            projectId: run.projectId,
            type: run.type,
            ownerAgentId: run.ownerAgentId,
            status: run.status,
            pid: run.pid,
            startedAt: run.startedAt,
            endedAt: run.endedAt,
            exitCode: run.exitCode,
            logsPath: run.logsPath,
            summary: run.summary,
        };
    }
    async initialize() {
        const { config } = await Promise.resolve().then(() => __importStar(require('./config')));
        this.logsDir = path_1.default.join(config.runtimeDir, 'logs');
        this.runtimeDir = config.runtimeDir;
        this.defaultTimeout = config.defaultTimeout;
        this.logRetention = config.logRetention;
        this.maxOutputBuffer = config.maxOutputBuffer;
        this.runsFile = path_1.default.join(config.runtimeDir, 'runs.json');
        this.terminalsFile = path_1.default.join(config.runtimeDir, 'terminals.json');
        this.initialized = true;
        // Ensure logs directory exists
        if (!fs_1.default.existsSync(this.logsDir)) {
            fs_1.default.mkdirSync(this.logsDir, { recursive: true });
        }
        // Load persisted runs and mark stale
        await this.loadPersistedRuns();
        await this.loadPersistedTerminals();
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
            pid: r.process?.pid || r.pid, // Persist PID if available
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
                    run.status = 'failed';
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
     * @param timeoutMs - Optional timeout in milliseconds (clamped to safe max)
     */
    createRun(projectId, type, ownerAgentId, timeoutMs) {
        const id = (0, crypto_1.randomUUID)();
        // Clamp timeout to safe range (1 min to 30 min)
        const MAX_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        const MIN_TIMEOUT = 60 * 1000; // 1 minute
        const effectiveTimeout = timeoutMs
            ? Math.max(MIN_TIMEOUT, Math.min(timeoutMs, MAX_TIMEOUT))
            : undefined;
        const run = {
            id,
            projectId,
            type,
            ownerAgentId,
            status: 'queued',
            logsPath: path_1.default.join(this.logsDir, `${id}.log`),
            outputBuffer: [],
            bufferedBytes: 0,
            timeoutMs: effectiveTimeout,
        };
        this.runs.set(id, run);
        // Create log file
        run.logStream = fs_1.default.createWriteStream(run.logsPath);
        // Persist new run
        this.persistRuns();
        console.log(`▶️ Created run ${id} (${type})${effectiveTimeout ? ` timeout=${effectiveTimeout}ms` : ''}`);
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
        this.emit('run:status', this.toPublicRun(run));
        // Spawn process with structured command
        const child = (0, child_process_1.spawn)(cmd, args, {
            cwd,
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        run.process = child;
        run.pid = child.pid; // Track PID for diagnostics and persistence
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
            this.emit('run:output', { runId: run.id, projectId: run.projectId, chunk: line, stream: 'stdout' });
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
            this.emit('run:output', { runId: run.id, projectId: run.projectId, chunk: line, stream: 'stderr' });
        });
        child.on('close', (code) => {
            // Preserve terminal states that may have been set by explicit kill/timeout handling
            if (run.status !== 'killed') {
                run.status = code === 0 ? 'succeeded' : 'failed';
            }
            run.exitCode = code ?? undefined;
            run.endedAt = new Date().toISOString();
            run.logStream?.end();
            // Persist final state
            this.persistRuns();
            this.emit('run:status', this.toPublicRun(run));
            console.log(`⏹️ Run ${runId} finished with code ${code}`);
        });
        // Set timeout (use run-specific timeout if set, otherwise use default)
        const timeoutMs = run.timeoutMs || this.defaultTimeout;
        setTimeout(() => {
            if (run.status === 'running') {
                this.killRun(runId, 'timeout');
            }
        }, timeoutMs);
    }
    /**
     * Kill a run
     * Phase 0: Basic SIGTERM, escalate to SIGKILL after delay
     */
    async killRun(runId, reason = 'user') {
        const run = this.runs.get(runId);
        if (!run || !run.process)
            return false;
        const pid = run.process.pid;
        if (!pid) {
            // No PID available, can't do reliable kill escalation
            console.log(`🛑 Killing run ${runId} (${reason}) - no PID available`);
            run.process.kill('SIGTERM');
            run.status = 'killed';
            run.endedAt = new Date().toISOString();
            run.summary = `Killed: ${reason}`;
            this.persistRuns();
            this.emit('run:status', this.toPublicRun(run));
            return true;
        }
        console.log(`🛑 Killing run ${runId} (${reason})`);
        let killTimer = null;
        // Try graceful termination first
        run.process.kill('SIGTERM');
        // Escalate to SIGKILL after 5 seconds if process still alive
        killTimer = setTimeout(() => {
            // Check if process is still alive using kill(pid, 0)
            try {
                process.kill(pid, 0); // Throws if process doesn't exist
                console.log(`💀 Force killing run ${runId} (SIGKILL)`);
                process.kill(pid, 'SIGKILL');
            }
            catch (err) {
                // Process already dead, nothing to do
                console.log(`✅ Run ${runId} already terminated`);
            }
        }, 5000);
        // Clear escalation timer when process exits
        run.process.once('exit', () => {
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
        });
        run.status = 'killed';
        run.endedAt = new Date().toISOString();
        run.summary = `Killed: ${reason}`;
        // Persist state change
        this.persistRuns();
        this.emit('run:status', this.toPublicRun(run));
        return true;
    }
    /**
     * Get run status
     */
    getRun(runId) {
        const run = this.runs.get(runId);
        if (!run)
            return undefined;
        return this.toPublicRun(run);
    }
    /**
     * Get all runs for a project
     */
    getProjectRuns(projectId) {
        return Array.from(this.runs.values())
            .filter(r => r.projectId === projectId)
            .map(r => this.toPublicRun(r));
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
                run.status = 'failed';
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
     * List all runs (public method for route encapsulation)
     */
    listRuns(projectId) {
        let runs = Array.from(this.runs.values());
        if (projectId) {
            runs = runs.filter(r => r.projectId === projectId);
        }
        return runs.map(r => this.toPublicRun(r));
    }
    /**
     * Cleanup old runs (public method for route encapsulation)
     */
    cleanupRuns(projectId, maxAgeMs = 24 * 60 * 60 * 1000) {
        let cleaned = 0;
        for (const run of this.runs.values()) {
            // Clean up completed/failed/killed runs older than maxAge
            if (run.endedAt && run.status !== 'running') {
                const endedTime = new Date(run.endedAt).getTime();
                const age = Date.now() - endedTime;
                if (age > maxAgeMs) {
                    if (!projectId || run.projectId === projectId) {
                        this.runs.delete(run.id);
                        cleaned++;
                    }
                }
            }
        }
        if (cleaned > 0) {
            this.persistRuns();
        }
        return cleaned;
    }
    persistTerminals() {
        if (!this.terminalsFile)
            return;
        const serializable = Array.from(this.terminals.values()).map((t) => ({
            id: t.id,
            projectId: t.projectId,
            cwd: t.cwd,
            title: t.title,
            status: t.status,
            createdAt: t.createdAt,
            lastActiveAt: t.lastActiveAt,
            pid: t.pty?.pid || t.pid,
            logsPath: t.logsPath,
        }));
        fs_1.default.writeFileSync(this.terminalsFile, JSON.stringify({ terminals: serializable }, null, 2));
    }
    async loadPersistedTerminals() {
        if (!this.terminalsFile || !fs_1.default.existsSync(this.terminalsFile))
            return;
        try {
            const data = JSON.parse(fs_1.default.readFileSync(this.terminalsFile, 'utf8'));
            const persisted = data.terminals || [];
            for (const term of persisted) {
                const status = term.status === 'active' ? 'stale' : term.status;
                const terminal = {
                    id: term.id,
                    projectId: term.projectId,
                    cwd: term.cwd,
                    title: term.title,
                    status,
                    createdAt: term.createdAt,
                    lastActiveAt: term.lastActiveAt,
                    pid: term.pid,
                    outputBuffer: [],
                    bufferedBytes: 0,
                    logsPath: term.logsPath || path_1.default.join(this.logsDir, `terminal-${term.id}.log`),
                };
                this.terminals.set(terminal.id, terminal);
            }
            if (persisted.length > 0) {
                this.persistTerminals();
            }
        }
        catch (err) {
            console.warn('Failed to load persisted terminals:', err);
        }
    }
    appendTerminalOutput(terminal, chunk) {
        const chunkBytes = Buffer.byteLength(chunk, 'utf8');
        while (terminal.outputBuffer.length > 0 && terminal.bufferedBytes + chunkBytes > this.maxTerminalBufferBytes) {
            const removed = terminal.outputBuffer.shift();
            if (removed) {
                terminal.bufferedBytes -= Buffer.byteLength(removed, 'utf8');
            }
        }
        if (chunkBytes <= this.maxTerminalBufferBytes) {
            terminal.outputBuffer.push(chunk);
            terminal.bufferedBytes += chunkBytes;
        }
        if (!terminal.logStream) {
            terminal.logStream = fs_1.default.createWriteStream(terminal.logsPath, { flags: 'a' });
        }
        this.checkLogSize({
            id: terminal.id,
            projectId: terminal.projectId,
            type: 'command',
            status: 'running',
            logsPath: terminal.logsPath,
            outputBuffer: [],
            bufferedBytes: 0,
            logStream: terminal.logStream,
        });
        terminal.logStream?.write(chunk);
    }
    createTerminal(projectId, cwd, shell) {
        const id = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const selectedShell = shell || process.env.SHELL || '/bin/bash';
        const terminal = {
            id,
            projectId,
            cwd,
            title: path_1.default.basename(cwd),
            status: 'active',
            createdAt: now,
            lastActiveAt: now,
            outputBuffer: [],
            bufferedBytes: 0,
            logsPath: path_1.default.join(this.logsDir, `terminal-${id}.log`),
            logStream: fs_1.default.createWriteStream(path_1.default.join(this.logsDir, `terminal-${id}.log`), { flags: 'a' }),
        };
        const pty = (0, node_pty_1.spawn)(selectedShell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd,
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                AGENTX_PROJECT_ID: projectId,
                AGENTX_TERMINAL_ID: id,
            },
        });
        terminal.pty = pty;
        terminal.pid = pty.pid;
        pty.onData((data) => {
            terminal.lastActiveAt = new Date().toISOString();
            this.appendTerminalOutput(terminal, data);
            this.emit('terminal:data', { terminalId: id, data });
        });
        pty.onExit(({ exitCode }) => {
            terminal.status = exitCode === 0 ? 'closed' : 'stale';
            terminal.lastActiveAt = new Date().toISOString();
            terminal.logStream?.end();
            this.persistTerminals();
            this.emit('terminal:exit', { terminalId: id, exitCode });
        });
        this.terminals.set(id, terminal);
        this.persistTerminals();
        return terminal;
    }
    listTerminals(projectId) {
        let all = Array.from(this.terminals.values());
        if (projectId) {
            all = all.filter((t) => t.projectId === projectId);
        }
        return all.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
    }
    getTerminal(id) {
        return this.terminals.get(id);
    }
    writeTerminal(id, data) {
        const terminal = this.terminals.get(id);
        if (!terminal || terminal.status !== 'active' || !terminal.pty)
            return false;
        terminal.pty.write(data);
        terminal.lastActiveAt = new Date().toISOString();
        this.persistTerminals();
        return true;
    }
    resizeTerminal(id, cols, rows) {
        const terminal = this.terminals.get(id);
        if (!terminal || terminal.status !== 'active' || !terminal.pty)
            return false;
        terminal.pty.resize(cols, rows);
        return true;
    }
    async killTerminal(id, reason = 'user') {
        const terminal = this.terminals.get(id);
        if (!terminal || !terminal.pty)
            return false;
        const pty = terminal.pty;
        let exited = false;
        const onExit = () => {
            exited = true;
        };
        pty.onExit(onExit);
        pty.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!exited) {
            try {
                pty.kill('SIGKILL');
            }
            catch (err) {
                // noop
            }
        }
        terminal.status = 'closed';
        terminal.lastActiveAt = new Date().toISOString();
        terminal.logStream?.write(`
--- terminal killed (${reason}) at ${new Date().toISOString()} ---
`);
        terminal.logStream?.end();
        terminal.pty = undefined;
        this.persistTerminals();
        return true;
    }
    clearTerminal(id) {
        const terminal = this.terminals.get(id);
        if (!terminal)
            return false;
        this.terminals.delete(id);
        this.persistTerminals();
        return true;
    }
    getTerminalOutput(id) {
        const terminal = this.terminals.get(id);
        if (!terminal)
            return [];
        return [...terminal.outputBuffer];
    }
    /**
     * Spawn an agent run (Phase 4)
     * Creates a supervised OpenClaw-backed process for an AI agent
     */
    async spawnAgentRun(projectId, agentInstanceId, agentDefinition, prompt, contextPackId, cwd) {
        const id = `agent-run-${(0, crypto_1.randomUUID)()}`;
        const now = new Date().toISOString();
        const logFile = path_1.default.join(this.logsDir, `${id}.log`);
        const logStream = fs_1.default.createWriteStream(logFile, { flags: 'a' });
        const run = {
            id,
            projectId,
            type: 'agent',
            ownerAgentId: agentInstanceId,
            status: 'queued',
            pid: undefined,
            startedAt: now,
            logsPath: logFile,
            outputBuffer: [],
            bufferedBytes: 0,
            logStream,
        };
        this.runs.set(id, run);
        logStream.write(`=== Agent Run: ${id} ===
`);
        logStream.write(`Agent: ${agentDefinition.name} (${agentDefinition.id})
`);
        logStream.write(`Context: ${contextPackId}
`);
        logStream.write(`Started: ${now}
`);
        logStream.write(`===

`);
        run.summary = `Agent ${agentDefinition.name} queued for execution`;
        this.persistRuns();
        this.emit('run:status', this.toPublicRun(run));
        run.status = 'running';
        this.persistRuns();
        this.emit('run:status', this.toPublicRun(run));
        const handle = openclaw_adapter_1.openclawAdapter.runTask({
            projectId,
            agentId: agentDefinition.id,
            prompt,
            cwd,
            timeoutMs: run.timeoutMs || this.defaultTimeout,
            onStart: (pid) => {
                run.pid = pid;
            },
            onStdout: (chunk) => {
                const lineBytes = Buffer.byteLength(chunk, 'utf8');
                while (run.outputBuffer.length > 0 && run.bufferedBytes + lineBytes > this.maxOutputBuffer) {
                    const removed = run.outputBuffer.shift();
                    if (removed) {
                        run.bufferedBytes -= Buffer.byteLength(removed, 'utf8');
                    }
                }
                run.outputBuffer.push(chunk);
                run.bufferedBytes += lineBytes;
                this.checkLogSize(run);
                run.logStream?.write(chunk);
                this.emit('run:output', { runId: run.id, projectId: run.projectId, chunk, stream: 'stdout' });
            },
            onStderr: (chunk) => {
                const prefixed = `stderr: ${chunk}`;
                const lineBytes = Buffer.byteLength(prefixed, 'utf8');
                while (run.outputBuffer.length > 0 && run.bufferedBytes + lineBytes > this.maxOutputBuffer) {
                    const removed = run.outputBuffer.shift();
                    if (removed) {
                        run.bufferedBytes -= Buffer.byteLength(removed, 'utf8');
                    }
                }
                run.outputBuffer.push(prefixed);
                run.bufferedBytes += lineBytes;
                this.checkLogSize(run);
                run.logStream?.write(prefixed);
                this.emit('run:output', { runId: run.id, projectId: run.projectId, chunk: prefixed, stream: 'stderr' });
            },
            onTimeout: () => {
                void this.killRun(run.id, 'timeout');
            },
        });
        run.process = handle.process;
        run.pid = handle.process.pid;
        handle.process.on('close', (code) => {
            if (run.status !== 'killed') {
                run.status = code === 0 ? 'succeeded' : 'failed';
            }
            run.exitCode = code ?? undefined;
            run.endedAt = new Date().toISOString();
            if (run.status === 'succeeded') {
                try {
                    const summary = (0, git_inspector_1.buildRunSummary)(cwd, prompt);
                    run.summary = JSON.stringify(summary);
                }
                catch {
                    run.summary = 'Agent run completed successfully';
                }
            }
            else {
                run.summary = run.summary || 'Agent run failed';
            }
            run.logStream?.end();
            this.persistRuns();
            this.emit('run:status', this.toPublicRun(run));
        });
        console.log(`Agent run ${id} created for instance ${agentInstanceId}`);
        return id;
    }
    /**
     * Shutdown cleanup
     */
    async shutdown() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }
        // Kill all running processes before persisting
        const runningRuns = Array.from(this.runs.values()).filter(r => r.status === 'running');
        if (runningRuns.length > 0) {
            console.log(`🛑 Shutting down ${runningRuns.length} running process(es)...`);
            // Create kill promises for all running processes
            const killPromises = runningRuns.map(run => {
                return new Promise((resolve) => {
                    if (!run.process) {
                        resolve();
                        return;
                    }
                    const pid = run.process.pid;
                    if (!pid) {
                        run.process.kill('SIGTERM');
                        resolve();
                        return;
                    }
                    // Send SIGTERM first
                    run.process.kill('SIGTERM');
                    // Wait for process to exit or force kill after timeout
                    const checkInterval = setInterval(() => {
                        try {
                            process.kill(pid, 0); // Still alive
                        }
                        catch (err) {
                            // Process dead
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                    // Force kill after 2 seconds
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        try {
                            process.kill(pid, 'SIGKILL');
                        }
                        catch (err) {
                            // Already dead
                        }
                        resolve();
                    }, 2000);
                });
            });
            // Wait for all kills with a max timeout
            await Promise.race([
                Promise.all(killPromises),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5s max shutdown time
            ]);
            console.log('✅ All processes terminated');
        }
        // Shutdown terminals
        const activeTerminals = Array.from(this.terminals.values()).filter(t => t.status === 'active' && t.pty);
        for (const terminal of activeTerminals) {
            try {
                terminal.pty?.kill('SIGTERM');
                terminal.pty?.kill('SIGKILL');
            }
            catch (err) {
                // ignore
            }
            terminal.status = 'stale';
            terminal.pty = undefined;
            terminal.logStream?.end();
        }
        // Persist final state
        this.persistRuns();
        this.persistTerminals();
        console.log('🔧 Supervisor shutdown complete');
    }
}
exports.supervisor = new Supervisor();
