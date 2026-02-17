import { Router } from 'express';
import { auditLogger } from '../services/AuditLogger.js';

const router = Router();

/**
 * GET /audit
 * Query audit log with filters
 */
router.get('/', (req, res) => {
  const {
    agentId,
    integration,
    actionType,
    result,
    startDate,
    endDate,
    limit,
    offset,
  } = req.query;

  const entries = auditLogger.query({
    agentId,
    integration,
    actionType,
    result,
    startDate,
    endDate,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
  });

  res.json({
    success: true,
    data: entries,
  });
});

/**
 * GET /audit/summary
 * Get summary statistics
 */
router.get('/summary', (req, res) => {
  const { agentId, startDate, endDate } = req.query;

  const summary = auditLogger.getSummary({
    agentId,
    startDate,
    endDate,
  });

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * GET /audit/agents/:id
 * Get recent activity for specific agent
 */
router.get('/agents/:id', (req, res) => {
  const { limit } = req.query;

  const activity = auditLogger.getAgentActivity(
    req.params.id,
    limit ? parseInt(limit) : 20
  );

  res.json({
    success: true,
    data: activity,
  });
});

/**
 * POST /audit/export
 * Export audit log (for compliance)
 */
router.post('/export', (req, res) => {
  const { startDate, endDate, agentId } = req.body;

  const export_ = auditLogger.export({
    startDate,
    endDate,
    agentId,
  });

  res.json({
    success: true,
    data: export_,
  });
});

export default router;
