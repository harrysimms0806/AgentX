import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../database/agentx.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
export function initDatabase() {
  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      git_root TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#007AFF',
      icon TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'offline',
      avatar TEXT,
      provider TEXT NOT NULL,
      model TEXT,
      capabilities TEXT, -- JSON array
      config TEXT, -- JSON object
      stats_tasks_completed INTEGER DEFAULT 0,
      stats_tasks_failed INTEGER DEFAULT 0,
      stats_avg_response_time INTEGER DEFAULT 0,
      stats_total_cost REAL DEFAULT 0,
      stats_uptime REAL DEFAULT 0,
      last_active DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      agent_id TEXT,
      project_id TEXT,
      workspace_path TEXT NOT NULL,
      git_root TEXT,
      context TEXT, -- JSON object
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      cost REAL,
      error_code TEXT,
      error_message TEXT,
      error_recoverable BOOLEAN,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // Task logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT, -- JSON object
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Workspace locks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_locks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      git_root TEXT NOT NULL,
      locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // Integrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT DEFAULT 'disconnected',
      config TEXT, -- JSON object (encrypted API keys)
      last_sync DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Workflows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT, -- JSON array
      edges TEXT, -- JSON array
      trigger_type TEXT,
      trigger_config TEXT, -- JSON object
      enabled BOOLEAN DEFAULT false,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default agents
  const defaultAgents = [
    {
      id: 'bud',
      name: 'Bud',
      type: 'coordinator',
      provider: 'OpenClaw',
      model: null,
      capabilities: JSON.stringify(['planning', 'coordination', 'documentation', 'review']),
      avatar: '🌱',
      config: JSON.stringify({ maxConcurrentTasks: 5, timeout: 30000, retryAttempts: 3 }),
    },
    {
      id: 'codex',
      name: 'Codex',
      type: 'builder',
      provider: 'OpenAI',
      model: 'gpt-5.3-codex',
      capabilities: JSON.stringify(['code-generation', 'refactoring', 'debugging', 'architecture']),
      avatar: '🤖',
      config: JSON.stringify({ maxConcurrentTasks: 2, timeout: 120000, retryAttempts: 2 }),
    },
    {
      id: 'local',
      name: 'Local',
      type: 'local',
      provider: 'Ollama',
      model: 'qwen2.5-coder:14b',
      capabilities: JSON.stringify(['quick-edits', 'css', 'simple-fixes']),
      avatar: '💻',
      config: JSON.stringify({ maxConcurrentTasks: 1, timeout: 60000, retryAttempts: 1 }),
    },
  ];

  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agents (id, name, type, provider, model, capabilities, avatar, config)
    VALUES (@id, @name, @type, @provider, @model, @capabilities, @avatar, @config)
  `);

  for (const agent of defaultAgents) {
    insertAgent.run(agent);
  }

  console.log('✅ Database initialized');
}

export default db;
