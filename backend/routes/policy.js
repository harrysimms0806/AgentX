import { Router } from 'express';
import { policyEngine, POLICY_RESULT, POLICY_REASON } from '../services/PolicyEngine.js';
import { auditLogger, AUDIT_RESULT } from '../services/AuditLogger.js';
import { approvalService } from '../services/ApprovalService.js';

const router = Router();

/**
 * POST /policy/check
 * Check if an action is permitted
 * 
 * Body: { agentId, integration, actionType, context }
 */
router.post('/check', (req, res) => {
  const startTime = Date.now();
  const { agentId, integration, actionType, context = {} } = req.body;

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

  // Run policy check
  const result = policyEngine.check({
    agentId,
    integration,
    actionType,
    context,
  });

  // Log to audit
  const duration = Date.now() - startTime;
  auditLogger.log({
    agentId,
    integration,
    actionType,
    result: result.allowed ? AUDIT_RESULT.ALLOWED : 
            result.requiresApproval ? AUDIT_RESULT.REQUIRES_APPROVAL : 
            AUDIT_RESULT.DENIED,
    reason: result.reason,
    requestId: req.headers['x-request-id'] || 'unknown',
    userId: req.user?.id,
    context,
    durationMs: duration,
  });

  // Return result
  res.json({
    success: true,
    data: {
      allowed: result.allowed,
      requiresApproval: result.requiresApproval,
      reason: result.reason,
      message: result.message,
    },
  });
});

/**
 * GET /policy/agents/:id/capabilities
 * Get agent capabilities for UI display
 */
router.get('/agents/:id/capabilities', (req, res) => {
  const capabilities = policyEngine.getAgentCapabilities(req.params.id);
  
  if (!capabilities) {
    return res.status(404).json({
      success: false,
      error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found' },
    });
  }

  res.json({
    success: true,
    data: capabilities,
  });
});

/**
 * POST /policy/validate
 * Full validation before action execution
 * 
 * Body: { agentId, integration, actionType, payload, context }
 */
router.post('/validate', (req, res) => {
  const validation = policyEngine.validateAction(req.body);

  res.json({
    success: validation.valid,
    data: validation,
  });
});

export default router;
