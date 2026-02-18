// Terminal API Routes (REST)
// Phase 3: HTTP endpoints for terminal management

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { terminalManager } from '../terminal';
import { audit } from '../audit';

const router = Router();

// GET /terminals - List all terminals
router.get('/', (req, res) => {
  const { projectId } = req.query;
  
  const terminals = projectId 
    ? terminalManager.getByProject(projectId as string)
    : terminalManager.getAll();
  
  res.json({ terminals });
});

// POST /terminals - Create a new terminal
router.post('/', async (req, res) => {
  const { projectId, cwd, shell } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  // Validate projectId format
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  try {
    const terminal = terminalManager.create(projectId, cwd, shell);

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: clientId,
      actionType: 'TERMINAL_CREATE',
      payload: { cwd, shell },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      terminal: {
        id: terminal.id,
        projectId: terminal.projectId,
        cwd: terminal.cwd,
        pid: terminal.pty.pid,
        title: terminal.title,
        status: terminal.status,
        createdAt: terminal.createdAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create terminal', message: err.message });
  }
});

// GET /terminals/:id - Get terminal details
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const terminal = terminalManager.get(id);
  if (!terminal) {
    res.status(404).json({ error: 'Terminal not found' });
    return;
  }

  res.json({
    terminal: {
      id: terminal.id,
      projectId: terminal.projectId,
      cwd: terminal.cwd,
      pid: terminal.pty.pid,
      title: terminal.title,
      status: terminal.status,
      createdAt: terminal.createdAt,
      lastActiveAt: terminal.lastActiveAt,
    },
  });
});

// POST /terminals/:id/resize - Resize terminal
router.post('/:id/resize', (req, res) => {
  const { id } = req.params;
  const { cols, rows } = req.body;

  if (!cols || !rows) {
    res.status(400).json({ error: 'cols and rows are required' });
    return;
  }

  const success = terminalManager.resize(id, cols, rows);
  
  if (success) {
    res.json({ success: true, message: 'Terminal resized' });
  } else {
    res.status(404).json({ error: 'Terminal not found or not active' });
  }
});

// POST /terminals/:id/kill - Kill terminal
router.post('/:id/kill', async (req, res) => {
  const { id } = req.params;
  const clientId = (req as any).session?.clientId || 'unknown';

  const terminal = terminalManager.get(id);
  if (terminal) {
    await audit.log({
      id: randomUUID(),
      projectId: terminal.projectId,
      actorType: 'user',
      actorId: clientId,
      actionType: 'TERMINAL_KILL',
      payload: { terminalId: id },
      createdAt: new Date().toISOString(),
    });
  }

  const success = terminalManager.kill(id);
  
  if (success) {
    res.json({ success: true, message: 'Terminal killed' });
  } else {
    res.status(404).json({ error: 'Terminal not found' });
  }
});

// DELETE /terminals/:id - Alias for kill
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const clientId = (req as any).session?.clientId || 'unknown';

  const terminal = terminalManager.get(id);
  if (terminal) {
    await audit.log({
      id: randomUUID(),
      projectId: terminal.projectId,
      actorType: 'user',
      actorId: clientId,
      actionType: 'TERMINAL_KILL',
      payload: { terminalId: id },
      createdAt: new Date().toISOString(),
    });
  }

  const success = terminalManager.kill(id);
  
  if (success) {
    res.json({ success: true, message: 'Terminal killed' });
  } else {
    res.status(404).json({ error: 'Terminal not found' });
  }
});

export { router as terminalsRouter };
