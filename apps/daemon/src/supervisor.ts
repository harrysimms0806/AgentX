// Process supervisor - manages all spawned processes
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Run } from '@agentx/api-types';

interface RunRecord extends Run {
  process?: ChildProcess;
  outputBuffer: string[];
  bufferedBytes: number;  // Track total bytes in buffer
  logStream?: fs.WriteStream;
  timeoutMs?: number;  // Per-run timeout override
}

class Supervisor {
  private runs: Map<string, RunRecord> = new Map();
  private logsDir: string = '';
  private runtimeDir: string = '';
  private defaultTimeout: number = 300000;
  private logRetention: number = 604800000;
  private maxLogSize: number = 10 * 1024 * 1024; // 10MB max log file size
  private maxOutputBuffer: number = 10 * 1024 * 1024; // 10MB max buffer size
  private initialized: boolean = false;
  private runsFile: string = '';
  private rotationInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    const { config } = await import('./config');
    this.logsDir = path.join(config.runtimeDir, 'logs');
    this.runtimeDir = config.runtimeDir;
    this.defaultTimeout = config.defaultTimeout;
    this.logRetention = config.logRetention;
    this.maxOutputBuffer = config.maxOutputBuffer;
    this.runsFile = path.join(config.runtimeDir, 'runs.json');
    this.initialized = true;
    
    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
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
  private persistRuns(): void {
    if (!this.runsFile) return;
    
    // Only persist metadata, not process handles
    const serializableRuns = Array.from(this.runs.values()).map(r => ({
      id: r.id,
      projectId: r.projectId,
      type: r.type,
      ownerAgentId: r.ownerAgentId,
      status: r.status,
      pid: r.process?.pid || r.pid,  // Persist PID if available
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      exitCode: r.exitCode,
      logsPath: r.logsPath,
      summary: r.summary,
    }));
    
    fs.writeFileSync(this.runsFile, JSON.stringify({ runs: serializableRuns }, null, 2));
  }

  /**
   * Load persisted runs and mark any "running" as stale
   */
  private async loadPersistedRuns(): Promise<void> {
    if (!fs.existsSync(this.runsFile)) return;
    
    try {
      const data = JSON.parse(fs.readFileSync(this.runsFile, 'utf8'));
      const persistedRuns: Run[] = data.runs || [];
      
      for (const run of persistedRuns) {
        // Mark previously running runs as stale
        if (run.status === 'running') {
          run.status = 'error';
          run.summary = 'Daemon restart - session stale';
          run.endedAt = new Date().toISOString();
          console.log(`⚠️ Marked stale run: ${run.id}`);
        }
        
        // Reconstruct RunRecord without process handle
        const runRecord: RunRecord = {
          ...run,
          outputBuffer: [],
          bufferedBytes: 0,
          logsPath: run.logsPath || path.join(this.logsDir, `${run.id}.log`),
        };
        
        this.runs.set(run.id, runRecord);
      }
      
      if (persistedRuns.length > 0) {
        console.log(`📋 Loaded ${persistedRuns.length} persisted run(s), marked stale sessions`);
        this.persistRuns(); // Save updated statuses
      }
    } catch (err) {
      console.warn('Failed to load persisted runs:', err);
    }
  }

