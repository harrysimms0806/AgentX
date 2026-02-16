import db from '../models/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Audit Logger
 * 
 * Records every policy check attempt, whether allowed or denied.
 * Immutable audit trail for compliance and debugging.
 */

export const AUDIT_RESULT = {
  ALLOWED: 'allowed',
  DENIED: 'denied',
  REQUIRES_APPROVAL: 'requires_approval',
  ERROR: 'error',
};

export class AuditLogger {
  constructor() {
    this.batchSize = 100;
    this.flushInterval = 5000; // 5 seconds
    this.buffer = [];
    this.startFlushInterval();
  }

  /**
   * Start periodic flush of buffered logs
   */
  startFlushInterval() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop flush interval
   */
  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
    this.flush();
  }

  /**
   * Log a policy check
   * 
   * @param {Object} params
   * @param {string} params.agentId
   * @param {string} params.integration
   * @param {string} params.actionType - read/write/exec/admin
   * @param {string} params.result - allowed/denied/requires_approval/error
   * @param {string} params.reason - Policy reason code
   * @param {string} params.requestId - Unique request ID
   * @param {string} params.userId - User making request (if applicable)
   * @param {string} params.approvalId - Approval ID (if applicable)
   * @param {Object} params.context - Additional context
   * @param {number} params.durationMs - How long the check took
   */
  log(params) {
    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...params,
    };

    // Add to buffer
    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }

    // Also console log for development
    if (process.env.NODE_ENV === 'development') {
      const icon = entry.result === AUDIT_RESULT.ALLOWED ? '✅' : 
                   entry.result === AUDIT_RESULT.DENIED ? '❌' : 
                   entry.result === AUDIT_RESULT.REQUIRES_APPROVAL ? '⏸️' : '⚠️';
      console.log(`${icon} AUDIT: ${entry.agentId} ${entry.actionType} ${entry.integration} = ${entry.result}`);
    }
  }

  /**
   * Flush buffered logs to database
   */
  flush() {
    if (this.buffer.length === 0) return;

    const insert = db.prepare(`
      INSERT INTO audit_log (
        id, timestamp, agent_id, integration, action_type,
        result, reason, request_id, user_id, approval_id,
        context, duration_ms
      ) VALUES (
        @id, @timestamp, @agentId, @integration, @actionType,
        @result, @reason, @requestId, @userId, @approvalId,
        @context, @durationMs
      )
    `);

    const insertMany = db.transaction((entries) => {
      for (const entry of entries) {
        insert.run({
          id: entry.id,
          timestamp: entry.timestamp,
          agentId: entry.agentId,
          integration: entry.integration,
          actionType: entry.actionType,
          result: entry.result,
          reason: entry.reason,
          requestId: entry.requestId,
          userId: entry.userId || null,
          approvalId: entry.approvalId || null,
          context: entry.context ? JSON.stringify(entry.context) : null,
          durationMs: entry.durationMs || 0,
        });
      }
    });

    try {
      insertMany(this.buffer);
      console.log(`📝 Flushed ${this.buffer.length} audit entries`);
      this.buffer = [];
    } catch (error) {
      console.error('❌ Failed to flush audit log:', error);
      // Keep buffer for retry
    }
  }

  /**
   * Query audit log
   * 
   * @param {Object} filters
   * @param {string} filters.agentId
   * @param {string} filters.integration
   * @param {string} filters.actionType
   * @param {string} filters.result
   * @param {string} filters.startDate - ISO date
   * @param {string} filters.endDate - ISO date
   * @param {number} filters.limit
   * @param {number} filters.offset
   */
  query(filters = {}) {
    const {
      agentId,
      integration,
      actionType,
      result,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    let query = 'SELECT * FROM audit_log';
    const params = [];
    const conditions = [];

    if (agentId) {
      conditions.push('agent_id = ?');
      params.push(agentId);
    }

    if (integration) {
      conditions.push('integration = ?');
      params.push(integration);
    }

    if (actionType) {
      conditions.push('action_type = ?');
      params.push(actionType);
    }

    if (result) {
      conditions.push('result = ?');
      params.push(result);
    }

    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      agentId: row.agent_id,
      integration: row.integration,
      actionType: row.action_type,
      result: row.result,
      reason: row.reason,
      requestId: row.request_id,
      userId: row.user_id,
      approvalId: row.approval_id,
      context: row.context ? JSON.parse(row.context) : null,
      durationMs: row.duration_ms,
    }));
  }

  /**
   * Get summary statistics
   */
  getSummary(filters = {}) {
    const { agentId, startDate, endDate } = filters;

    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN result = 'allowed' THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN result = 'denied' THEN 1 ELSE 0 END) as denied,
        SUM(CASE WHEN result = 'requires_approval' THEN 1 ELSE 0 END) as requiresApproval,
        SUM(CASE WHEN result = 'error' THEN 1 ELSE 0 END) as errors
      FROM audit_log
    `;

    const params = [];
    const conditions = [];

    if (agentId) {
      conditions.push('agent_id = ?');
      params.push(agentId);
    }

    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const row = db.prepare(query).get(...params);

    return {
      total: row.total,
      allowed: row.allowed,
      denied: row.denied,
      requiresApproval: row.requiresApproval,
      errors: row.errors,
    };
  }

  /**
   * Get recent activity for an agent
   */
  getAgentActivity(agentId, limit = 20) {
    return this.query({ agentId, limit });
  }

  /**
   * Export audit log (for compliance)
   */
  export(filters = {}) {
    const entries = this.query({ ...filters, limit: 10000 });
    
    return {
      exportedAt: new Date().toISOString(),
      filters,
      count: entries.length,
      entries,
    };
  }
}

/**
 * Create audit log table
 */
export function initAuditTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      agent_id TEXT NOT NULL,
      integration TEXT NOT NULL,
      action_type TEXT NOT NULL,
      result TEXT NOT NULL,
      reason TEXT,
      request_id TEXT,
      user_id TEXT,
      approval_id TEXT,
      context TEXT,
      duration_ms INTEGER
    )
  `);

  // Indexes for common queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_log(result)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_integration ON audit_log(integration)`);

  console.log('✅ Audit log table initialized');
}

// Singleton
export const auditLogger = new AuditLogger();
