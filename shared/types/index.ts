// Agent Types
export interface Agent {
  id: string;
  name: string;
  displayName?: string;
  type: 'coordinator' | 'builder' | 'local' | 'cloud';
  status: 'idle' | 'working' | 'success' | 'error' | 'offline';
  avatar: AgentAvatar;
  provider: string;
  model?: string;
  capabilities: string[];
  currentTask?: Task;
  stats: AgentStats;
  lastActive: Date;
  config: AgentConfig;
  policy: AgentPolicy;
  routing: AgentRouting;
  metadata: AgentMetadata;
}

export interface AgentAvatar {
  mode: 'emoji' | 'image' | 'initials';
  emoji?: string;
  imageUrl?: string;
  initials?: string;
  backgroundColor?: string;
}

export interface AgentPolicy {
  allow: ('read' | 'write' | 'exec' | 'admin')[];
  deny: ('read' | 'write' | 'exec' | 'admin')[];
  requiresApproval: ('read' | 'write' | 'exec' | 'admin')[];
  scopes: {
    folders: string[];
    repos: string[];
  };
  budgets: {
    dailyCost?: number;
    monthlyCost?: number;
    maxConcurrent: number;
  };
}

export interface AgentRouting {
  priority: number;
  autoAssign: boolean;
}

export interface AgentMetadata {
  description?: string;
  icon?: string;
  category?: string;
}

export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  avgResponseTime: number;
  totalCost: number;
  uptime: number;
}

export interface AgentConfig {
  apiKey?: string;
  endpoint?: string;
  maxConcurrentTasks: number;
  timeout: number;
  retryAttempts: number;
}

// Task Types
export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  projectId: string;
  workspacePath: string;
  gitRoot?: string;
  context: TaskContext;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  logs: TaskLog[];
  cost?: number;
  error?: TaskError;
}

export interface TaskContext {
  files: string[];
  prompt: string;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TaskLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface TaskError {
  code: string;
  message: string;
  stack?: string;
  recoverable: boolean;
}

// Project Types
export interface Project {
  id: string;
  name: string;
  path: string;
  gitRoot: string;
  description?: string;
  color: string;
  icon?: string;
  status: 'active' | 'archived' | 'paused';
  agents: string[];
  tasks: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Workspace Lock Types
export interface WorkspaceLock {
  id: string;
  projectId: string;
  agentId: string;
  taskId: string;
  folderPath: string;
  gitRoot: string;
  lockedAt: Date;
  expiresAt?: Date;
}

// User Types
export interface User {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  defaultAgent: string;
  notifications: boolean;
  autoApprove: boolean;
}

// Workflow Types
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  trigger: WorkflowTrigger;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'condition' | 'action' | 'delay' | 'notification';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export interface WorkflowTrigger {
  type: 'manual' | 'scheduled' | 'webhook' | 'event';
  config: Record<string, unknown>;
}

// Integration Types
export interface Integration {
  id: string;
  name: string;
  type: 'api' | 'service' | 'database' | 'messaging';
  provider: string;
  status: 'connected' | 'disconnected' | 'error';
  config: Record<string, unknown>;
  lastSync?: Date;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// WebSocket Message Types
export type WebSocketMessage =
  | { type: 'agent:status'; payload: { agentId: string; status: Agent['status'] } }
  | { type: 'task:update'; payload: Task }
  | { type: 'task:created'; payload: Task }
  | { type: 'task:log'; payload: { taskId: string; log: TaskLog } }
  | { type: 'workspace:lock'; payload: WorkspaceLock }
  | { type: 'workspace:unlock'; payload: { lockId: string } }
  | { type: 'error'; payload: { message: string } };
