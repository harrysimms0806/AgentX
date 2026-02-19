// Database module for AgentX Daemon
// SQLite persistence for Phase 2

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { Project, Run, AuditEvent, FileLock } from '@agentx/api-types';
import type { ProjectPolicy } from './policy-engine';

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


  // Project policies table (Epic 3)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_policies (
      project_id TEXT PRIMARY KEY,
      policy_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);


  db.exec(`
    CREATE TABLE IF NOT EXISTS project_brief_snippets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      snippet_json TEXT NOT NULL,
      pinned_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Context packs table (Phase 5)
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_packs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      run_id TEXT,
      created_at TEXT NOT NULL,
      size_chars INTEGER NOT NULL,
      sections_json TEXT NOT NULL,
      snippet_ids_json TEXT,
      retrieval_debug_json TEXT,
      truncated INTEGER NOT NULL DEFAULT 0,
      budget_chars INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);


  db.exec(`
    CREATE TABLE IF NOT EXISTS bud_sessions (
      session_id TEXT PRIMARY KEY,
      run_id TEXT,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_known_task TEXT,
      last_seen_at TEXT NOT NULL
    )
  `);



  db.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      tool_name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      requested_permissions_json TEXT NOT NULL,
      approved_permissions_json TEXT NOT NULL,
      source_code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);


  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      step_json TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_run_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      workflow_step_id TEXT,
      step_order INTEGER NOT NULL,
      status TEXT NOT NULL,
      output_json TEXT,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approved_at TEXT,
      started_at TEXT,
      ended_at TEXT,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_context_packs_project ON context_packs(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_context_packs_run ON context_packs(run_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_policies_updated ON project_policies(updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_brief_project ON project_brief_snippets(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bud_sessions_project ON bud_sessions(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bud_sessions_expires ON bud_sessions(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(run_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status)');
}


export interface BudSessionRecord {
  sessionId: string;
  runId?: string;
  projectId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastKnownTask?: string;
  lastSeenAt: string;
}

type StoredContextPack = {
  id: string;
  projectId: string;
  runId?: string;
  createdAt: string;
  sections: {
    summary: string;
    activeTask?: string;
    files: Array<{ path: string; summary: string }>;
    gitStatus: string;
    memories: string[];
    userNotes: string;
  };
  sizeChars: number;
  retrievedSnippetIds?: string[];
  retrievalDebug?: Array<{ id: string; sourceType: 'file' | 'run' | 'chat'; sourceRef: string; score: number; reason: string; updatedAt: string; contentPreview?: string }>;
  truncated?: boolean;
  budgetChars?: number;
};

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

export const contextPackDb = {
  create(pack: StoredContextPack): void {
    const stmt = db!.prepare(`
      INSERT OR REPLACE INTO context_packs (
        id, project_id, run_id, created_at, size_chars, sections_json, snippet_ids_json, retrieval_debug_json, truncated, budget_chars
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pack.id,
      pack.projectId,
      pack.runId || null,
      pack.createdAt,
      pack.sizeChars,
      JSON.stringify(pack.sections),
      JSON.stringify(pack.retrievedSnippetIds || []),
      JSON.stringify(pack.retrievalDebug || []),
      pack.truncated ? 1 : 0,
      pack.budgetChars || null,
    );
  },

  getById(id: string): StoredContextPack | undefined {
    const stmt = db!.prepare('SELECT * FROM context_packs WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id || undefined,
      createdAt: row.created_at,
      sizeChars: row.size_chars,
      sections: JSON.parse(row.sections_json),
      retrievedSnippetIds: row.snippet_ids_json ? JSON.parse(row.snippet_ids_json) : [],
      retrievalDebug: row.retrieval_debug_json ? JSON.parse(row.retrieval_debug_json) : [],
      truncated: Boolean(row.truncated),
      budgetChars: row.budget_chars || undefined,
    };
  },

  getByProject(projectId: string, runId?: string): StoredContextPack[] {
    const rows = runId
      ? db!.prepare('SELECT * FROM context_packs WHERE project_id = ? AND run_id = ? ORDER BY created_at DESC').all(projectId, runId)
      : db!.prepare('SELECT * FROM context_packs WHERE project_id = ? ORDER BY created_at DESC').all(projectId);

    return (rows as any[]).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id || undefined,
      createdAt: row.created_at,
      sizeChars: row.size_chars,
      sections: JSON.parse(row.sections_json),
      retrievedSnippetIds: row.snippet_ids_json ? JSON.parse(row.snippet_ids_json) : [],
      retrievalDebug: row.retrieval_debug_json ? JSON.parse(row.retrieval_debug_json) : [],
      truncated: Boolean(row.truncated),
      budgetChars: row.budget_chars || undefined,
    }));
  },
};


