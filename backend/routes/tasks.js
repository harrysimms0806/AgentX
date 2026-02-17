import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';
import { broadcast } from '../server.js';
import { taskRunner } from '../services/TaskRunner.js';

const router = Router();

// Get all tasks
router.get('/', (req, res) => {
  const { status, agentId, projectId } = req.query;
  let query = 'SELECT * FROM tasks';
  const params = [];
  const conditions = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (agentId) {
    conditions.push('agent_id = ?');
    params.push(agentId);
  }
  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ 
    success: true, 
    data: tasks.map(t => ({
      ...t,
      context: JSON.parse(t.context || '{}'),
      error: t.error_code ? {
        code: t.error_code,
        message: t.error_message,
        recoverable: t.error_recoverable,
      } : undefined,
    }))
  });
});

// Get queue status
router.get('/queue/status', (req, res) => {
  const status = taskRunner.getQueueStatus();
  res.json({ success: true, data: status });
});

// Create new task
router.post('/', (req, res) => {
  const {
    title,
    description,
    priority = 'medium',
    agentId,
    projectId,
    workspacePath,
    gitRoot,
    context = {},
  } = req.body;

  if (!title || !workspacePath) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'Title and workspacePath are required' } 
    });
  }

  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, agent_id, project_id, 
                       workspace_path, git_root, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    description || '',
    priority,
    agentId || null,
    projectId || null,
    workspacePath,
    gitRoot || workspacePath,
    JSON.stringify(context)
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  // Broadcast new task
  broadcast({
    type: 'task:created',
    payload: { ...task, context: JSON.parse(task.context || '{}') }
  });

  res.status(201).json({ success: true, data: task });
});

// Get task by ID
router.get('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  
  if (!task) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Task not found' } 
    });
  }

  // Get logs
  const logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY timestamp')
    .all(req.params.id);

  res.json({ 
    success: true, 
    data: {
      ...task,
      context: JSON.parse(task.context || '{}'),
      logs: logs.map(l => ({ ...l, metadata: JSON.parse(l.metadata || '{}') })),
      error: task.error_code ? {
        code: task.error_code,
        message: task.error_message,
        recoverable: task.error_recoverable,
      } : undefined,
    }
  });
});

// Update task status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'INVALID_STATUS', message: 'Invalid status value' } 
    });
  }

  const timestampFields = {
    running: 'started_at',
    completed: 'completed_at',
    failed: 'completed_at',
    cancelled: 'completed_at',
  };

  let query = 'UPDATE tasks SET status = ?';
  const params = [status];

  if (timestampFields[status]) {
    query += `, ${timestampFields[status]} = CURRENT_TIMESTAMP`;
  }

  query += ' WHERE id = ?';
  params.push(req.params.id);

  const result = db.prepare(query).run(...params);

  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Task not found' } 
    });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  broadcast({
    type: 'task:update',
    payload: { ...task, context: JSON.parse(task.context || '{}') }
  });

  res.json({ success: true, data: task });
});

// Add task log
router.post('/:id/logs', (req, res) => {
  const { level, message, metadata = {} } = req.body;
  
  if (!level || !message) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'Level and message are required' } 
    });
  }

  const result = db.prepare(`
    INSERT INTO task_logs (task_id, level, message, metadata)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, level, message, JSON.stringify(metadata));

  const log = db.prepare('SELECT * FROM task_logs WHERE id = ?').get(result.lastInsertRowid);

  broadcast({
    type: 'task:log',
    payload: { taskId: req.params.id, log }
  });

  res.status(201).json({ success: true, data: log });
});

// Cancel task
router.post('/:id/cancel', async (req, res) => {
  try {
    // Use TaskRunner to cancel if it's running
    await taskRunner.cancelTask(req.params.id);
    
    res.json({ success: true, message: 'Task cancelled' });
  } catch (err) {
    console.error('Error cancelling task:', err);
    res.status(500).json({ 
      success: false, 
      error: { code: 'CANCEL_FAILED', message: err.message } 
    });
  }
});

export default router;

// Get all tasks
router.get('/', (req, res) => {
  const { status, agentId, projectId } = req.query;
  let query = 'SELECT * FROM tasks';
  const params = [];
  const conditions = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (agentId) {
    conditions.push('agent_id = ?');
    params.push(agentId);
  }
  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ 
    success: true, 
    data: tasks.map(t => ({
      ...t,
      context: JSON.parse(t.context || '{}'),
      error: t.error_code ? {
        code: t.error_code,
        message: t.error_message,
        recoverable: t.error_recoverable,
      } : undefined,
    }))
  });
});

// Create new task
router.post('/', (req, res) => {
  const {
    title,
    description,
    priority = 'medium',
    agentId,
    projectId,
    workspacePath,
    gitRoot,
    context = {},
  } = req.body;

  if (!title || !workspacePath) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'Title and workspacePath are required' } 
    });
  }

  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, agent_id, project_id, 
                       workspace_path, git_root, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    description || '',
    priority,
    agentId || null,
    projectId || null,
    workspacePath,
    gitRoot || workspacePath,
    JSON.stringify(context)
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  // Broadcast new task
  broadcast({
    type: 'task:created',
    payload: { ...task, context: JSON.parse(task.context || '{}') }
  });

  res.status(201).json({ success: true, data: task });
});

// Get task by ID
router.get('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  
  if (!task) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Task not found' } 
    });
  }

  // Get logs
  const logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY timestamp')
    .all(req.params.id);

  res.json({ 
    success: true, 
    data: {
      ...task,
      context: JSON.parse(task.context || '{}'),
      logs: logs.map(l => ({ ...l, metadata: JSON.parse(l.metadata || '{}') })),
      error: task.error_code ? {
        code: task.error_code,
        message: task.error_message,
        recoverable: task.error_recoverable,
      } : undefined,
    }
  });
});

// Update task status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'INVALID_STATUS', message: 'Invalid status value' } 
    });
  }

  const timestampFields = {
    running: 'started_at',
    completed: 'completed_at',
    failed: 'completed_at',
    cancelled: 'completed_at',
  };

  let query = 'UPDATE tasks SET status = ?';
  const params = [status];

  if (timestampFields[status]) {
    query += `, ${timestampFields[status]} = CURRENT_TIMESTAMP`;
  }

  query += ' WHERE id = ?';
  params.push(req.params.id);

  const result = db.prepare(query).run(...params);

  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Task not found' } 
    });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  broadcast({
    type: 'task:update',
    payload: { ...task, context: JSON.parse(task.context || '{}') }
  });

  res.json({ success: true, data: task });
});

// Add task log
router.post('/:id/logs', (req, res) => {
  const { level, message, metadata = {} } = req.body;
  
  if (!level || !message) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'Level and message are required' } 
    });
  }

  const result = db.prepare(`
    INSERT INTO task_logs (task_id, level, message, metadata)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, level, message, JSON.stringify(metadata));

  const log = db.prepare('SELECT * FROM task_logs WHERE id = ?').get(result.lastInsertRowid);

  broadcast({
    type: 'task:log',
    payload: { taskId: req.params.id, log }
  });

  res.status(201).json({ success: true, data: log });
});

// Cancel task
router.post('/:id/cancel', (req, res) => {
  const result = db.prepare(`
    UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'queued', 'running')
  `).run(req.params.id);

  if (result.changes === 0) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'CANNOT_CANCEL', message: 'Task cannot be cancelled' } 
    });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

  broadcast({
    type: 'task:update',
    payload: { ...task, context: JSON.parse(task.context || '{}') }
  });

  res.json({ success: true, data: task });
});

export default router;
