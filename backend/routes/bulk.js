import { Router } from 'express';
import db from '../models/database.js';
import { broadcast } from '../server.js';
import { taskRetryService } from '../services/TaskRetryService.js';
import { openClawCLIIntegration } from '../services/OpenClawCLIIntegration.js';

const router = Router();

/**
 * POST /bulk/agents/action
 * Perform bulk action on agents
 */
router.post('/agents/action', async (req, res) => {
  const { agentIds, action } = req.body;

  if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_AGENTS', message: 'agentIds array required' },
    });
  }

  const results = { success: [], failed: [] };

  for (const agentId of agentIds) {
    try {
      switch (action) {
        case 'delete':
          db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
          results.success.push({ agentId, action: 'deleted' });
          break;

        case 'enable':
          db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(agentId);
          results.success.push({ agentId, action: 'enabled' });
          break;

        case 'disable':
          db.prepare("UPDATE agents SET status = 'disabled' WHERE id = ?").run(agentId);
          results.success.push({ agentId, action: 'disabled' });
          break;

        case 'kill':
          await openClawCLIIntegration.killAgent(agentId);
          results.success.push({ agentId, action: 'killed' });
          break;

        default:
          results.failed.push({ agentId, error: 'Unknown action' });
      }
    } catch (err) {
      results.failed.push({ agentId, error: err.message });
    }
  }

  // Broadcast updates
  broadcast({
    type: 'agents:bulk-action',
    payload: { action, count: results.success.length },
  });

  res.json({
    success: true,
    data: results,
    summary: {
      total: agentIds.length,
      succeeded: results.success.length,
      failed: results.failed.length,
    },
  });
});

/**
 * POST /bulk/tasks/action
 * Perform bulk action on tasks
 */
router.post('/tasks/action', async (req, res) => {
  const { taskIds, action } = req.body;

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_TASKS', message: 'taskIds array required' },
    });
  }

  const results = { success: [], failed: [] };

  for (const taskId of taskIds) {
    try {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      if (!task) {
        results.failed.push({ taskId, error: 'Task not found' });
        continue;
      }

      switch (action) {
        case 'delete':
          // Cancel any retries first
          taskRetryService.cancelRetries(taskId);
          db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
          results.success.push({ taskId, action: 'deleted' });
          break;

        case 'cancel':
          db.prepare(`
            UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status IN ('pending', 'queued', 'running')
          `).run(taskId);
          taskRetryService.cancelRetries(taskId);
          results.success.push({ taskId, action: 'cancelled' });
          break;

        case 'retry':
          if (task.status === 'failed' || task.status === 'cancelled') {
            db.prepare(`
              UPDATE tasks SET status = 'pending', error_message = NULL
              WHERE id = ?
            `).run(taskId);
            results.success.push({ taskId, action: 'retried' });
          } else {
            results.failed.push({ taskId, error: 'Task not in retryable state' });
          }
          break;

        case 'prioritize':
          db.prepare("UPDATE tasks SET priority = 'high' WHERE id = ?").run(taskId);
          results.success.push({ taskId, action: 'prioritized' });
          break;

        default:
          results.failed.push({ taskId, error: 'Unknown action' });
      }
    } catch (err) {
      results.failed.push({ taskId, error: err.message });
    }
  }

  broadcast({
    type: 'tasks:bulk-action',
    payload: { action, count: results.success.length },
  });

  res.json({
    success: true,
    data: results,
    summary: {
      total: taskIds.length,
      succeeded: results.success.length,
      failed: results.failed.length,
    },
  });
});

/**
 * POST /bulk/projects/action
 * Perform bulk action on projects
 */
router.post('/projects/action', (req, res) => {
  const { projectIds, action } = req.body;

  if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PROJECTS', message: 'projectIds array required' },
    });
  }

  const results = { success: [], failed: [] };

  for (const projectId of projectIds) {
    try {
      switch (action) {
        case 'delete':
          db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
          results.success.push({ projectId, action: 'deleted' });
          break;

        case 'archive':
          db.prepare("UPDATE projects SET status = 'archived' WHERE id = ?").run(projectId);
          results.success.push({ projectId, action: 'archived' });
          break;

        case 'activate':
          db.prepare("UPDATE projects SET status = 'active' WHERE id = ?").run(projectId);
          results.success.push({ projectId, action: 'activated' });
          break;

        default:
          results.failed.push({ projectId, error: 'Unknown action' });
      }
    } catch (err) {
      results.failed.push({ projectId, error: err.message });
    }
  }

  broadcast({
    type: 'projects:bulk-action',
    payload: { action, count: results.success.length },
  });

  res.json({
    success: true,
    data: results,
    summary: {
      total: projectIds.length,
      succeeded: results.success.length,
      failed: results.failed.length,
    },
  });
});

/**
 * GET /bulk/status
 * Get bulk operation status/history
 */
router.get('/status', (req, res) => {
  // Return recent bulk operations (could be stored in DB in production)
  res.json({
    success: true,
    data: {
      recentOperations: [],
      message: 'Bulk operations history not persisted (in-memory only)',
    },
  });
});

export default router;
