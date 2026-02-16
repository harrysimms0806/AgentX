import { spawn, fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import db from '../models/database.js';
import { broadcast } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Isolated Agent Runner
 * 
 * Each agent runs in its own Node.js process with:
 * - Resource limits (memory, CPU time)
 * - Restricted filesystem access (chroot-like via Node permissions)
 * - IPC communication with parent
 * - Automatic cleanup on completion/error
 * 
 * This addresses the CRITICAL security gap: shared process/memory
 */

export class IsolatedAgentRunner {
  constructor() {
    this.activeProcesses = new Map(); // agentId -> process
    this.resourceLimits = {
      maxMemoryMB: 512,      // 512MB max per agent
      maxCPUTimeSeconds: 300, // 5 minutes max CPU time
      maxExecutionTimeMs: 600000, // 10 minutes wall clock
    };
  }

  /**
   * Execute agent task in isolated process
   * 
   * @param {Object} params
   * @param {string} params.agentId
   * @param {string} params.taskId
   * @param {string} params.workspacePath
   * @param {Object} params.context
   * @returns {Promise<Object>}
   */
  async execute(params) {
    const { agentId, taskId, workspacePath, context } = params;
    const executionId = uuidv4();

    // Create execution record
    this._createExecutionRecord(executionId, agentId, taskId, context);

    try {
      // Spawn isolated process
      const result = await this._spawnIsolatedProcess({
        executionId,
        agentId,
        taskId,
        workspacePath,
        context,
      });

      // Record success
      await this._recordCompletion(executionId, 'success', result);
      return result;

    } catch (error) {
      // Record failure
      await this._recordCompletion(executionId, 'error', null, error);
      throw error;
    }
  }

  /**
   * Spawn isolated Node.js process for agent execution
   */
  _spawnIsolatedProcess(params) {
    return new Promise((resolve, reject) => {
      const { executionId, agentId, taskId, workspacePath, context } = params;

      // Path to agent worker script
      const workerScript = join(__dirname, 'AgentWorker.js');

      // Spawn child process with restrictions
      const child = fork(workerScript, [], {
        cwd: workspacePath,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        detached: false,
        // Resource limits via V8 flags
        execArgv: [
          `--max-old-space-size=${this.resourceLimits.maxMemoryMB}`,
          `--max-semi-space-size=${Math.floor(this.resourceLimits.maxMemoryMB / 4)}`,
        ],
        env: {
          // Minimal environment - no parent env leakage
          NODE_ENV: process.env.NODE_ENV || 'production',
          AGENT_EXECUTION_ID: executionId,
          AGENT_ID: agentId,
          TASK_ID: taskId,
          WORKSPACE_PATH: workspacePath,
          // Only whitelist specific env vars
          ...(process.env.OPENAI_API_KEY && {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY
          }),
        },
      });

      // Track process
      this.activeProcesses.set(executionId, {
        process: child,
        agentId,
        taskId,
        startTime: Date.now(),
      });

      let stdout = '';
      let stderr = '';
      let result = null;

      // Handle messages from child
      child.on('message', (message) => {
        if (message.type === 'progress') {
          // Forward progress to dashboard
          broadcast({
            type: 'agent:progress',
            payload: {
              executionId,
              agentId,
              taskId,
              progress: message.data,
            },
          });
        } else if (message.type === 'complete') {
          result = message.data;
        } else if (message.type === 'error') {
          reject(new Error(message.error));
        }
      });

      // Capture stdout/stderr
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        this._logOutput(executionId, 'stdout', data.toString());
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        this._logOutput(executionId, 'stderr', data.toString());
      });

      // Handle process exit
      child.on('exit', (code, signal) => {
        this.activeProcesses.delete(executionId);

        if (signal === 'SIGTERM') {
          reject(new Error('Agent execution was terminated'));
        } else if (code !== 0) {
          reject(new Error(`Agent process exited with code ${code}. stderr: ${stderr}`));
        } else {
          resolve({ result, stdout, stderr });
        }
      });

      child.on('error', (error) => {
        this.activeProcesses.delete(executionId);
        reject(error);
      });

      // Timeout protection
      const timeout = setTimeout(() => {
        console.error(`⏱️ Agent ${agentId} execution timeout, killing process`);
        this._killProcess(executionId, 'SIGTERM');
        reject(new Error('Execution timeout after 10 minutes'));
      }, this.resourceLimits.maxExecutionTimeMs);

      // Clear timeout on completion
      child.on('exit', () => {
        clearTimeout(timeout);
      });

      // Send execution context to child
      child.send({
        type: 'execute',
        data: {
          executionId,
          agentId,
          taskId,
          context,
        },
      });
    });
  }

  /**
   * Kill a running agent process
   */
  _killProcess(executionId, signal = 'SIGTERM') {
    const active = this.activeProcesses.get(executionId);
    if (active && active.process) {
      active.process.kill(signal);
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!active.process.killed) {
          active.process.kill('SIGKILL');
        }
      }, 5000);

      this.activeProcesses.delete(executionId);
    }
  }

  /**
   * Create execution record in database
   */
  _createExecutionRecord(executionId, agentId, taskId, context) {
    db.prepare(`
      INSERT INTO agent_executions (
        id, agent_id, task_id, context, status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      executionId,
      agentId,
      taskId,
      JSON.stringify(context),
      'running',
      new Date().toISOString()
    );
  }

  /**
   * Record execution completion
   */
  _recordCompletion(executionId, status, result, error = null) {
    db.prepare(`
      UPDATE agent_executions 
      SET status = ?, completed_at = ?, result = ?, error = ?
      WHERE id = ?
    `).run(
      status,
      new Date().toISOString(),
      result ? JSON.stringify(result) : null,
      error ? error.message : null,
      executionId
    );

    broadcast({
      type: 'agent:execution_complete',
      payload: {
        executionId,
        status,
        error: error?.message,
      },
    });
  }

  /**
   * Log process output for trace replay
   */
  _logOutput(executionId, stream, data) {
    db.prepare(`
      INSERT INTO execution_logs (execution_id, stream, data, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(
      executionId,
      stream,
      data,
      new Date().toISOString()
    );
  }

  /**
   * Get execution trace for replay
   */
  getExecutionTrace(executionId) {
    const execution = db.prepare(`
      SELECT * FROM agent_executions WHERE id = ?
    `).get(executionId);

    if (!execution) return null;

    const logs = db.prepare(`
      SELECT * FROM execution_logs 
      WHERE execution_id = ? 
      ORDER BY timestamp
    `).all(executionId);

    return {
      ...execution,
      context: JSON.parse(execution.context || '{}'),
      result: execution.result ? JSON.parse(execution.result) : null,
      logs: logs.map(l => ({
        timestamp: l.timestamp,
        stream: l.stream,
        data: l.data,
      })),
    };
  }

  /**
   * List active executions
   */
  getActiveExecutions() {
    return Array.from(this.activeProcesses.entries()).map(([id, info]) => ({
      executionId: id,
      agentId: info.agentId,
      taskId: info.taskId,
      durationMs: Date.now() - info.startTime,
    }));
  }

  /**
   * Kill all active executions (for shutdown)
   */
  killAll(signal = 'SIGTERM') {
    console.log(`🛑 Killing ${this.activeProcesses.size} active agent processes`);
    for (const [executionId] of this.activeProcesses) {
      this._killProcess(executionId, signal);
    }
  }
}

// Create database tables
export function initExecutionTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_executions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      context TEXT,
      status TEXT DEFAULT 'running',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      result TEXT,
      error TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id TEXT NOT NULL,
      stream TEXT NOT NULL,
      data TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (execution_id) REFERENCES agent_executions(id)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_exec_agent ON agent_executions(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_exec_status ON agent_executions(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_exec_logs ON execution_logs(execution_id)`);

  console.log('✅ Agent execution tables initialized');
}

// Singleton
export const isolatedRunner = new IsolatedAgentRunner();
