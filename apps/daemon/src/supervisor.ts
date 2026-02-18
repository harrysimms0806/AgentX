// Process supervisor - manages all spawned processes
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { config } from './config';
import { Run } from '@agentx/api-types';

interface RunRecord extends Run {
  process?: ChildProcess;
  outputBuffer: string[];
  logStream?: fs.WriteStream;
}

class Supervisor {
  private runs: Map<string, RunRecord> = new Map();
  private logsDir: string;

  constructor() {
    this.logsDir = path.join(config.runtimeDir, 'logs');
  }

  async initialize(): Promise<void> {
    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
    
    // TODO: Load any persisted runs from database
    // For Phase 0, we start fresh
    
    console.log(`🔧 Supervisor initialized`);
  }

  /**
   * Create a new run record
   */
  createRun(
    projectId: string,
    type: 'agent' | 'command' | 'git' | 'index',
    ownerAgentId?: string
  ): RunRecord {
    const id = randomUUID();
    const run: RunRecord = {
      id,
      projectId,
      type,
      ownerAgentId,
      status: 'pending',
      logsPath: path.join(this.logsDir, `${id}.log`),
      outputBuffer: [],
    };

    this.runs.set(id, run);
    
    // Create log file
    run.logStream = fs.createWriteStream(run.logsPath);
    
    console.log(`▶️ Created run ${id} (${type})`);
    return run;
  }

  /**
   * Spawn a command
   * Phase 0: Basic skeleton - full implementation in Phase 3
   */
  async spawnCommand(
    runId: string,
    command: string,
    cwd: string,
    env?: Record<string, string>
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error('Run not found');

    run.status = 'running';
    run.startedAt = new Date().toISOString();

    // Parse command
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    // Spawn process
    const child = spawn(cmd, args, {
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
    }, config.defaultTimeout);
  }

  /**
   * Kill a run
   * Phase 0: Basic SIGTERM, escalate to SIGKILL after delay
   */
  async killRun(runId: string, reason: string = 'user'): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || !run.process) return false;

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
   * Cleanup old logs
   */
  rotateLogs(): void {
    const now = Date.now();
    const files = fs.readdirSync(this.logsDir);
    
    for (const file of files) {
      const filePath = path.join(this.logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > config.logRetention) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Rotated log: ${file}`);
      }
    }
  }
}

export const supervisor = new Supervisor();
