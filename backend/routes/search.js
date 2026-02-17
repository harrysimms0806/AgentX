import { Router } from 'express';
import db from '../models/database.js';

const router = Router();

/**
 * GET /search
 * Advanced search across all entities
 */
router.get('/', (req, res) => {
  const {
    q: query,
    type,
    status,
    agentId,
    projectId,
    dateFrom,
    dateTo,
    limit = 20,
    offset = 0,
  } = req.query;

  if (!query || query.length < 2) {
    return res.status(400).json({
      success: false,
      error: { code: 'QUERY_TOO_SHORT', message: 'Search query must be at least 2 characters' },
    });
  }

  const searchTerm = `%${query}%`;
  const results = {
    agents: [],
    tasks: [],
    projects: [],
    total: 0,
  };

  // Search agents
  if (!type || type === 'agent') {
    let agentSql = `
      SELECT * FROM agents 
      WHERE (name LIKE ? OR id LIKE ? OR provider LIKE ?)
    `;
    const agentParams = [searchTerm, searchTerm, searchTerm];

    if (status) {
      agentSql += ' AND status = ?';
      agentParams.push(status);
    }

    agentSql += ' ORDER BY name LIMIT ? OFFSET ?';
    agentParams.push(parseInt(limit), parseInt(offset));

    results.agents = db.prepare(agentSql).all(...agentParams).map(a => ({
      ...a,
      capabilities: JSON.parse(a.capabilities || '[]'),
      config: JSON.parse(a.config || '{}'),
    }));
  }

  // Search tasks
  if (!type || type === 'task') {
    let taskSql = `
      SELECT t.*, a.name as agent_name, p.name as project_name
      FROM tasks t
      LEFT JOIN agents a ON t.agent_id = a.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE (t.title LIKE ? OR t.description LIKE ? OR t.id LIKE ?)
    `;
    const taskParams = [searchTerm, searchTerm, searchTerm];

    if (status) {
      taskSql += ' AND t.status = ?';
      taskParams.push(status);
    }

    if (agentId) {
      taskSql += ' AND t.agent_id = ?';
      taskParams.push(agentId);
    }

    if (projectId) {
      taskSql += ' AND t.project_id = ?';
      taskParams.push(projectId);
    }

    if (dateFrom) {
      taskSql += ' AND t.created_at >= ?';
      taskParams.push(dateFrom);
    }

    if (dateTo) {
      taskSql += ' AND t.created_at <= ?';
      taskParams.push(dateTo);
    }

    taskSql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    taskParams.push(parseInt(limit), parseInt(offset));

    results.tasks = db.prepare(taskSql).all(...taskParams).map(t => ({
      ...t,
      context: JSON.parse(t.context || '{}'),
    }));
  }

  // Search projects
  if (!type || type === 'project') {
    let projectSql = `
      SELECT * FROM projects 
      WHERE (name LIKE ? OR description LIKE ? OR path LIKE ?)
    `;
    const projectParams = [searchTerm, searchTerm, searchTerm];

    if (status) {
      projectSql += ' AND status = ?';
      projectParams.push(status);
    }

    projectSql += ' ORDER BY name LIMIT ? OFFSET ?';
    projectParams.push(parseInt(limit), parseInt(offset));

    results.projects = db.prepare(projectSql).all(...projectParams);
  }

  results.total = results.agents.length + results.tasks.length + results.projects.length;

  res.json({
    success: true,
    data: results,
    meta: {
      query,
      filters: { type, status, agentId, projectId, dateFrom, dateTo },
      limit: parseInt(limit),
      offset: parseInt(offset),
    },
  });
});

/**
 * GET /search/suggestions
 * Get search suggestions (autocomplete)
 */
router.get('/suggestions', (req, res) => {
  const { q: query, type } = req.query;

  if (!query || query.length < 1) {
    return res.json({ success: true, data: [] });
  }

  const searchTerm = `%${query}%`;
  const suggestions = [];

  // Agent suggestions
  if (!type || type === 'agent') {
    const agents = db.prepare(`
      SELECT id, name, type FROM agents 
      WHERE name LIKE ? OR id LIKE ?
      ORDER BY name LIMIT 5
    `).all(searchTerm, searchTerm);
    
    suggestions.push(...agents.map(a => ({
      type: 'agent',
      id: a.id,
      text: a.name,
      subtitle: `Type: ${a.type}`,
    })));
  }

  // Task suggestions
  if (!type || type === 'task') {
    const tasks = db.prepare(`
      SELECT id, title, status FROM tasks 
      WHERE title LIKE ?
      ORDER BY created_at DESC LIMIT 5
    `).all(searchTerm);
    
    suggestions.push(...tasks.map(t => ({
      type: 'task',
      id: t.id,
      text: t.title,
      subtitle: `Status: ${t.status}`,
    })));
  }

  // Project suggestions
  if (!type || type === 'project') {
    const projects = db.prepare(`
      SELECT id, name, status FROM projects 
      WHERE name LIKE ?
      ORDER BY name LIMIT 5
    `).all(searchTerm);
    
    suggestions.push(...projects.map(p => ({
      type: 'project',
      id: p.id,
      text: p.name,
      subtitle: `Status: ${p.status}`,
    })));
  }

  res.json({ success: true, data: suggestions });
});

/**
 * GET /search/filters
 * Get available search filters
 */
router.get('/filters', (req, res) => {
  const filters = {
    types: [
      { id: 'agent', name: 'Agents' },
      { id: 'task', name: 'Tasks' },
      { id: 'project', name: 'Projects' },
    ],
    statuses: {
      agent: ['idle', 'working', 'offline', 'error', 'disabled'],
      task: ['pending', 'running', 'completed', 'failed', 'cancelled', 'retrying'],
      project: ['active', 'archived', 'paused'],
    },
    agents: db.prepare('SELECT id, name FROM agents ORDER BY name').all(),
    projects: db.prepare('SELECT id, name FROM projects ORDER BY name').all(),
  };

  res.json({ success: true, data: filters });
});

/**
 * POST /search/recent
 * Save recent search
 */
router.post('/recent', (req, res) => {
  const { query, filters } = req.body;
  
  // In production, this would save to a user_preferences table
  // For now, just acknowledge
  res.json({
    success: true,
    message: 'Recent search saved (in-memory only)',
  });
});

/**
 * GET /search/recent
 * Get recent searches
 */
router.get('/recent', (req, res) => {
  // In production, this would fetch from user_preferences
  res.json({
    success: true,
    data: [],
    message: 'Recent searches not persisted (in-memory only)',
  });
});

export default router;
