import { Router } from 'express';
import { openClawIntegration } from '../services/OpenClawIntegration.js';
import { agentHeartbeatMonitor } from '../services/AgentHeartbeatMonitor.js';
import { taskRunner } from '../services/TaskRunner.js';
import db from '../models/database.js';

const router = Router();

/**
 * GET /agents/control/active
 * Get all currently active (running) agents
 */
router.get('/active', (req, res) => {
  const activeAgents = openClawIntegration.getActiveAgents();
  res.json({
    success: true,
    data: activeAgents,
    count: activeAgents.length,
  });
});

/**
 * GET /agents/control/status
 * Get system-wide agent control status
 */
router.get('/status', (req, res) => {
  const integrationStatus = openClawIntegration.getSystemStatus();
  const heartbeatStatus = agentHeartbeatMonitor.getSystemHealth();
  const queueStatus = taskRunner.getQueueStatus();

  res.json({
    success: true,
    data: {
      integration: integrationStatus,
      heartbeat: heartbeatStatus,
      queue: queueStatus,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /agents/control/:id/spawn
 * Manually spawn an agent for a task
 */
router.post('/:id/spawn', async (req, res) => {
  const { taskId } = req.body;
  const agentId = req.params.id;

  if (!taskId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TASK', message: 'taskId is required' },
    });
  }

  // Get the task
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
    });
  }

  // Get agent config
  const { configBridge } = await import('../services/ConfigBridge.js');
  const agentConfig = configBridge.getAgent(agentId);
  if (!agentConfig) {
    return res.status(404).json({
      success: false,
      error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found in config' },
    });
  }

  try {
    const result = await openClawIntegration.spawnAgent(task, agentConfig);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SPAWN_FAILED', message: error.message },
    });
  }
});

/**
 * POST /agents/control/:id/kill
 * Kill a running agent
 */
router.post('/:id/kill', async (req, res) => {
  const agentId = req.params.id;

  try {
    const result = await openClawIntegration.killAgent(agentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'KILL_FAILED', message: error.message },
    });
  }
});

/**
 * GET /agents/control/:id/heartbeat
 * Get heartbeat status for a specific agent
 */
router.get('/:id/heartbeat', (req, res) => {
  const agentId = req.params.id;
  const heartbeat = agentHeartbeatMonitor.getAgentHeartbeat(agentId);

  if (!heartbeat) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No heartbeat data for this agent' },
    });
  }

  res.json({
    success: true,
    data: heartbeat,
  });
});

/**
 * POST /agents/control/:id/heartbeat
 * Record a heartbeat from an agent
 */
router.post('/:id/heartbeat', (req, res) => {
  const agentId = req.params.id;
  const metadata = req.body;

  const heartbeat = agentHeartbeatMonitor.recordHeartbeat(agentId, metadata);

  res.json({
    success: true,
    data: heartbeat,
  });
});

/**
 * GET /agents/control/heartbeats
 * Get all agent heartbeats
 */
router.get('/heartbeats/all', (req, res) => {
  const heartbeats = agentHeartbeatMonitor.getAllHeartbeats();
  res.json({
    success: true,
    data: heartbeats,
    count: heartbeats.length,
  });
});

/**
 * GET /agents/control/health
 * Get system health summary
 */
router.get('/health/summary', (req, res) => {
  const health = agentHeartbeatMonitor.getSystemHealth();
  res.json({
    success: true,
    data: health,
  });
});

/**
 * POST /agents/control/:id/mark-unhealthy
 * Manually mark an agent as unhealthy
 */
router.post('/:id/mark-unhealthy', (req, res) => {
  const agentId = req.params.id;
  const { reason } = req.body;

  agentHeartbeatMonitor.markUnhealthy(agentId, reason);

  res.json({
    success: true,
    message: `Agent ${agentId} marked as unhealthy`,
  });
});

/**
 * GET /agents/control/:id/history
 * Get health history for an agent
 */
router.get('/:id/history', (req, res) => {
  const agentId = req.params.id;
  const limit = parseInt(req.query.limit) || 24;

  const history = agentHeartbeatMonitor.getAgentHealthHistory(agentId, limit);

  res.json({
    success: true,
    data: history,
  });
});

export default router;
