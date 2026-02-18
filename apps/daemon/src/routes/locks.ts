// File Locks API Routes
// Phase 2: /locks/acquire, /locks/release

import { Router } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { lockDb, initDatabase } from '../database';
import { sandbox } from '../sandbox';
import { audit } from '../audit';
import type { FileLock } from '@agentx/api-types';

const router = Router();
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS ?? `${10 * 60 * 1000}`);

// Initialize database on first use
let dbInitialized = false;
function ensureDb() {
  if (!dbInitialized) {
    initDatabase();
    dbInitialized = true;
  }
}

function actorIdFromReq(req: any): string {
  return req.session?.clientId || (req.headers['x-client-id'] as string) || 'unknown';
}

function toCanonicalRelativePath(projectId: string, filePath: string): { ok: true; filePath: string } | { ok: false; error: string } {
  const check = sandbox.validatePath(projectId, filePath);
  if (!check.allowed || !check.realPath) {
    return { ok: false, error: check.error || 'Path outside sandbox' };
  }

  const projectRoot = sandbox.getProjectPath(projectId);
  if (!projectRoot.allowed) {
    return { ok: false, error: projectRoot.error || 'Invalid project' };
  }

  const relative = path.relative(projectRoot.path, check.realPath).replace(/\\/g, '/');
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, error: 'Path outside project boundary' };
  }

  return { ok: true, filePath: relative || '.' };
}

// GET /locks - List all locks (optionally filtered by project)
router.get('/', (req, res) => {
  ensureDb();
  const { projectId } = req.query;

  try {
    lockDb.cleanupExpired(LOCK_TTL_MS);

    const locks = projectId
      ? lockDb.getByProject(projectId as string)
      : lockDb.getAll();

    res.json({ locks, ttlMs: LOCK_TTL_MS });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list locks', message: err.message });
  }
});

// POST /locks/acquire - Acquire a file lock
router.post('/acquire', async (req, res) => {
  ensureDb();
  const { projectId, filePath } = req.body;
  const lockedBy = actorIdFromReq(req);

  if (!projectId || !filePath) {
    res.status(400).json({ error: 'projectId and filePath are required' });
    return;
  }

  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  const canonical = toCanonicalRelativePath(projectId, filePath);
  if (!canonical.ok) {
    res.status(403).json({ error: 'Path outside sandbox', message: canonical.error });
    return;
  }

  lockDb.cleanupExpired(LOCK_TTL_MS);

  const lock: FileLock = {
    projectId,
    filePath: canonical.filePath,
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
      payload: { filePath: canonical.filePath },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: 'Lock acquired',
      lock,
      ttlMs: LOCK_TTL_MS,
    });
  } else {
    const existing = lockDb.get(projectId, canonical.filePath);
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
  const lockedBy = actorIdFromReq(req);

  if (!projectId || !filePath) {
    res.status(400).json({ error: 'projectId and filePath are required' });
    return;
  }

  const canonical = toCanonicalRelativePath(projectId, filePath);
  if (!canonical.ok) {
    res.status(403).json({ error: 'Path outside sandbox', message: canonical.error });
    return;
  }

  const released = lockDb.release(projectId, canonical.filePath, lockedBy);

  if (released) {
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: lockedBy,
      actionType: 'LOCK_RELEASE',
      payload: { filePath: canonical.filePath },
      createdAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Lock released' });
  } else {
    const existing = lockDb.get(projectId, canonical.filePath);
    if (existing) {
      res.status(403).json({ success: false, error: 'Lock owned by another user', lockedBy: existing.lockedBy });
    } else {
      res.status(404).json({ success: false, error: 'Lock not found' });
    }
  }
});

// POST /locks/recover - cleanup stale locks
router.post('/recover', async (req, res) => {
  ensureDb();
  const releasedCount = lockDb.cleanupExpired(LOCK_TTL_MS);
  const actorId = actorIdFromReq(req);

  await audit.log({
    id: randomUUID(),
    projectId: req.body?.projectId,
    actorType: 'user',
    actorId,
    actionType: 'LOCK_RECOVER',
    payload: { releasedCount, ttlMs: LOCK_TTL_MS },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, releasedCount, ttlMs: LOCK_TTL_MS });
});

export { router as locksRouter };