export const projectBriefDb = {
  list(projectId: string): Array<{ id: string; snippet: any; pinnedAt: string }> {
    const stmt = db!.prepare('SELECT id, snippet_json, pinned_at FROM project_brief_snippets WHERE project_id = ? ORDER BY pinned_at DESC');
    const rows = stmt.all(projectId) as any[];
    return rows.map((row) => ({
      id: row.id,
      snippet: JSON.parse(row.snippet_json),
      pinnedAt: row.pinned_at,
    }));
  },

  upsert(projectId: string, id: string, snippet: Record<string, unknown>): void {
    const stmt = db!.prepare(`
      INSERT INTO project_brief_snippets (id, project_id, snippet_json, pinned_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET snippet_json = excluded.snippet_json, pinned_at = excluded.pinned_at
    `);
    stmt.run(id, projectId, JSON.stringify(snippet), new Date().toISOString());
  },

  remove(projectId: string, id: string): boolean {
    const stmt = db!.prepare('DELETE FROM project_brief_snippets WHERE project_id = ? AND id = ?');
    const result = stmt.run(projectId, id);
    return result.changes > 0;
  },
};

// Close database connection
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export const policyDb = {
  getByProject(projectId: string): ProjectPolicy | undefined {
    const stmt = db!.prepare('SELECT policy_json FROM project_policies WHERE project_id = ?');
    const row = stmt.get(projectId) as any;
    if (!row) return undefined;
    return JSON.parse(row.policy_json);
  },

  upsert(projectId: string, policy: ProjectPolicy): void {
    const stmt = db!.prepare(`
      INSERT INTO project_policies (project_id, policy_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id)
      DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at
    `);

    stmt.run(projectId, JSON.stringify(policy), new Date().toISOString());
  },
};




