import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';
import { execSync } from 'child_process';
import path from 'path';

const router = Router();

// Get all projects
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  res.json({ success: true, data: projects });
});

// Create new project
router.post('/', (req, res) => {
  const { name, path: projectPath, description, color = '#007AFF' } = req.body;

  if (!name || !projectPath) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'Name and path are required' } 
    });
  }

  // Auto-detect git root
  let gitRoot = projectPath;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { 
      cwd: projectPath,
      encoding: 'utf8' 
    }).trim();
  } catch {
    // Not a git repo, use project path
    gitRoot = projectPath;
  }

  const id = uuidv4();
  
  try {
    db.prepare(`
      INSERT INTO projects (id, name, path, git_root, description, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, projectPath, gitRoot, description || '', color);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: project });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ 
        success: false, 
        error: { code: 'DUPLICATE_PATH', message: 'Project path already exists' } 
      });
    }
    throw err;
  }
});

// Get project by ID
router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  
  if (!project) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Project not found' } 
    });
  }

  // Get active lock
  const lock = db.prepare(`
    SELECT * FROM workspace_locks 
    WHERE project_id = ? 
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).get(req.params.id);

  // Get recent tasks
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE project_id = ? 
    ORDER BY created_at DESC 
    LIMIT 10
  `).all(req.params.id);

  res.json({ 
    success: true, 
    data: { 
      ...project, 
      activeLock: lock || null,
      recentTasks: tasks.map(t => ({
        ...t,
        context: JSON.parse(t.context || '{}'),
      }))
    } 
  });
});

// Update project
router.patch('/:id', (req, res) => {
  const { name, description, color, status } = req.body;
  const updates = [];
  const params = [];

  if (name) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (color) { updates.push('color = ?'); params.push(color); }
  if (status) { updates.push('status = ?'); params.push(status); }

  if (updates.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'NO_UPDATES', message: 'No fields to update' } 
    });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  const result = db.prepare(`
    UPDATE projects SET ${updates.join(', ')} WHERE id = ?
  `).run(...params);

  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Project not found' } 
    });
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: project });
});

// Verify git root
router.post('/:id/verify-git', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  
  if (!project) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Project not found' } 
    });
  }

  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { 
      cwd: project.path,
      encoding: 'utf8' 
    }).trim();

    const isCorrect = gitRoot === project.git_root;

    res.json({ 
      success: true, 
      data: {
        expected: project.git_root,
        actual: gitRoot,
        correct: isCorrect,
      }
    });
  } catch (err) {
    res.json({ 
      success: false, 
      error: { 
        code: 'NOT_GIT_REPO', 
        message: 'Project path is not a git repository' 
      } 
    });
  }
});

export default router;
