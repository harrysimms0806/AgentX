import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import db from '../models/database.js';
import { broadcast } from '../server.js';

const router = Router();

// Get all active locks
router.get('/', (req, res) => {
  const locks = db.prepare(`
    SELECT l.*, p.name as project_name, p.color as project_color, a.name as agent_name
    FROM workspace_locks l
    JOIN projects p ON l.project_id = p.id
    JOIN agents a ON l.agent_id = a.id
    WHERE l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP
    ORDER BY l.locked_at DESC
  `).all();
  
  res.json({ success: true, data: locks });
});

// Create lock (when task starts)
router.post('/', (req, res) => {
  const { projectId, agentId, taskId, folderPath, gitRoot, expiresAt } = req.body;

  if (!projectId || !agentId || !taskId || !folderPath) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'projectId, agentId, taskId, and folderPath are required' } 
    });
  }

  if (!fs.existsSync(folderPath)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FOLDER', message: 'Folder path does not exist' }
    });
  }

  // Check if project already has an active lock
  const existingLock = db.prepare(`
    SELECT * FROM workspace_locks 
    WHERE project_id = ? 
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).get(projectId);

  if (existingLock) {
    return res.status(409).json({ 
      success: false, 
      error: { 
        code: 'ALREADY_LOCKED', 
        message: 'Project already has an active lock',
        data: existingLock
      } 
    });
  }

  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO workspace_locks (id, project_id, agent_id, task_id, folder_path, git_root, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, agentId, taskId, folderPath, gitRoot || folderPath, expiresAt || null);

  const lock = db.prepare(`
    SELECT l.*, p.name as project_name, a.name as agent_name
    FROM workspace_locks l
    JOIN projects p ON l.project_id = p.id
    JOIN agents a ON l.agent_id = a.id
    WHERE l.id = ?
  `).get(id);

  broadcast({
    type: 'workspace:lock',
    payload: lock
  });

  res.status(201).json({ success: true, data: lock });
});

// Release lock (when task completes)
router.delete('/:id', (req, res) => {
  const lock = db.prepare('SELECT * FROM workspace_locks WHERE id = ?').get(req.params.id);
  
  if (!lock) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Lock not found' } 
    });
  }

  db.prepare('DELETE FROM workspace_locks WHERE id = ?').run(req.params.id);

  broadcast({
    type: 'workspace:unlock',
    payload: { lockId: req.params.id, projectId: lock.project_id }
  });

  res.json({ success: true, message: 'Lock released' });
});

// Force release lock (admin only)
router.post('/:id/force-release', (req, res) => {
  const { reason } = req.body;
  
  const lock = db.prepare('SELECT * FROM workspace_locks WHERE id = ?').get(req.params.id);
  
  if (!lock) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Lock not found' } 
    });
  }

  // Log the force release
  db.prepare(`
    INSERT INTO task_logs (task_id, level, message, metadata)
    VALUES (?, 'warn', ?, ?)
  `).run(
    lock.task_id,
    `Workspace lock force-released: ${reason || 'No reason provided'}`,
    JSON.stringify({ forceReleased: true, releasedAt: new Date().toISOString() })
  );

  db.prepare('DELETE FROM workspace_locks WHERE id = ?').run(req.params.id);

  broadcast({
    type: 'workspace:unlock',
    payload: { lockId: req.params.id, projectId: lock.project_id, forced: true }
  });

  res.json({ success: true, message: 'Lock force-released' });
});

// Verify lock is still valid
router.get('/:id/verify', (req, res) => {
  const lock = db.prepare(`
    SELECT l.*, p.name as project_name, a.name as agent_name
    FROM workspace_locks l
    JOIN projects p ON l.project_id = p.id
    JOIN agents a ON l.agent_id = a.id
    WHERE l.id = ?
    AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP)
  `).get(req.params.id);
  
  if (!lock) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'LOCK_EXPIRED', message: 'Lock not found or expired' } 
    });
  }

  res.json({ success: true, data: lock });
});

export default router;
