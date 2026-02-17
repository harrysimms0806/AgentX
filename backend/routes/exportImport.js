import { Router } from 'express';
import db from '../models/database.js';
import { configBridge } from '../services/ConfigBridge.js';

const router = Router();

/**
 * GET /export/all
 * Export all data
 */
router.get('/all', (req, res) => {
  const format = req.query.format || 'json';
  
  const data = {
    version: '1.3.0',
    exportedAt: new Date().toISOString(),
    agents: db.prepare('SELECT * FROM agents').all().map(a => ({
      ...a,
      capabilities: JSON.parse(a.capabilities || '[]'),
      config: JSON.parse(a.config || '{}'),
    })),
    tasks: db.prepare('SELECT * FROM tasks').all().map(t => ({
      ...t,
      context: JSON.parse(t.context || '{}'),
    })),
    projects: db.prepare('SELECT * FROM projects').all(),
    config: configBridge.getConfig(),
  };

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=agentx-export-${Date.now()}.json`);
    return res.json(data);
  }

  // CSV format (simplified - just agents and tasks summary)
  if (format === 'csv') {
    const csvRows = [
      'Type,ID,Name,Status,Date',
      ...data.agents.map(a => `Agent,${a.id},${a.name},${a.status},${a.created_at}`),
      ...data.tasks.map(t => `Task,${t.id},${t.title},${t.status},${t.created_at}`),
      ...data.projects.map(p => `Project,${p.id},${p.name},${p.status},${p.created_at}`),
    ];
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=agentx-export-${Date.now()}.csv`);
    return res.send(csvRows.join('\n'));
  }

  res.status(400).json({
    success: false,
    error: { code: 'INVALID_FORMAT', message: 'Format must be json or csv' },
  });
});

/**
 * GET /export/agents
 * Export agents only
 */
router.get('/agents', (req, res) => {
  const agents = db.prepare('SELECT * FROM agents').all().map(a => ({
    ...a,
    capabilities: JSON.parse(a.capabilities || '[]'),
    config: JSON.parse(a.config || '{}'),
  }));

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=agentx-agents-${Date.now()}.json`);
  res.json({ agents, exportedAt: new Date().toISOString() });
});

/**
 * GET /export/tasks
 * Export tasks only
 */
router.get('/tasks', (req, res) => {
  const { status, dateFrom, dateTo } = req.query;
  
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (dateFrom) {
    sql += ' AND created_at >= ?';
    params.push(dateFrom);
  }

  if (dateTo) {
    sql += ' AND created_at <= ?';
    params.push(dateTo);
  }

  sql += ' ORDER BY created_at DESC';

  const tasks = db.prepare(sql).all(...params).map(t => ({
    ...t,
    context: JSON.parse(t.context || '{}'),
  }));

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=agentx-tasks-${Date.now()}.json`);
  res.json({ tasks, exportedAt: new Date().toISOString() });
});

/**
 * GET /export/workflows
 * Export workflows
 */
router.get('/workflows', (req, res) => {
  const workflows = db.prepare('SELECT * FROM workflows').all().map(w => ({
    ...w,
    nodes: JSON.parse(w.nodes || '[]'),
    edges: JSON.parse(w.edges || '[]'),
    trigger_config: JSON.parse(w.trigger_config || '{}'),
  }));

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=agentx-workflows-${Date.now()}.json`);
  res.json({ workflows, exportedAt: new Date().toISOString() });
});

/**
 * POST /import/agents
 * Import agents
 */
router.post('/agents', (req, res) => {
  const { agents, mode = 'merge' } = req.body; // mode: 'merge' or 'replace'

  if (!agents || !Array.isArray(agents)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_DATA', message: 'agents array required' },
    });
  }

  const results = { imported: 0, skipped: 0, errors: [] };

  if (mode === 'replace') {
    // Clear existing agents (except system agents)
    db.prepare("DELETE FROM agents WHERE id NOT IN ('bud', 'codex', 'local')").run();
  }

  for (const agent of agents) {
    try {
      // Check if agent exists
      const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(agent.id);
      
      if (existing && mode === 'skip') {
        results.skipped++;
        continue;
      }

      if (existing) {
        // Update existing
        db.prepare(`
          UPDATE agents SET
            name = ?,
            type = ?,
            provider = ?,
            model = ?,
            capabilities = ?,
            avatar = ?,
            config = ?
          WHERE id = ?
        `).run(
          agent.name,
          agent.type,
          agent.provider,
          agent.model,
          JSON.stringify(agent.capabilities || []),
          agent.avatar,
          JSON.stringify(agent.config || {}),
          agent.id
        );
      } else {
        // Insert new
        db.prepare(`
          INSERT INTO agents (id, name, type, provider, model, capabilities, avatar, config, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle')
        `).run(
          agent.id,
          agent.name,
          agent.type,
          agent.provider,
          agent.model,
          JSON.stringify(agent.capabilities || []),
          agent.avatar || '🤖',
          JSON.stringify(agent.config || {})
        );
      }

      results.imported++;
    } catch (err) {
      results.errors.push({ agent: agent.id, error: err.message });
    }
  }

  res.json({
    success: true,
    data: results,
  });
});

/**
 * POST /import/workflows
 * Import workflows
 */
router.post('/workflows', (req, res) => {
  const { workflows } = req.body;

  if (!workflows || !Array.isArray(workflows)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_DATA', message: 'workflows array required' },
    });
  }

  const results = { imported: 0, errors: [] };

  for (const workflow of workflows) {
    try {
      const id = workflow.id || require('uuid').v4();
      
      db.prepare(`
        INSERT OR REPLACE INTO workflows (id, name, description, nodes, edges, trigger_type, trigger_config, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        workflow.name,
        workflow.description || '',
        JSON.stringify(workflow.nodes || []),
        JSON.stringify(workflow.edges || []),
        workflow.trigger_type || 'manual',
        JSON.stringify(workflow.trigger_config || {}),
        workflow.enabled ? 1 : 0
      );

      results.imported++;
    } catch (err) {
      results.errors.push({ workflow: workflow.name, error: err.message });
    }
  }

  res.json({
    success: true,
    data: results,
  });
});

/**
 * POST /import/validate
 * Validate import data without importing
 */
router.post('/validate', (req, res) => {
  const { agents, tasks, workflows } = req.body;
  
  const validation = {
    agents: { valid: true, count: 0, errors: [] },
    tasks: { valid: true, count: 0, errors: [] },
    workflows: { valid: true, count: 0, errors: [] },
  };

  if (agents) {
    validation.agents.count = agents.length;
    for (const agent of agents) {
      if (!agent.id || !agent.name) {
        validation.agents.valid = false;
        validation.agents.errors.push(`Agent missing required fields: ${agent.id || 'unknown'}`);
      }
    }
  }

  if (tasks) {
    validation.tasks.count = tasks.length;
    for (const task of tasks) {
      if (!task.id || !task.title) {
        validation.tasks.valid = false;
        validation.tasks.errors.push(`Task missing required fields: ${task.id || 'unknown'}`);
      }
    }
  }

  if (workflows) {
    validation.workflows.count = workflows.length;
    for (const workflow of workflows) {
      if (!workflow.name) {
        validation.workflows.valid = false;
        validation.workflows.errors.push(`Workflow missing name`);
      }
    }
  }

  res.json({
    success: true,
    data: validation,
    canImport: validation.agents.valid && validation.tasks.valid && validation.workflows.valid,
  });
});

export default router;