  /**
   * Create a new run record
   * @param timeoutMs - Optional timeout in milliseconds (clamped to safe max)
   */
  createRun(
    projectId: string,
    type: 'agent' | 'command' | 'git' | 'index',
    ownerAgentId?: string,
    timeoutMs?: number
  ): RunRecord {
    const id = randomUUID();
    
    // Clamp timeout to safe range (1 min to 30 min)
    const MAX_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const MIN_TIMEOUT = 60 * 1000; // 1 minute
    const effectiveTimeout = timeoutMs 
      ? Math.max(MIN_TIMEOUT, Math.min(timeoutMs, MAX_TIMEOUT))
      : undefined;
    
    const run: RunRecord = {
      id,
      projectId,
      type,
      ownerAgentId,
      status: 'pending',
      logsPath: path.join(this.logsDir, `${id}.log`),
      outputBuffer: [],
      bufferedBytes: 0,
      timeoutMs: effectiveTimeout,
    };

    this.runs.set(id, run);
    
    // Create log file
    run.logStream = fs.createWriteStream(run.logsPath);
    
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
  async spawnCommand(
    runId: string,
    cmd: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error('Run not found');

    run.status = 'running';
    run.startedAt = new Date().toISOString();

    // Spawn process with structured command
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    run.process = child;
    run.pid = child.pid;  // Track PID for diagnostics and persistence
    
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
  async killRun(runId: string, reason: string = 'user'): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || !run.process) return false;

    const pid = run.process.pid;
    if (!pid) {
      // No PID available, can't do reliable kill escalation
      console.log(`🛑 Killing run ${runId} (${reason}) - no PID available`);
      run.process.kill('SIGTERM');
      run.status = 'killed';
      run.endedAt = new Date().toISOString();
      run.summary = `Killed: ${reason}`;
      this.persistRuns();
      return true;
    }

    console.log(`🛑 Killing run ${runId} (${reason})`);
    let killTimer: NodeJS.Timeout | null = null;

    // Try graceful termination first
    run.process.kill('SIGTERM');
    
    // Escalate to SIGKILL after 5 seconds if process still alive
    killTimer = setTimeout(() => {
      // Check if process is still alive using kill(pid, 0)
      try {
        process.kill(pid, 0); // Throws if process doesn't exist
        console.log(`💀 Force killing run ${runId} (SIGKILL)`);
        process.kill(pid, 'SIGKILL');
      } catch (err) {
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
    
    return true;
  }

  /**
   * List runs with optional project filter
   */
  listRuns(projectId?: string): Run[] {
    return Array.from(this.runs.values())
      .filter(r => !projectId || r.projectId === projectId)
      .map(r => ({
        id: r.id,
        projectId: r.projectId,
        type: r.type,
        ownerAgentId: r.ownerAgentId,
        status: r.status,
        pid: r.pid,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        exitCode: r.exitCode,
        logsPath: r.logsPath,
        summary: r.summary,
      }));
  }

  /**
   * Cleanup stale completed runs older than maxAgeMs
   */
  cleanupRuns(projectId?: string, maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const run of Array.from(this.runs.values())) {
      if (!run.endedAt || run.status === 'running') continue;
      if (projectId && run.projectId !== projectId) continue;

      const age = now - new Date(run.endedAt).getTime();
      if (age > maxAgeMs) {
        this.runs.delete(run.id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.persistRuns();
    }

    return cleaned;
  }


  /**
   * Get run status
   */
  getRun(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  /**
   * Get all runs for a project
   */
  getProjectRuns(projectId: string): Run[] {
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
  getRunOutput(runId: string, lines: number = 50): string[] {
    const run = this.runs.get(runId);
    if (!run) return [];
    return run.outputBuffer.slice(-lines);
  }

  /**
   * Check log file size and rotate if exceeded
   */
  private checkLogSize(run: RunRecord): void {
    if (!run.logsPath || !fs.existsSync(run.logsPath)) return;
    
    try {
      const stats = fs.statSync(run.logsPath);
      if (stats.size > this.maxLogSize) {
        // Rotate: close current, rename to .1, create new
        run.logStream?.end();
        
        const rotatedPath = `${run.logsPath}.1`;
        if (fs.existsSync(rotatedPath)) {
          fs.unlinkSync(rotatedPath);
        }
        fs.renameSync(run.logsPath, rotatedPath);
        
        run.logStream = fs.createWriteStream(run.logsPath);
        run.logStream.write(`--- Log rotated at ${new Date().toISOString()} ---\n`);
        
        console.log(`🔄 Rotated log for run ${run.id}`);
      }
    } catch (err) {
      // Ignore errors during size check
    }
  }

  /**
   * Mark stale sessions on restart
   * Call this on daemon startup
   */
  markStaleSessions(): void {
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
  rotateLogs(): void {
    const now = Date.now();
    const files = fs.readdirSync(this.logsDir);
    
    let totalSize = 0;
    const logFiles: { path: string; mtime: number; size: number }[] = [];
    
    // Collect all log files with metadata
    for (const file of files) {
      const filePath = path.join(this.logsDir, file);
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        logFiles.push({ path: filePath, mtime: stats.mtimeMs, size: stats.size });
      } catch (err) {
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
          fs.unlinkSync(file.path);
          totalSize -= file.size;
          console.log(`🗑️ Rotated log: ${path.basename(file.path)} (${ageExceeded ? 'age' : 'size'})`);
        } catch (err) {
          // Ignore errors during cleanup
        }
      }
    }
  }
  
  /**
   * List all runs (public method for route encapsulation)
   */
  listRuns(projectId?: string): Run[] {
    let runs = Array.from(this.runs.values());
    if (projectId) {
      runs = runs.filter(r => r.projectId === projectId);
    }
    return runs.map(r => ({
      id: r.id,
      projectId: r.projectId,
      type: r.type,
      ownerAgentId: r.ownerAgentId,
      status: r.status,
      pid: r.pid,
      timeoutMs: r.timeoutMs,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      exitCode: r.exitCode,
      logsPath: r.logsPath,
      summary: r.summary,
    }));
  }

  /**
   * Cleanup old runs (public method for route encapsulation)
   */
  cleanupRuns(projectId?: string, maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    let cleaned = 0;
    
    for (const run of this.runs.values()) {
      // Clean up completed/error/killed runs older than maxAge
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

  /**
   * Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }

    // Kill all running processes before persisting
    const runningRuns = Array.from(this.runs.values()).filter(r => r.status === 'running');
    if (runningRuns.length > 0) {
      console.log(`🛑 Shutting down ${runningRuns.length} running process(es)...`);

      // Create kill promises for all running processes
      const killPromises = runningRuns.map(run => {
        return new Promise<void>((resolve) => {
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
            } catch (err) {
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
            } catch (err) {
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

    // Persist final state
    this.persistRuns();
    console.log('🔧 Supervisor shutdown complete');
  }
}

export const supervisor = new Supervisor();
