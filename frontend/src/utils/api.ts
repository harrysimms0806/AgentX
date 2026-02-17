import type { Agent, Project, Task } from '../types/index.js';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

type DbAgent = {
  id: string;
  name: string;
  type: Agent['type'];
  status: Agent['status'];
  avatar?: string;
  provider: string;
  model?: string;
  capabilities: string[];
  config?: Partial<Agent['config']>;
  stats_tasks_completed: number;
  stats_tasks_failed: number;
  stats_avg_response_time: number;
  stats_total_cost: number;
  stats_uptime: number;
  last_active?: string;
};

type DbTask = {
  id: string;
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  agent_id: string | null;
  project_id: string | null;
  workspace_path: string;
  git_root?: string;
  context?: Task['context'];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  cost?: number;
  error?: Task['error'];
};

type DbProject = {
  id: string;
  name: string;
  path: string;
  git_root: string;
  description?: string;
  color: string;
  icon?: string;
  status: Project['status'];
  created_at: string;
  updated_at: string;
};

export interface DashboardStats {
  activeAgents: number;
  pendingTasks: number;
  runningTasks: number;
  completedToday: number;
}

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const mapAgent = (agent: DbAgent): Agent => ({
  id: agent.id,
  name: agent.name,
  displayName: agent.name,
  type: agent.type,
  status: agent.status,
  avatar: {
    mode: 'emoji',
    emoji: agent.avatar || '🤖',
  },
  provider: agent.provider,
  model: agent.model,
  capabilities: agent.capabilities || [],
  stats: {
    tasksCompleted: agent.stats_tasks_completed || 0,
    tasksFailed: agent.stats_tasks_failed || 0,
    avgResponseTime: agent.stats_avg_response_time || 0,
    totalCost: agent.stats_total_cost || 0,
    uptime: agent.stats_uptime || 0,
  },
  lastActive: agent.last_active ? new Date(agent.last_active) : new Date(),
  config: {
    maxConcurrentTasks: agent.config?.maxConcurrentTasks || 1,
    timeout: agent.config?.timeout || 30000,
    retryAttempts: agent.config?.retryAttempts || 1,
  },
  policy: {
    allow: ['read'],
    deny: [],
    requiresApproval: [],
    scopes: { folders: [], repos: [] },
    budgets: { maxConcurrent: agent.config?.maxConcurrentTasks || 1 },
  },
  routing: { priority: 0, autoAssign: false },
  metadata: { description: `${agent.provider} agent` },
});

const mapTask = (task: DbTask): Task => ({
  id: task.id,
  title: task.title,
  description: task.description || '',
  status: task.status,
  priority: task.priority,
  agentId: task.agent_id || '',
  projectId: task.project_id || '',
  workspacePath: task.workspace_path,
  gitRoot: task.git_root,
  context: task.context || { files: [], prompt: '' },
  createdAt: new Date(task.created_at),
  startedAt: task.started_at ? new Date(task.started_at) : undefined,
  completedAt: task.completed_at ? new Date(task.completed_at) : undefined,
  logs: [],
  cost: task.cost,
  error: task.error,
});

const mapProject = (project: DbProject): Project => ({
  id: project.id,
  name: project.name,
  path: project.path,
  gitRoot: project.git_root,
  description: project.description,
  color: project.color,
  icon: project.icon,
  status: project.status,
  agents: [],
  tasks: [],
  createdAt: new Date(project.created_at),
  updatedAt: new Date(project.updated_at),
});

export async function createAgent(payload: {
  name: string;
  type: Agent['type'];
  provider: string;
  model?: string;
  capabilities?: string[];
  avatar?: string;
  config?: { maxConcurrentTasks?: number; timeout?: number };
}): Promise<Agent> {
  const response = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await parseJson<ApiResponse<DbAgent>>(response);
  return mapAgent(result.data);
}

export async function deleteAgent(id: string): Promise<void> {
  await fetch(`/api/agents/${id}`, { method: 'DELETE' });
}

export async function getAgents(): Promise<Agent[]> {
  const result = await parseJson<ApiResponse<DbAgent[]>>(await fetch('/api/agents'));
  return result.data.map(mapAgent);
}

export async function getTasks(): Promise<Task[]> {
  const result = await parseJson<ApiResponse<DbTask[]>>(await fetch('/api/tasks'));
  return result.data.map(mapTask);
}

export async function getProjects(): Promise<Project[]> {
  const result = await parseJson<ApiResponse<DbProject[]>>(await fetch('/api/projects'));
  return result.data.map(mapProject);
}

export async function getStats(): Promise<DashboardStats> {
  const result = await parseJson<ApiResponse<DashboardStats>>(await fetch('/api/stats'));
  return result.data;
}

export async function createTask(payload: {
  title: string;
  description: string;
  priority: Task['priority'];
  agentId: string;
  projectId: string;
  workspacePath: string;
}): Promise<Task> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await parseJson<ApiResponse<DbTask>>(response);
  return mapTask(result.data);
}

export async function deleteTask(id: string): Promise<void> {
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
}

export async function updateTaskStatus(id: string, status: Task['status']): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const result = await parseJson<ApiResponse<DbTask>>(response);
  return mapTask(result.data);
}

export async function createProject(payload: { name: string; path: string; description?: string }): Promise<Project> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await parseJson<ApiResponse<DbProject>>(response);
  return mapProject(result.data);
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
}

// ========== Integrations ==========
export type { Integration } from '../types/index.js';

