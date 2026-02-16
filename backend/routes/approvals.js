import { Router } from 'express';
import { approvalService, APPROVAL_STATUS } from '../services/ApprovalService.js';
import { policyEngine } from '../services/PolicyEngine.js';
import { auditLogger, AUDIT_RESULT } from '../services/AuditLogger.js';

const router = Router();

/**
 * GET /approvals
 * List approval requests
 */
router.get('/', (req, res) => {
  const { status, agentId, limit, offset } = req.query;
  
  const approvals = approvalService.list({
    status,
    agentId,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
  });

  res.json({
    success: true,
    data: approvals,
  });
});

/**
 * GET /approvals/pending-count
 * Get count of pending approvals (for dashboard badge)
 */
router.get('/pending-count', (req, res) => {
  const count = approvalService.getPendingCount();

  res.json({
    success: true,
    data: { count },
  });
});

/**
 * GET /approvals/:id
 * Get specific approval request
 */
router.get('/:id', (req, res) => {
  const approval = approvalService._getApproval(req.params.id);
  
  if (!approval) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Approval request not found' },
    });
  }

  res.json({
    success: true,
    data: approval,
  });
});

/**
 * POST /approvals
 * Create new approval request (propose action)
 */
router.post('/', async (req, res) => {
  try {
    const {
      agentId,
      integration,
      actionType,
      action,
      payload,
      context,
      expiryMinutes,
    } = req.body;

    // Validate required fields
    if (!agentId || !integration || !actionType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'agentId, integration, and actionType are required',
        },
      });
    }

    // Check if policy actually requires approval
    const policyCheck = policyEngine.check({
      agentId,
      integration,
      actionType,
      context,
    });

    if (!policyCheck.requiresApproval && policyCheck.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'APPROVAL_NOT_REQUIRED',
          message: 'This action does not require approval. Execute directly.',
        },
      });
    }

    // Create approval request
    const approval = await approvalService.propose({
      agentId,
      integration,
      actionType,
      action,
      payload,
      context,
      requestedBy: req.user?.id || agentId,
      expiryMinutes,
    });

    res.status(201).json({
      success: true,
      data: approval,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'PROPOSAL_FAILED', message: error.message },
    });
  }
});

/**
 * POST /approvals/:id/approve
 * Approve a pending request
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const approval = await approvalService.approve(
      req.params.id,
      req.user?.id || 'admin'
    );

    // Log approval
    auditLogger.log({
      agentId: approval.agentId,
      integration: approval.integration,
      actionType: 'admin', // approving is an admin action
      result: AUDIT_RESULT.ALLOWED,
      reason: 'APPROVAL_GRANTED',
      requestId: req.headers['x-request-id'],
      userId: req.user?.id,
      approvalId: approval.id,
    });

    res.json({
      success: true,
      data: approval,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'APPROVAL_FAILED', message: error.message },
    });
  }
});

/**
 * POST /approvals/:id/deny
 * Deny a pending request
 */
router.post('/:id/deny', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const approval = await approvalService.deny(
      req.params.id,
      req.user?.id || 'admin',
      reason
    );

    // Log denial
    auditLogger.log({
      agentId: approval.agentId,
      integration: approval.integration,
      actionType: 'admin',
      result: AUDIT_RESULT.DENIED,
      reason: 'APPROVAL_DENIED',
      requestId: req.headers['x-request-id'],
      userId: req.user?.id,
      approvalId: approval.id,
    });

    res.json({
      success: true,
      data: approval,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'DENY_FAILED', message: error.message },
    });
  }
});

/**
 * POST /approvals/:id/execute
 * Execute an approved request
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { payload } = req.body;
    
    const approval = approvalService._getApproval(req.params.id);
    
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Approval not found' },
      });
    }

    // Verify payload hasn't changed
    if (!approvalService.verifyPayload(req.params.id, payload)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYLOAD_MISMATCH',
          message: 'Payload has changed since approval. New approval required.',
        },
      });
    }

    // Mark as executed
    const updated = await approvalService.markExecuted(req.params.id, {
      executedBy: req.user?.id,
      executedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: updated,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'EXECUTION_FAILED', message: error.message },
    });
  }
});

export default router;
