import db from '../models/database.js';
import { broadcast } from '../server.js';
import { auditLogger } from './AuditLogger.js';
import { configBridge } from './ConfigBridge.js';

/**
 * Task Retry Service (P3)
 * 
 * Automatic retry logic for failed tasks with exponential backoff.
 * Tracks retry history and respects maximum retry limits.
 * 
 * Features:
 * - Exponential backoff (2^n seconds)
 * - Maximum retry limits per task
 * - Retry history tracking
 * - Configurable retry policies
 * - Circuit breaker pattern for failing agents
 */

export class TaskRetryService {
  constructor() {
    this.retryQueue = new Map(); // taskId -> { attempts, nextRetry, backoffMs }
    this.retryHistory = new Map(); // taskId -> [retry records]
    this.circuitBreakers = new Map(); // agentId -> { failures, lastFailure, open }
    this.isRunning = false;
    this.pollInterval = null;
    
    // Default config
    this.config = {
      maxRetries: 3,
      baseBackoffMs: 2000, // 2 seconds
      maxBackoffMs: 60000, // 1 minute
      circuitBreakerThreshold: 5,
      circuitBreakerTimeoutMs: 300000, // 5 minutes
    };
  }

  /**
   * Initialize the retry service
   */
  async initialize() {
    console.log('🔄 TaskRetryService: Initializing...');
    
    // Reset any tasks stuck in retry state
    this.resetStaleRetries();
    
    // Start the retry poll loop
    this.startRetryLoop();
    
    console.log('✅ TaskRetryService: Ready');
    console.log(`   Max retries: ${this.config.maxRetries}`);
    console.log(`   Base backoff: ${this.config.baseBackoffMs}ms`);
  }

  /**
   * Reset tasks stuck in retry state from previous session
   */
  resetStaleRetries() {
    const result = db.prepare(`
      UPDATE tasks 
      SET status = 'failed',
          error_message = 'Server restart - retry interrupted'
      WHERE status = 'retrying'
    `).run();
    
    if (result.changes > 0) {
      console.log(`   Reset ${result.changes} stale retrying tasks`);
    }
  }

  /**
   * Start the retry polling loop
   */
  startRetryLoop() {
    this.isRunning = true;
    
    const poll = async () => {
      if (!this.isRunning) return;
      
      try {
        await this.processRetries();
      } catch (err) {
        console.error('❌ Retry loop error:', err);
      }
      
      this.pollInterval = setTimeout(poll, 5000); // Check every 5 seconds
    };
    
    poll();
    console.log('   Retry loop started (5s interval)');
  }

  /**
   * Process tasks that are due for retry
   */
  async processRetries() {
    const now = Date.now();
    const tasksToRetry = [];

    // Find tasks in retry queue that are due
    for (const [taskId, retryInfo] of this.retryQueue) {
      if (retryInfo.nextRetry <= now) {
        tasksToRetry.push(taskId);
      }
    }

    if (tasksToRetry.length === 0) return;

    console.log(`🔄 Processing ${tasksToRetry.length} tasks for retry`);

    for (const taskId of tasksToRetry) {
      await this.executeRetry(taskId);
    }
  }

  /**
   * Schedule a task for retry
   */
  scheduleRetry(taskId, error) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return false;

    // Get current retry info
    const retryInfo = this.retryQueue.get(taskId) || {
      attempts: 0,
      nextRetry: Date.now(),
      backoffMs: this.config.baseBackoffMs,
    };

    // Check if we've exceeded max retries
    if (retryInfo.attempts >= this.config.maxRetries) {
      console.log(`   Task ${taskId} exceeded max retries (${this.config.maxRetries})`);
      this.permanentlyFailTask(taskId, 'Max retries exceeded');
      return false;
    }

    // Check circuit breaker for agent
    if (this.isCircuitBreakerOpen(task.agent_id)) {
      console.log(`   Circuit breaker open for agent ${task.agent_id}, delaying retry`);
      retryInfo.nextRetry = Date.now() + this.config.circuitBreakerTimeoutMs;
      this.retryQueue.set(taskId, retryInfo);
      return false;
    }

