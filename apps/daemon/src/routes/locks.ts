// File Locks API Routes
// Phase 2: /locks/acquire, /locks/release

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { lockDb, initDatabase } from '../database';
import { sandbox } from '../sandbox';
import { audit } from '../audit';
import type { FileLock } from '@agentx/api-types';

const router = Router();

// Initialize database on first use
let dbInitialized = false;
function ensureDb() {
  if (!dbInitialized) {
    initDatabase();
    dbInitialized = true;
  }
}

// GET /locks - List all locks (optionally filtered by project)
router.get('/', (req, res) => {
  ensureDb();
  const { projectId } = req.query;
  
  try {
    const locks = projectId 
      ? lockDb.getByProject(projectId as string)
      : lockDb.getAll();
    
    res.json({ locks });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list locks', message: err.message });
  }
});

// POST /locks/acquire - Acquire a file lock
router.post('/acquire', async (req, res) => {
  ensureDb();
  const { projectId, filePath } = req.body;
  const lockedBy = req.headers['x-client-id'] as string || 'unknown';

  // Validation
  if (!projectId || !filePath) {
    res.status(400).json({ error: 'projectId and filePath are required' });
    return;
  }

  // Validate projectId format
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  // Sandbox check
  try {
    sandbox.validatePath(projectId, filePath);
  } catch (err: any) {
    res.status(403).json({ error: 'Path outside sandbox', message: err.message });
    return;
  }

  // Acquire lock
  const lock: FileLock = {
    projectId,
    filePath,
    lockedBy,
    lockedAt: new Date().toISOString(),
  };

  const acquired = lockDb.acquire(lock);

  if (acquired) {
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: lockedBy,
      actionType: 'LOCK_ACQUIRE',
      payload: { filePath },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ 
      success: true, 
      message: 'Lock acquired',
      lock 
    });
  } else {
    // Check who has the lock
    const existing = lockDb.get(projectId, filePath);
    res.status(409).json({ 
      success: false, 
      error: 'File already locked',
      lockedBy: existing?.lockedBy,
      lockedAt: existing?.lockedAt,
    });
  }
});

// POST /locks/release - Release a file lock
router.post('/release', async (req, res) => {
  ensureDb();
  const { projectId, filePath } = req.body;
  const lockedBy = req.headers['x-client-id'] as string || 'unknown';

  // Validation
  if (!projectId || !filePath) {
    res.status(400).json({ error: 'projectId and filePath are required' });
    return;
  }

  // Release lock (only owner can release)
  const released = lockDb.release(projectId, filePath, lockedBy);

  if (released) {
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: lockedBy,
      actionType: 'LOCK_RELEASE',
      payload: { filePath },
      createdAt: new Date().toISOString(),
    });

    res.json({ 
      success: true, 
      message: 'Lock released' 
    });
  } else {
    // Check if lock exists but owned by someone else
    const existing = lockDb.get(projectId, filePath);
    if (existing) {
      res.status(403).json({ 
        success: false, 
        error: 'Lock owned by another user',
        lockedBy: existing.lockedBy,
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Lock not found' 
      });
    }
  }
});

// DELETE /locks/:projectId/:filePath - Force release (admin only - future)
// For now, same as POST /locks/release

export { router as locksRouter };
