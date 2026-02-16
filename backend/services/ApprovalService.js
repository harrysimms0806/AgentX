import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import db from '../models/database.js';
import { configBridge } from './ConfigBridge.js';
import { riskEngine } from './RiskScoringEngine.js';

/**
 * Approval Service
 * 
 * Manages 2-step approval workflow for high-risk actions:
 * 1. Propose → creates approval request (with risk assessment)
 * 2. Approve/Deny → human in the loop
 * 3. Execute → only after approval
 * 
 * NEW: Risk-based intelligent approvals
 * - Auto-approve low risk actions
 * - Escalate high risk actions
 * - Show risk explanation to approver
 */

export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  EXPIRED: 'expired',
  EXECUTED: 'executed',
  AUTO_APPROVED: 'auto_approved',
};

export class ApprovalService {
  constructor() {
    this.defaultExpiryMinutes = 30;
    this.cleanupInterval = null;
    this.startCleanupInterval();
  }

  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Create approval request with intelligent risk assessment
   */
  async propose(params) {
    const {
      agentId,
      integration,
      actionType,
      action,
      payload,
      context = {},
      requestedBy,
      expiryMinutes = this.defaultExpiryMinutes,
    } = params;

    if (!agentId || !integration || !actionType) {
      throw new Error('agentId, integration, and actionType are required');
    }

    // Calculate risk assessment
    const riskAssessment = await riskEngine.calculateRisk({
      agentId,
      integration,
      actionType,
      context,
    });

    // Auto-approve low risk
    if (riskAssessment.recommendation.action === 'auto_approve') {
      console.log(`✅ Auto-approved: ${actionType} by ${agentId} (risk: ${riskAssessment.level})`);
      
      const autoId = 'auto-' + uuidv4();
      
      // Store auto-approval record
      db.prepare(`
        INSERT INTO approvals (
          id, agent_id, integration, action_type, action_summary, 
          payload_hash, context, requested_by, status, created_at, expires_at,
          risk_level, risk_score, risk_explanation, approved_by, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        autoId,
        agentId,
        integration,
        actionType,
        action || `${actionType} on ${integration}`,
        payload ? this._hashPayload(payload) : null,
        JSON.stringify(context),
        requestedBy,
        APPROVAL_STATUS.AUTO_APPROVED,
        new Date().toISOString(),
        new Date().toISOString(),
        riskAssessment.level,
        riskAssessment.score,
        JSON.stringify(riskAssessment.explanation),
        'system',
        new Date().toISOString()
      );

      return {
        id: autoId,
        status: APPROVAL_STATUS.AUTO_APPROVED,
        agentId,
        integration,
        actionType,
        action,
        riskAssessment,
        autoApproved: true,
        approvedAt: new Date().toISOString(),
        message: `Auto-approved: ${riskAssessment.recommendation.reason}`,
      };
    }

    // Create pending approval for higher risk
    const id = uuidv4();
    const payloadHash = payload ? this._hashPayload(payload) : null;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const summary = this._buildSummary(agentId, integration, actionType, action, context);

    db.prepare(`
      INSERT INTO approvals (
        id, agent_id, integration, action_type, action_summary, 
        payload_hash, context, requested_by, status, created_at, expires_at,
        risk_level, risk_score, risk_explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      integration,
      actionType,
      summary,
      payloadHash,
      JSON.stringify(context),
      requestedBy,
      APPROVAL_STATUS.PENDING,
      new Date().toISOString(),
      expiresAt.toISOString(),
      riskAssessment.level,
      riskAssessment.score,
      JSON.stringify(riskAssessment.explanation)
    );

    console.log(`📝 Approval proposed: ${id}`);
    console.log(`   Agent: ${agentId}`);
    console.log(`   Action: ${actionType} on ${integration}`);
    console.log(`   Risk: ${riskAssessment.level} (${riskAssessment.score}/100)`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);

    return {
      ...this._getApproval(id),
      riskAssessment,
    };
  }

  async approve(approvalId, approvedBy) {
    const approval = this._getApproval(approvalId);
    
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (approval.status !== APPROVAL_STATUS.PENDING) {
      throw new Error(`Approval ${approvalId} is not pending (status: ${approval.status})`);
    }

    if (new Date(approval.expiresAt) < new Date()) {
      await this._expire(approvalId);
      throw new Error(`Approval ${approvalId} has expired`);
    }

    db.prepare(`
      UPDATE approvals 
      SET status = ?, approved_by = ?, approved_at = ?
      WHERE id = ?
    `).run(
      APPROVAL_STATUS.APPROVED,
      approvedBy,
      new Date().toISOString(),
      approvalId
    );

    console.log(`✅ Approval granted: ${approvalId} by ${approvedBy}`);
    return this._getApproval(approvalId);
  }

  async deny(approvalId, deniedBy, reason) {
    const approval = this._getApproval(approvalId);
    
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (approval.status !== APPROVAL_STATUS.PENDING) {
      throw new Error(`Approval ${approvalId} is not pending`);
    }

    db.prepare(`
      UPDATE approvals 
      SET status = ?, denied_by = ?, denied_at = ?, denial_reason = ?
      WHERE id = ?
    `).run(
      APPROVAL_STATUS.DENIED,
      deniedBy,
      new Date().toISOString(),
      reason || 'No reason provided',
      approvalId
    );

    console.log(`❌ Approval denied: ${approvalId} by ${deniedBy}`);
    return this._getApproval(approvalId);
  }

  async markExecuted(approvalId, executionResult = {}) {
    const approval = this._getApproval(approvalId);
    
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (approval.status !== APPROVAL_STATUS.APPROVED && approval.status !== APPROVAL_STATUS.AUTO_APPROVED) {
      throw new Error(`Approval ${approvalId} must be approved before execution`);
    }

    db.prepare(`
      UPDATE approvals 
      SET status = ?, executed_at = ?, execution_result = ?
      WHERE id = ?
    `).run(
      APPROVAL_STATUS.EXECUTED,
      new Date().toISOString(),
      JSON.stringify(executionResult),
      approvalId
    );

    console.log(`▶️ Approval executed: ${approvalId}`);
    return this._getApproval(approvalId);
  }

  verifyPayload(approvalId, payload) {
    const approval = this._getApproval(approvalId);
    
    if (!approval || !approval.payloadHash) {
      return true;
    }

    const currentHash = this._hashPayload(payload);
    return currentHash === approval.payloadHash;
  }

  _getApproval(id) {
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    
    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      integration: row.integration,
      actionType: row.action_type,
      summary: row.action_summary,
      payloadHash: row.payload_hash,
      context: JSON.parse(row.context || '{}'),
      requestedBy: row.requested_by,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      deniedBy: row.denied_by,
      deniedAt: row.denied_at,
      denialReason: row.denial_reason,
      executedAt: row.executed_at,
      executionResult: row.execution_result ? JSON.parse(row.execution_result) : null,
      riskLevel: row.risk_level,
      riskScore: row.risk_score,
      riskExplanation: row.risk_explanation ? JSON.parse(row.risk_explanation) : [],
    };
  }

  list(filters = {}) {
    const { status, agentId, limit = 50, offset = 0 } = filters;
    
    let query = 'SELECT * FROM approvals';
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (agentId) {
      conditions.push('agent_id = ?');
      params.push(agentId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      integration: row.integration,
      actionType: row.action_type,
      summary: row.action_summary,
      requestedBy: row.requested_by,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      riskLevel: row.risk_level,
      riskScore: row.risk_score,
    }));
  }

