import { Router } from 'express';
import db from '../models/database.js';
import { broadcast } from '../server.js';
import { agentSync } from '../services/AgentSync.js';

const router = Router();

// Get all agents
// Uses merged data: ConfigBridge metadata + Database stats
router.get('/', (req, res) => {
  try {
    // Get merged agents from AgentSync (config + database)
    const mergedAgents = agentSync.getMergedAgents();
    
    res.json({ 
      success: true, 
      data: mergedAgents,
      meta: {
        source: 'merged', // config + database
        count: mergedAgents.length,
      }
    });
  } catch (error) {
    console.error('❌ Error fetching agents:', error);
    // Fallback to database-only if sync fails
    const agents = db.prepare('SELECT * FROM agents').all();
    res.json({ 
      success: true, 
      data: agents.map(a => ({
        ...a,
        capabilities: JSON.parse(a.capabilities || '[]'),
        config: JSON.parse(a.config || '{}'),
      })),
      meta: {
        source: 'database-only',
        count: agents.length,
        error: error.message,
      }
    });
  }
});

// Get agent by ID
// Uses merged data
router.get('/:id', (req, res) => {
  try {
    const mergedAgents = agentSync.getMergedAgents();
    const agent = mergedAgents.find(a => a.id === req.params.id);
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        error: { code: 'NOT_FOUND', message: 'Agent not found' } 
      });
    }
    
    res.json({ 
      success: true, 
      data: agent,
      meta: {
        source: 'merged',
      }
    });
  } catch (error) {
    console.error('❌ Error fetching agent:', error);
    // Fallback to database
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        error: { code: 'NOT_FOUND', message: 'Agent not found' } 
      });
    }
    
    res.json({ 
      success: true, 
      data: {
        ...agent,
        capabilities: JSON.parse(agent.capabilities || '[]'),
        config: JSON.parse(agent.config || '{}'),
      },
      meta: {
        source: 'database-only',
      }
    });
  }
});

// Update agent status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['idle', 'working', 'success', 'error', 'offline', 'disabled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'INVALID_STATUS', message: 'Invalid status value' } 
    });
  }

  const result = db.prepare(`
    UPDATE agents 
    SET status = ?, last_active = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(status, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Agent not found' } 
    });
  }

  // Broadcast status change
  broadcast({
    type: 'agent:status',
    payload: { agentId: req.params.id, status }
  });

  res.json({ success: true, data: { id: req.params.id, status } });
});

// Update agent stats
router.patch('/:id/stats', (req, res) => {
  const updates = req.body;
  const allowedFields = [
    'stats_tasks_completed',
    'stats_tasks_failed', 
    'stats_avg_response_time',
    'stats_total_cost',
    'stats_uptime'
  ];

  const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
  if (fields.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'NO_VALID_FIELDS', message: 'No valid fields to update' } 
    });
  }

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);

  const result = db.prepare(`
    UPDATE agents SET ${setClause} WHERE id = ?
  `).run(...values, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Agent not found' } 
    });
  }

  res.json({ success: true });
});

// Force agent sync (admin endpoint)
router.post('/sync', async (req, res) => {
  try {
    const result = await agentSync.forceSync();
    res.json({
      success: true,
      data: result,
      message: 'Agents synced successfully',
    });
  } catch (error) {
    console.error('❌ Error syncing agents:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SYNC_FAILED', message: error.message },
    });
  }
});

// Get sync status
router.get('/sync/status', (req, res) => {
  res.json({
    success: true,
    data: agentSync.getStatus(),
  });
});

export default router;
