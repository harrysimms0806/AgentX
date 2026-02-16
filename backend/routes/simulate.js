import { Router } from 'express';
import { executionSimulator } from '../services/ExecutionSimulator.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /simulate
 * Simulate an action before execution
 * 
 * Body: { agentId, actionType, integration, context, payload }
 */
router.post('/', async (req, res) => {
  try {
    const { agentId, actionType, integration, context, payload } = req.body;

    if (!agentId || !actionType || !integration) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'agentId, actionType, and integration are required',
        },
      });
    }

    const simulation = await executionSimulator.simulate({
      agentId,
      actionType,
      integration,
      context,
      payload,
    });

    res.json({
      success: true,
      data: simulation,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SIMULATION_FAILED',
        message: error.message,
      },
    });
  }
});

/**
 * POST /simulate/compare
 * Compare multiple execution scenarios
 * 
 * Body: { scenarios: [{ agentId, actionType, ... }, ...] }
 */
router.post('/compare', async (req, res) => {
  try {
    const { scenarios } = req.body;

    if (!Array.isArray(scenarios) || scenarios.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SCENARIOS',
          message: 'At least 2 scenarios required for comparison',
        },
      });
    }

    // Simulate all scenarios
    const results = await Promise.all(
      scenarios.map(scenario => executionSimulator.simulate(scenario))
    );

    // Compare them
    const comparison = executionSimulator.compareScenarios(results);

    res.json({
      success: true,
      data: {
        comparison,
        scenarios: results,
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'COMPARISON_FAILED',
        message: error.message,
      },
    });
  }
});

/**
 * GET /simulate/history
 * Get simulation history
 */
router.get('/history', async (req, res) => {
  try {
    const { agentId, limit = 20 } = req.query;

    let query = `
      SELECT * FROM simulations
      WHERE 1=1
    `;
    const params = [];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const rows = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: rows.map(row => ({
        id: row.id,
        agentId: row.agent_id,
        actionType: row.action_type,
        integration: row.integration,
        result: JSON.parse(row.result || '{}'),
        createdAt: row.created_at,
      })),
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HISTORY_FAILED',
        message: error.message,
      },
    });
  }
});

export default router;