  cleanupExpired() {
    const result = db.prepare(`
      UPDATE approvals 
      SET status = ?
      WHERE status = ? AND expires_at < datetime('now')
    `).run(APPROVAL_STATUS.EXPIRED, APPROVAL_STATUS.PENDING);

    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} expired approvals`);
    }

    return result.changes;
  }

  async _expire(approvalId) {
    db.prepare(`
      UPDATE approvals SET status = ? WHERE id = ?
    `).run(APPROVAL_STATUS.EXPIRED, approvalId);
  }

  _hashPayload(payload) {
    const str = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(str).digest('hex');
  }

  _buildSummary(agentId, integration, actionType, action, context) {
    const parts = [`${agentId} wants to ${actionType}`];
    
    if (action) {
      parts.push(`: ${action}`);
    }
    
    parts.push(` on ${integration}`);
    
    if (context.folder) {
      parts.push(` in ${context.folder}`);
    }
    
    return parts.join('');
  }

  getPendingCount() {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM approvals WHERE status = ?
    `).get(APPROVAL_STATUS.PENDING);
    
    return row.count;
  }

  /**
   * Get approval statistics with risk breakdown
   */
  getStats() {
    const stats = db.prepare(`
      SELECT 
        status,
        risk_level,
        COUNT(*) as count
      FROM approvals
      GROUP BY status, risk_level
    `).all();

    const result = {
      total: 0,
      pending: 0,
      approved: 0,
      denied: 0,
      autoApproved: 0,
      expired: 0,
      byRisk: {},
    };

    for (const row of stats) {
      result.total += row.count;
      
      if (row.status === APPROVAL_STATUS.PENDING) result.pending += row.count;
      if (row.status === APPROVAL_STATUS.APPROVED) result.approved += row.count;
      if (row.status === APPROVAL_STATUS.DENIED) result.denied += row.count;
      if (row.status === APPROVAL_STATUS.AUTO_APPROVED) result.autoApproved += row.count;
      if (row.status === APPROVAL_STATUS.EXPIRED) result.expired += row.count;

      if (!result.byRisk[row.risk_level]) {
        result.byRisk[row.risk_level] = 0;
      }
      result.byRisk[row.risk_level] += row.count;
    }

    return result;
  }
}

// Create database tables with risk fields
export function initApprovalsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      integration TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_summary TEXT NOT NULL,
      payload_hash TEXT,
      context TEXT,
      requested_by TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      approved_by TEXT,
      approved_at DATETIME,
      denied_by TEXT,
      denied_at DATETIME,
      denial_reason TEXT,
      executed_at DATETIME,
      execution_result TEXT,
      risk_level TEXT,
      risk_score INTEGER,
      risk_explanation TEXT
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_approvals_risk ON approvals(risk_level)`);

  console.log('✅ Approvals table initialized (with risk assessment)');
}

export const approvalService = new ApprovalService();
