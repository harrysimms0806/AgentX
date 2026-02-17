import { Router } from 'express';
import { taskRetryService } from '../services/TaskRetryService.js';

const router = Router();

/**
 * GET /retries/pending
 * Get all pending retries
 */
router.get('/pending', (req, res) => {
  const retries = taskRetryService.getPendingRetries();
  res.json({
    success: true,
    data: retries,
    count: retries.length,
  });
});

/**
 * GET /retries/task/:id
 * Get retry status for a specific task
 */
router.get('/task/:id', (req, res) => {
  const status = taskRetryService.getRetryStatus(req.params.id);
  res.json({ success: true, data: status });
});

/**
 * POST /retries/task/:id/cancel
 * Cancel retries for a task
 */
router.post('/task/:id/cancel', (req, res) => {
  const cancelled = taskRetryService.cancelRetries(req.params.id);
  res.json({
    success: true,
    cancelled,
    message: cancelled ? 'Retries cancelled' : 'No active retries for this task',
  });
});

/**
 * GET /retries/circuit-breakers
 * Get circuit breaker status
 */
router.get('/circuit-breakers', (req, res) => {
  const agentId = req.query.agentId;
  const status = taskRetryService.getCircuitBreakerStatus(agentId);
  res.json({ success: true, data: status });
});

/**
 * POST /retries/circuit-breaker/:agentId/reset
 * Reset circuit breaker for an agent
 */
router.post('/circuit-breaker/:agentId/reset', (req, res) => {
  const { agentId } = req.params;
  taskRetryService.recordAgentSuccess(agentId);
  res.json({
    success: true,
    message: `Circuit breaker reset for agent ${agentId}`,
  });
});

/**
 * GET /retries/status
 * Get retry service status
 */
router.get('/status', (req, res) => {
  const status = taskRetryService.getStatus();
  res.json({ success: true, data: status });
});

/**
 * GET /retries/config
 * Get retry configuration
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: taskRetryService.config,
  });
});

export default router;
