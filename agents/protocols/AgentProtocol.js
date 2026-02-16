import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../backend/models/database.js';
import { broadcast } from '../../backend/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Agent Protocol - Handles execution with proper failure handling
 * 
 * Rules:
 * 1. Agent fails → STOP immediately
 * 2. Log the failure
 * 3. Broadcast status change
 * 4. NEVER auto-retry without user approval
 * 5. Wait for explicit user direction
 */

export class AgentProtocol {
  constructor(agentId) {
    this.agentId = agentId;
    this.currentTask = null;
    this.process = null;
  }

  /**
   * Execute a task with full error handling
   */
  async execute(task) {
    this.currentTask = task;
    
    // 1. Set agent to working
    this._setAgentStatus('working');
    
    // 2. Set task to running
    this._setTaskStatus('running');
    
    // 3. Create workspace lock
    this._createLock(task);

    try {
      // 4. Log start
      this._log(task.id, 'info', `Task started: ${task.title}`);

      // 5. Execute based on agent type
      const result = await this._runAgent(task);

      // 6. Success path
      this._setAgentStatus('success');
      this._setTaskStatus('completed', { cost: result.cost });
      this._log(task.id, 'info', 'Task completed successfully');
      this._releaseLock();

      return { success: true, result };

    } catch (error) {
      // 7. FAILURE PATH - STOP EVERYTHING
      this._handleFailure(error, task);
      throw error;
    }
  }

  /**
   * Handle failure - NEVER auto-retry
   */
  _handleFailure(error, task) {
    // Set agent to error state
    this._setAgentStatus('error');
    
    // Set task to failed
    this._setTaskStatus('failed', {
      error: {
        code: error.code || 'EXECUTION_ERROR',
        message: error.message,
        recoverable: this._isRecoverable(error),
      }
    });

    // Log the failure
    this._log(task.id, 'error', `Task failed: ${error.message}`, {
      stack: error.stack,
      code: error.code,
    });

    // Release lock
    this._releaseLock();

    // Broadcast to dashboard
    broadcast({
      type: 'agent:error',
      payload: {
        agentId: this.agentId,
        taskId: task.id,
        error: {
          message: error.message,
          recoverable: this._isRecoverable(error),
        }
      }
    });
  }

  /**
   * Determine if error is recoverable
   */
  _isRecoverable(error) {
    // Non-recoverable errors
    const fatalCodes = [
      'GIT_CONFLICT',
      'SCHEMA_MISMATCH',
      'PERMISSION_DENIED',
      'FILE_NOT_FOUND',
    ];
    
    if (fatalCodes.includes(error.code)) return false;
    
    // API errors might be recoverable
    if (error.code === 'API_ERROR') return true;
    if (error.code === 'TIMEOUT') return true;
    
    return false;
  }

  /**
   * Run the actual agent (to be implemented by subclasses)
   */
  async _runAgent(task) {
    throw new Error('_runAgent must be implemented by subclass');
  }

  /**
   * Set agent status in DB and broadcast
   */
  _setAgentStatus(status) {
    db.prepare('UPDATE agents SET status = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, this.agentId);
    
    broadcast({
      type: 'agent:status',
      payload: { agentId: this.agentId, status }
    });
  }

  /**
   * Set task status in DB and broadcast
   */
  _setTaskStatus(status, extra = {}) {
    if (!this.currentTask) return;

    const timestampFields = {
      running: 'started_at',
      completed: 'completed_at',
      failed: 'completed_at',
    };

    let query = 'UPDATE tasks SET status = ?';
    const params = [status];

    if (timestampFields[status]) {
      query += `, ${timestampFields[status]} = CURRENT_TIMESTAMP`;
    }

    if (extra.cost) {
      query += ', cost = ?';
      params.push(extra.cost);
    }

    if (extra.error) {
      query += ', error_code = ?, error_message = ?, error_recoverable = ?';
      params.push(extra.error.code, extra.error.message, extra.error.recoverable);
    }

    query += ' WHERE id = ?';
    params.push(this.currentTask.id);

    db.prepare(query).run(...params);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(this.currentTask.id);
    broadcast({
      type: 'task:update',
      payload: { ...task, context: JSON.parse(task.context || '{}') }
    });
  }

  /**
   * Create workspace lock
   */
  _createLock(task) {
    const { v4: uuidv4 } = await import('uuid');
    
    const lockId = uuidv4();
    db.prepare(`
      INSERT INTO workspace_locks (id, project_id, agent_id, task_id, folder_path, git_root)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(lockId, task.projectId, this.agentId, task.id, task.workspacePath, task.gitRoot);

    this.lockId = lockId;
  }

  /**
   * Release workspace lock
   */
  _releaseLock() {
    if (this.lockId) {
      db.prepare('DELETE FROM workspace_locks WHERE id = ?').run(this.lockId);
      broadcast({
        type: 'workspace:unlock',
        payload: { lockId: this.lockId }
      });
      this.lockId = null;
    }
  }

  /**
   * Log message
   */
  _log(taskId, level, message, metadata = {}) {
    db.prepare(`
      INSERT INTO task_logs (task_id, level, message, metadata)
      VALUES (?, ?, ?, ?)
    `).run(taskId, level, message, JSON.stringify(metadata));

    broadcast({
      type: 'task:log',
      payload: { taskId, log: { level, message, timestamp: new Date().toISOString() } }
    });
  }

  /**
   * Kill running process
   */
  kill() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    
    if (this.currentTask) {
      this._setTaskStatus('cancelled');
      this._releaseLock();
      this._setAgentStatus('idle');
    }
  }
}
