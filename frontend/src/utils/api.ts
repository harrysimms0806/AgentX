import type { Agent, Project, Task } from '../types';

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

export async function createProject(payload: { name: string; path: string; description?: string }): Promise<Project> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await parseJson<ApiResponse<DbProject>>(response);
  return mapProject(result.data);
}