    // Increment attempts
    retryInfo.attempts++;
    
    // Calculate exponential backoff
    const backoffMs = Math.min(
      this.config.baseBackoffMs * Math.pow(2, retryInfo.attempts - 1),
      this.config.maxBackoffMs
    );
    
    retryInfo.backoffMs = backoffMs;
    retryInfo.nextRetry = Date.now() + backoffMs;
    retryInfo.lastError = error;

    // Update queue
    this.retryQueue.set(taskId, retryInfo);

    // Add to history
    const history = this.retryHistory.get(taskId) || [];
    history.push({
      attempt: retryInfo.attempts,
      timestamp: Date.now(),
      error: error?.message || error,
      backoffMs,
    });
    this.retryHistory.set(taskId, history);

    // Update task status
    db.prepare(`
      UPDATE tasks 
      SET status = 'retrying',
          error_message = ?
      WHERE id = ?
    `).run(
      `Retry ${retryInfo.attempts}/${this.config.maxRetries} scheduled in ${Math.round(backoffMs / 1000)}s: ${error?.message || error}`,
      taskId
    );

    // Log
    auditLogger.log({
      actionType: 'task',
      action: 'task_retry_scheduled',
      agentId: task.agent_id,
      details: {
        taskId,
        attempt: retryInfo.attempts,
        maxRetries: this.config.maxRetries,
        backoffMs,
        error: error?.message || error,
      },
    });

    // Broadcast
    broadcast({
      type: 'task:retry',
      payload: {
        taskId,
        attempt: retryInfo.attempts,
        maxRetries: this.config.maxRetries,
        backoffMs,
        nextRetry: retryInfo.nextRetry,
      }
    });

