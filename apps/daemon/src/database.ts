// Database module for AgentX Daemon
// SQLite persistence for Phase 2

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { Project, Run, AuditEvent, FileLock } from '@agentx/api-types';

const DB_DIR = path.join(os.homedir(), '.agentx');
const DB_PATH = path.join(DB_DIR, 'agentx.db');

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  // Ensure directory exists
  const fs = require('fs');
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  return db;
}

function createTables() {
  if (!db) throw new Error('Database not initialized');

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_opened_at TEXT NOT NULL,
      settings_json TEXT NOT NULL
    )
  `);

  // Runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      owner_agent_id TEXT,
      status TEXT NOT NULL,
      pid INTEGER,
      started_at TEXT,
      ended_at TEXT,
      exit_code INTEGER,
      logs_path TEXT NOT NULL,
      summary TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // File locks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_locks (
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      locked_by TEXT NOT NULL,
      locked_at TEXT NOT NULL,
      PRIMARY KEY (project_id, file_path),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Audit events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      action_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Create indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at)');
}

// Project operations
export const projectDb = {
  getAll(): Project[] {
    const stmt = db!.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      createdAt: row.created_at,
      lastOpenedAt: row.last_opened_at,
      settings: JSON.parse(row.settings_json),
    }));
  },

  getById(id: string): Project | undefined {
    const stmt = db!.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      createdAt: row.created_at,
      lastOpenedAt: row.last_opened_at,
      settings: JSON.parse(row.settings_json),
    };
  },

  create(project: Project): void {
    const stmt = db!.prepare(`
      INSERT INTO projects (id, name, root_path, created_at, last_opened_at, settings_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      project.id,
      project.name,
      project.rootPath,
      project.createdAt,
      project.lastOpenedAt,
      JSON.stringify(project.settings)
    );
  },

  updateLastOpened(id: string): void {
    const stmt = db!.prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), id);
  },

  delete(id: string): void {
    const stmt = db!.prepare('DELETE FROM projects WHERE id = ?');
    stmt.run(id);
  },
};

// Run operations
export const runDb = {
  getAll(): Run[] {
    const stmt = db!.prepare('SELECT * FROM runs ORDER BY started_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      ownerAgentId: row.owner_agent_id,
      status: row.status,
      pid: row.pid,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      exitCode: row.exit_code,
      logsPath: row.logs_path,
      summary: row.summary,
    }));
  },

  getById(id: string): Run | undefined {
    const stmt = db!.prepare('SELECT * FROM runs WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      ownerAgentId: row.owner_agent_id,
      status: row.status,
      pid: row.pid,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      exitCode: row.exit_code,
      logsPath: row.logs_path,
      summary: row.summary,
    };
  },

  getByProject(projectId: string): Run[] {
    const stmt = db!.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC');
    const rows = stmt.all(projectId) as any[];
    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      ownerAgentId: row.owner_agent_id,
      status: row.status,
      pid: row.pid,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      exitCode: row.exit_code,
      logsPath: row.logs_path,
      summary: row.summary,
    }));
  },

  create(run: Run): void {
    const stmt = db!.prepare(`
      INSERT INTO runs (id, project_id, type, owner_agent_id, status, pid, started_at, ended_at, exit_code, logs_path, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.id,
      run.projectId,
      run.type,
      run.ownerAgentId || null,
      run.status,
      run.pid || null,
      run.startedAt || null,
      run.endedAt || null,
      run.exitCode || null,
      run.logsPath,
      run.summary || null
    );
  },

  updateStatus(id: string, status: Run['status'], updates?: Partial<Run>): void {
    const fields = ['status = ?'];
    const values: any[] = [status];

    if (updates?.pid !== undefined) {
      fields.push('pid = ?');
      values.push(updates.pid);
    }
    if (updates?.endedAt !== undefined) {
      fields.push('ended_at = ?');
      values.push(updates.endedAt);
    }
    if (updates?.exitCode !== undefined) {
      fields.push('exit_code = ?');
      values.push(updates.exitCode);
    }
    if (updates?.summary !== undefined) {
      fields.push('summary = ?');
      values.push(updates.summary);
    }

    values.push(id);
    const stmt = db!.prepare(`UPDATE runs SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },

  delete(id: string): void {
    const stmt = db!.prepare('DELETE FROM runs WHERE id = ?');
    stmt.run(id);
  },
};

// File lock operations
export const lockDb = {
  getAll(): FileLock[] {
    const stmt = db!.prepare('SELECT * FROM file_locks ORDER BY locked_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      projectId: row.project_id,
      filePath: row.file_path,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
    }));
  },

  getByProject(projectId: string): FileLock[] {
    const stmt = db!.prepare('SELECT * FROM file_locks WHERE project_id = ? ORDER BY locked_at DESC');
    const rows = stmt.all(projectId) as any[];
    return rows.map(row => ({
      projectId: row.project_id,
      filePath: row.file_path,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
    }));
  },

  get(projectId: string, filePath: string): FileLock | undefined {
    const stmt = db!.prepare('SELECT * FROM file_locks WHERE project_id = ? AND file_path = ?');
    const row = stmt.get(projectId, filePath) as any;
    if (!row) return undefined;
    return {
      projectId: row.project_id,
      filePath: row.file_path,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
    };
  },

  acquire(lock: FileLock): boolean {
    try {
      const stmt = db!.prepare(`
        INSERT INTO file_locks (project_id, file_path, locked_by, locked_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(lock.projectId, lock.filePath, lock.lockedBy, lock.lockedAt);
      return true;
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return false; // Already locked
      }
      throw err;
    }
  },

  cleanupExpired(maxAgeMs: number): number {
    const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();
    const stmt = db!.prepare('DELETE FROM file_locks WHERE locked_at < ?');
    const result = stmt.run(cutoffIso);
    return result.changes;
  },

  release(projectId: string, filePath: string, lockedBy: string): boolean {
    const stmt = db!.prepare('DELETE FROM file_locks WHERE project_id = ? AND file_path = ? AND locked_by = ?');
    const result = stmt.run(projectId, filePath, lockedBy);
    return result.changes > 0;
  },

  releaseAllByOwner(lockedBy: string): void {
    const stmt = db!.prepare('DELETE FROM file_locks WHERE locked_by = ?');
    stmt.run(lockedBy);
  },

  releaseAllByProject(projectId: string): void {
    const stmt = db!.prepare('DELETE FROM file_locks WHERE project_id = ?');
    stmt.run(projectId);
  },
};

// Audit operations
export const auditDb = {
  append(event: AuditEvent): void {
    const stmt = db!.prepare(`
      INSERT INTO audit_events (id, project_id, actor_type, actor_id, action_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.id,
      event.projectId || null,
      event.actorType,
      event.actorId || null,
      event.actionType,
      JSON.stringify(event.payload),
      event.createdAt
    );
  },

  getRecent(limit: number = 1000, offset: number = 0): AuditEvent[] {
    const stmt = db!.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const rows = stmt.all(limit, offset) as any[];
    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      actionType: row.action_type,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }));
  },

  getByProject(projectId: string, limit: number = 1000): AuditEvent[] {
    const stmt = db!.prepare('SELECT * FROM audit_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(projectId, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      actionType: row.action_type,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }));
  },

  getCount(): number {
    const stmt = db!.prepare('SELECT COUNT(*) as count FROM audit_events');
    const row = stmt.get() as any;
    return row.count;
  },
};

// Close database connection
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