interface DbIntegration {
  id: string;
  name: string;
  type: 'api' | 'service' | 'database' | 'messaging';
  provider: string;
  status: 'connected' | 'disconnected' | 'error';
  config: string;
  created_at: string;
  last_sync?: string;
}

const mapIntegration = (integration: DbIntegration): import('../types/index.js').Integration => ({
  id: integration.id,
  name: integration.name,
  type: integration.type,
  provider: integration.provider,
  status: integration.status,
  config: integration.config ? JSON.parse(integration.config) : {},
  lastSync: integration.last_sync ? new Date(integration.last_sync) : undefined,
});

export async function getIntegrations(): Promise<import('../types/index.js').Integration[]> {
  const result = await parseJson<ApiResponse<DbIntegration[]>>(await fetch('/api/integrations'));
  return result.data.map(mapIntegration);
}

export async function createIntegration(payload: {
  name: string;
  type: 'api' | 'service' | 'database' | 'messaging';
  provider: string;
  config?: Record<string, unknown>;
}): Promise<import('../types/index.js').Integration> {
  const response = await fetch('/api/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await parseJson<ApiResponse<DbIntegration>>(response);
  return mapIntegration(result.data);
}

export async function updateIntegrationStatus(id: string, status: 'connected' | 'disconnected' | 'error'): Promise<import('../types/index.js').Integration> {
  const response = await fetch(`/api/integrations/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const result = await parseJson<ApiResponse<DbIntegration>>(response);
  return mapIntegration(result.data);
}

export async function deleteIntegration(id: string): Promise<void> {
  await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
}

export async function testIntegration(id: string): Promise<{ success: boolean; message: string }> {
  const result = await parseJson<ApiResponse<{ success: boolean; message: string }>>(
    await fetch(`/api/integrations/${id}/test`, { method: 'POST' })
  );
  return result.data;
}

// ========== Audit Logs ==========
export interface AuditLog {
  id: string;
  timestamp: Date;
  agentId?: string;
  agentName?: string;
  integration?: string;
  actionType: string;
  action: string;
  result: 'success' | 'failure' | 'blocked';
  details?: Record<string, unknown>;
}

interface DbAuditLog {
  id: string;
  timestamp: string;
  agent_id?: string;
  agent_name?: string;
  integration?: string;
  action_type: string;
  action: string;
  result: string;
  details?: string;
}

const mapAuditLog = (log: DbAuditLog): AuditLog => ({
  id: log.id,
  timestamp: new Date(log.timestamp),
  agentId: log.agent_id,
  agentName: log.agent_name,
  integration: log.integration,
  actionType: log.action_type,
  action: log.action,
  result: log.result as AuditLog['result'],
  details: log.details ? JSON.parse(log.details) : undefined,
});

export async function getAuditLogs(filters?: {
  agentId?: string;
  actionType?: string;
  result?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (filters?.agentId) params.append('agentId', filters.agentId);
  if (filters?.actionType) params.append('actionType', filters.actionType);
  if (filters?.result) params.append('result', filters.result);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  
  const result = await parseJson<ApiResponse<DbAuditLog[]>>(
    await fetch(`/api/audit?${params.toString()}`)
  );
  return result.data.map(mapAuditLog);
}

// ========== Workspace Locks ==========
export interface WorkspaceLock {
  id: string;
  projectId: string;
  projectName: string;
  projectColor?: string;
  agentId: string;
  agentName: string;
  taskId: string;
  folderPath: string;
  gitRoot?: string;
  lockedAt: Date;
  expiresAt?: Date;
}

interface DbWorkspaceLock {
  id: string;
  project_id: string;
  project_name: string;
  project_color?: string;
  agent_id: string;
  agent_name: string;
  task_id: string;
  folder_path: string;
  git_root?: string;
  locked_at: string;
  expires_at?: string;
}

const mapWorkspaceLock = (lock: DbWorkspaceLock): WorkspaceLock => ({
  id: lock.id,
  projectId: lock.project_id,
  projectName: lock.project_name,
  projectColor: lock.project_color,
  agentId: lock.agent_id,
  agentName: lock.agent_name,
  taskId: lock.task_id,
  folderPath: lock.folder_path,
  gitRoot: lock.git_root,
  lockedAt: new Date(lock.locked_at),
  expiresAt: lock.expires_at ? new Date(lock.expires_at) : undefined,
});

export async function getWorkspaceLocks(): Promise<WorkspaceLock[]> {
  const result = await parseJson<ApiResponse<DbWorkspaceLock[]>>(await fetch('/api/locks'));
  return result.data.map(mapWorkspaceLock);
}

export async function releaseLock(lockId: string): Promise<void> {
  await fetch(`/api/locks/${lockId}`, { method: 'DELETE' });
}

// ========== Config ==========
export interface Config {
  agents: Agent[];
  integrations: import('../types/index.js').Integration[];
  uiSettings: {
    theme: 'light' | 'dark' | 'system';
    sidebarCollapsed: boolean;
  };
  settingsPointers: {
    agents: string;
    integrations: string;
    projects: string;
    security: string;
  };
}

export async function getConfig(): Promise<Config> {
  const result = await parseJson<ApiResponse<Config>>(await fetch('/api/config'));
  return result.data;
}

export async function getConfigHealth(): Promise<{
  loaded: boolean;
  configPath?: string;
  lastReload?: string;
  errors?: string[];
}> {
  const result = await parseJson<ApiResponse<{
    loaded: boolean;
    configPath?: string;
    lastReload?: string;
    errors?: string[];
  }>>(await fetch('/api/config/health'));
  return result.data;
}