export const budSessionDb = {
  upsert(session: BudSessionRecord): void {
    const stmt = db!.prepare(`
      INSERT INTO bud_sessions (
        session_id, run_id, project_id, status, created_at, updated_at, expires_at, last_known_task, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id)
      DO UPDATE SET
        run_id = excluded.run_id,
        status = excluded.status,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at,
        last_known_task = excluded.last_known_task,
        last_seen_at = excluded.last_seen_at
    `);

    stmt.run(
      session.sessionId,
      session.runId || null,
      session.projectId,
      session.status,
      session.createdAt,
      session.updatedAt,
      session.expiresAt,
      session.lastKnownTask || null,
      session.lastSeenAt,
    );
  },

  list(projectId?: string): BudSessionRecord[] {
    this.cleanupExpired();
    const rows = projectId
      ? db!.prepare('SELECT * FROM bud_sessions WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db!.prepare('SELECT * FROM bud_sessions ORDER BY updated_at DESC').all();
    return (rows as any[]).map(mapBudSessionRow);
  },

  getById(sessionId: string): BudSessionRecord | undefined {
    this.cleanupExpired();
    const row = db!.prepare('SELECT * FROM bud_sessions WHERE session_id = ?').get(sessionId) as any;
    return row ? mapBudSessionRow(row) : undefined;
  },


  getByRunId(runId: string): BudSessionRecord | undefined {
    this.cleanupExpired();
    const row = db!.prepare('SELECT * FROM bud_sessions WHERE run_id = ? ORDER BY updated_at DESC LIMIT 1').get(runId) as any;
    return row ? mapBudSessionRow(row) : undefined;
  },

  cleanupExpired(): number {
    const stmt = db!.prepare('DELETE FROM bud_sessions WHERE expires_at < ?');
    const result = stmt.run(new Date().toISOString());
    return result.changes;
  },
};

function mapBudSessionRow(row: any): BudSessionRecord {
  return {
    sessionId: row.session_id,
    runId: row.run_id || undefined,
    projectId: row.project_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    lastKnownTask: row.last_known_task || undefined,
    lastSeenAt: row.last_seen_at,
  };
}


export const pluginDb = {
  create(plugin: { id: string; name: string; version: string; description: string; toolName: string; status: string; requestedPermissions: string[]; approvedPermissions: string[]; sourceCode: string; createdAt: string; updatedAt: string }): void {
    db!.prepare(`
      INSERT INTO plugins (
        id, name, version, description, tool_name, status, requested_permissions_json, approved_permissions_json, source_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plugin.id,
      plugin.name,
      plugin.version,
      plugin.description,
      plugin.toolName,
      plugin.status,
      JSON.stringify(plugin.requestedPermissions),
      JSON.stringify(plugin.approvedPermissions),
      plugin.sourceCode,
      plugin.createdAt,
      plugin.updatedAt,
    );
  },

  list(): Array<{ id: string; name: string; version: string; description: string; toolName: string; status: 'pending' | 'active' | 'disabled'; requestedPermissions: string[]; approvedPermissions: string[]; sourceCode: string; createdAt: string; updatedAt: string }> {
    const rows = db!.prepare('SELECT * FROM plugins ORDER BY updated_at DESC').all() as any[];
    return rows.map(mapPluginRow);
  },

  getById(pluginId: string): { id: string; name: string; version: string; description: string; toolName: string; status: 'pending' | 'active' | 'disabled'; requestedPermissions: string[]; approvedPermissions: string[]; sourceCode: string; createdAt: string; updatedAt: string } | undefined {
    const row = db!.prepare('SELECT * FROM plugins WHERE id = ?').get(pluginId) as any;
    return row ? mapPluginRow(row) : undefined;
  },

  getByToolName(toolName: string): { id: string; name: string; version: string; description: string; toolName: string; status: 'pending' | 'active' | 'disabled'; requestedPermissions: string[]; approvedPermissions: string[]; sourceCode: string; createdAt: string; updatedAt: string } | undefined {
    const row = db!.prepare('SELECT * FROM plugins WHERE tool_name = ?').get(toolName) as any;
    return row ? mapPluginRow(row) : undefined;
  },

  updateApproval(pluginId: string, approvedPermissions: string[], status: 'pending' | 'active' | 'disabled'): { id: string; name: string; version: string; description: string; toolName: string; status: 'pending' | 'active' | 'disabled'; requestedPermissions: string[]; approvedPermissions: string[]; sourceCode: string; createdAt: string; updatedAt: string } {
    const now = new Date().toISOString();
    db!.prepare('UPDATE plugins SET approved_permissions_json = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(approvedPermissions), status, now, pluginId);
    const updated = this.getById(pluginId);
    if (!updated) throw new Error('Plugin not found after update');
    return updated;
  },
};

function mapPluginRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description || '',
    toolName: row.tool_name,
    status: row.status,
    requestedPermissions: JSON.parse(row.requested_permissions_json || '[]'),
    approvedPermissions: JSON.parse(row.approved_permissions_json || '[]'),
    sourceCode: row.source_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


export const workflowDb = {
  createWorkflow(input: { id: string; projectId: string; name: string; definitionJson: string; createdAt: string; updatedAt: string; steps: Array<{ id: string; order: number; stepJson: string }> }): void {
    const workflowStmt = db!.prepare(`
      INSERT INTO workflows (id, project_id, name, definition_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const stepStmt = db!.prepare(`
      INSERT INTO workflow_steps (id, workflow_id, step_order, step_json)
      VALUES (?, ?, ?, ?)
    `);

    const tx = db!.transaction(() => {
      workflowStmt.run(input.id, input.projectId, input.name, input.definitionJson, input.createdAt, input.updatedAt);
      for (const step of input.steps) {
        stepStmt.run(step.id, input.id, step.order, step.stepJson);
      }
    });
    tx();
  },

  listWorkflows(projectId: string): Array<{ id: string; projectId: string; name: string; definitionJson: string; createdAt: string; updatedAt: string; steps: Array<{ id: string; order: number; stepJson: string }> }> {
    const workflows = db!.prepare('SELECT * FROM workflows WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
    const stepsStmt = db!.prepare('SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order ASC');

    return workflows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      definitionJson: row.definition_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: (stepsStmt.all(row.id) as any[]).map((s) => ({ id: s.id, order: s.step_order, stepJson: s.step_json })),
    }));
  },

  getWorkflow(id: string): { id: string; projectId: string; name: string; definitionJson: string; createdAt: string; updatedAt: string; steps: Array<{ id: string; order: number; stepJson: string }> } | undefined {
    const row = db!.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    const steps = db!.prepare('SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order ASC').all(id) as any[];
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      definitionJson: row.definition_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: steps.map((s) => ({ id: s.id, order: s.step_order, stepJson: s.step_json })),
    };
  },

  createRun(run: { id: string; workflowId: string; projectId: string; status: string; inputJson: string; createdAt: string; startedAt?: string; endedAt?: string; steps: Array<{ id: string; workflowStepId?: string; order: number; status: string; outputJson?: string; requiresApproval: boolean; approvedAt?: string; startedAt?: string; endedAt?: string }> }): void {
    const runStmt = db!.prepare(`
      INSERT INTO workflow_runs (id, workflow_id, project_id, status, input_json, created_at, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const runStepStmt = db!.prepare(`
      INSERT INTO workflow_run_steps (id, run_id, workflow_step_id, step_order, status, output_json, requires_approval, approved_at, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db!.transaction(() => {
      runStmt.run(run.id, run.workflowId, run.projectId, run.status, run.inputJson, run.createdAt, run.startedAt || null, run.endedAt || null);
      for (const step of run.steps) {
        runStepStmt.run(step.id, run.id, step.workflowStepId || null, step.order, step.status, step.outputJson || null, step.requiresApproval ? 1 : 0, step.approvedAt || null, step.startedAt || null, step.endedAt || null);
      }
    });
    tx();
  },

  updateRunStatus(runId: string, status: string, startedAt?: string, endedAt?: string): void {
    db!.prepare('UPDATE workflow_runs SET status = ?, started_at = COALESCE(?, started_at), ended_at = COALESCE(?, ended_at) WHERE id = ?')
      .run(status, startedAt || null, endedAt || null, runId);
  },

  updateRunStep(stepId: string, updates: { status?: string; outputJson?: string; approvedAt?: string; startedAt?: string; endedAt?: string }): void {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.outputJson !== undefined) { fields.push('output_json = ?'); values.push(updates.outputJson); }
    if (updates.approvedAt !== undefined) { fields.push('approved_at = ?'); values.push(updates.approvedAt); }
    if (updates.startedAt !== undefined) { fields.push('started_at = ?'); values.push(updates.startedAt); }
    if (updates.endedAt !== undefined) { fields.push('ended_at = ?'); values.push(updates.endedAt); }
    if (fields.length === 0) return;
    values.push(stepId);
    db!.prepare(`UPDATE workflow_run_steps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  listRuns(projectId: string): any[] {
    const runs = db!.prepare('SELECT * FROM workflow_runs WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[];
    const stepStmt = db!.prepare('SELECT * FROM workflow_run_steps WHERE run_id = ? ORDER BY step_order ASC');
    return runs.map((r) => ({
      id: r.id,
      workflowId: r.workflow_id,
      projectId: r.project_id,
      status: r.status,
      inputJson: r.input_json,
      createdAt: r.created_at,
      startedAt: r.started_at || undefined,
      endedAt: r.ended_at || undefined,
      steps: (stepStmt.all(r.id) as any[]).map((s) => ({
        id: s.id,
        workflowStepId: s.workflow_step_id || undefined,
        order: s.step_order,
        status: s.status,
        outputJson: s.output_json || undefined,
        requiresApproval: Boolean(s.requires_approval),
        approvedAt: s.approved_at || undefined,
        startedAt: s.started_at || undefined,
        endedAt: s.ended_at || undefined,
      })),
    }));
  },

  getRun(runId: string): any | undefined {
    const row = db!.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId) as any;
    if (!row) return undefined;
    const steps = db!.prepare('SELECT * FROM workflow_run_steps WHERE run_id = ? ORDER BY step_order ASC').all(runId) as any[];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      projectId: row.project_id,
      status: row.status,
      inputJson: row.input_json,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      endedAt: row.ended_at || undefined,
      steps: steps.map((s) => ({
        id: s.id,
        workflowStepId: s.workflow_step_id || undefined,
        order: s.step_order,
        status: s.status,
        outputJson: s.output_json || undefined,
        requiresApproval: Boolean(s.requires_approval),
        approvedAt: s.approved_at || undefined,
        startedAt: s.started_at || undefined,
        endedAt: s.ended_at || undefined,
      })),
    };
  },
};