    console.log(`   Task ${taskId} scheduled for retry ${retryInfo.attempts}/${this.config.maxRetries} in ${Math.round(backoffMs / 1000)}s`);
    return true;
  }

  /**
   * Execute a retry for a task
   */
  async executeRetry(taskId) {
    const retryInfo = this.retryQueue.get(taskId);
    if (!retryInfo) return;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      this.retryQueue.delete(taskId);
      return;
    }

    console.log(`   Executing retry ${retryInfo.attempts} for task ${taskId}`);

    // Reset task to pending status
    db.prepare(`
      UPDATE tasks 
      SET status = 'pending',
          error_message = NULL,
          error_code = NULL
      WHERE id = ?
    `).run(taskId);

    // Remove from retry queue (it will be picked up by task runner)
    this.retryQueue.delete(taskId);

    // Log
    auditLogger.log({
      actionType: 'task',
      action: 'task_retry_executed',
      agentId: task.agent_id,
      details: {
        taskId,
        attempt: retryInfo.attempts,
      },
    });

    // Broadcast
    broadcast({
      type: 'task:status',
      payload: {
        taskId,
        status: 'pending',
        message: `Retry ${retryInfo.attempts} initiated`,
      }
    });
  }

  /**
   * Handle task failure - decide whether to retry or permanently fail
   */
  handleTaskFailure(taskId, error) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return;

    // Record failure for circuit breaker
    this.recordAgentFailure(task.agent_id, error);

    // Check if error is retryable
    if (!this.isRetryableError(error)) {
      console.log(`   Error not retryable for task ${taskId}: ${error.message}`);
      this.permanentlyFailTask(taskId, error.message);
      return;
    }

    // Schedule retry
    const scheduled = this.scheduleRetry(taskId, error);
    
    if (!scheduled) {
      // Retry not scheduled (max retries exceeded or circuit breaker)
      this.permanentlyFailTask(taskId, error.message);
    }
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error) {
    const nonRetryableErrors = [
      'Spawn failed',
      'Agent not found',
      'Invalid workspace',
      'Permission denied',
    ];

    const errorMessage = error?.message || String(error);
    
    // Check against non-retryable patterns
    for (const pattern of nonRetryableErrors) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Permanently fail a task
   */
  permanentlyFailTask(taskId, reason) {
    db.prepare(`
      UPDATE tasks 
      SET status = 'failed',
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, taskId);

    // Cleanup retry queue
    this.retryQueue.delete(taskId);

    // Broadcast
    broadcast({
      type: 'task:status',
      payload: {
        taskId,
        status: 'failed',
        error: reason,
        final: true,
      }
    });

    console.log(`   Task ${taskId} permanently failed: ${reason}`);
  }

  /**
   * Record agent failure for circuit breaker
   */
  recordAgentFailure(agentId, error) {
    const cb = this.circuitBreakers.get(agentId) || {
      failures: 0,
      lastFailure: null,
      open: false,
    };

    cb.failures++;
    cb.lastFailure = Date.now();

    // Check if we should open the circuit
    if (cb.failures >= this.config.circuitBreakerThreshold) {
      cb.open = true;
      console.warn(`🔴 Circuit breaker opened for agent ${agentId} (${cb.failures} failures)`);
      
      // Log
      auditLogger.log({
        actionType: 'agent',
        action: 'circuit_breaker_opened',
        agentId,
        details: {
          failures: cb.failures,
          threshold: this.config.circuitBreakerThreshold,
        },
      });
    }

    this.circuitBreakers.set(agentId, cb);
  }

  /**
   * Check if circuit breaker is open for an agent
   */
  isCircuitBreakerOpen(agentId) {
    const cb = this.circuitBreakers.get(agentId);
    if (!cb) return false;

    // If circuit is open, check if we should close it (cooldown expired)
    if (cb.open) {
      const elapsed = Date.now() - cb.lastFailure;
      if (elapsed > this.config.circuitBreakerTimeoutMs) {
        // Close the circuit
        cb.open = false;
        cb.failures = 0;
        this.circuitBreakers.set(agentId, cb);
        console.log(`🟢 Circuit breaker closed for agent ${agentId}`);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record agent success (resets circuit breaker)
   */
  recordAgentSuccess(agentId) {
    const cb = this.circuitBreakers.get(agentId);
    if (cb) {
      cb.failures = 0;
      cb.open = false;
      this.circuitBreakers.set(agentId, cb);
    }
  }

  /**
   * Cancel retries for a task
   */
  cancelRetries(taskId) {
    const existed = this.retryQueue.has(taskId);
    this.retryQueue.delete(taskId);
    
    if (existed) {
      console.log(`   Cancelled retries for task ${taskId}`);
    }
    
    return existed;
  }

  /**
   * Get retry status for a task
   */
  getRetryStatus(taskId) {
    const retryInfo = this.retryQueue.get(taskId);
    const history = this.retryHistory.get(taskId) || [];

    if (!retryInfo) {
      return {
        hasRetries: false,
        history: history,
      };
    }

    return {
      hasRetries: true,
      attempts: retryInfo.attempts,
      maxRetries: this.config.maxRetries,
      nextRetry: retryInfo.nextRetry,
      backoffMs: retryInfo.backoffMs,
      lastError: retryInfo.lastError,
      history: history,
    };
  }

  /**
   * Get all pending retries
   */
  getPendingRetries() {
    const retries = [];
    const now = Date.now();

    for (const [taskId, retryInfo] of this.retryQueue) {
      retries.push({
        taskId,
        ...retryInfo,
        due: retryInfo.nextRetry <= now,
        timeUntilRetry: Math.max(0, retryInfo.nextRetry - now),
      });
    }

    return retries;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(agentId) {
    if (agentId) {
      return this.circuitBreakers.get(agentId) || { failures: 0, open: false };
    }

    // Return all circuit breakers
    const all = {};
    for (const [id, cb] of this.circuitBreakers) {
      all[id] = cb;
    }
    return all;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pendingRetries: this.retryQueue.size,
      circuitBreakers: this.circuitBreakers.size,
      config: this.config,
    };
  }

  /**
   * Stop the service
   */
  stop() {
    console.log('🛑 TaskRetryService: Stopping...');
    this.isRunning = false;
    
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }

    console.log('✅ TaskRetryService: Stopped');
  }
}

// Export singleton
export const taskRetryService = new TaskRetryService();
export default taskRetryService;
