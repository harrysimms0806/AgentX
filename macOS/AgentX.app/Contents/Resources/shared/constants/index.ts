export const AGENT_TYPES = {
  COORDINATOR: 'coordinator',
  BUILDER: 'builder',
  LOCAL: 'local',
  CLOUD: 'cloud',
} as const;

export const AGENT_STATUS = {
  IDLE: 'idle',
  WORKING: 'working',
  SUCCESS: 'success',
  ERROR: 'error',
  OFFLINE: 'offline',
} as const;

export const TASK_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export const PROJECT_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  PAUSED: 'paused',
} as const;

export const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/' },
  { id: 'agents', label: 'Agents', icon: 'Bot', path: '/agents' },
  { id: 'tasks', label: 'Tasks', icon: 'CheckSquare', path: '/tasks' },
  { id: 'workflows', label: 'Workflows', icon: 'Workflow', path: '/workflows' },
  { id: 'projects', label: 'Projects', icon: 'FolderOpen', path: '/projects' },
  { id: 'integrations', label: 'Integrations', icon: 'Plug', path: '/integrations' },
  { id: 'memory', label: 'Memory', icon: 'Brain', path: '/memory' },
  { id: 'logs', label: 'Logs', icon: 'ScrollText', path: '/logs' },
  { id: 'settings', label: 'Settings', icon: 'Settings', path: '/settings' },
] as const;

export const DEFAULT_AGENTS = [
  {
    id: 'bud',
    name: 'Bud',
    type: AGENT_TYPES.COORDINATOR,
    provider: 'OpenClaw',
    capabilities: ['planning', 'coordination', 'documentation', 'review'],
    avatar: '🌱',
  },
  {
    id: 'codex',
    name: 'Codex',
    type: AGENT_TYPES.BUILDER,
    provider: 'OpenAI',
    model: 'gpt-5.3-codex',
    capabilities: ['code-generation', 'refactoring', 'debugging', 'architecture'],
    avatar: '🤖',
  },
  {
    id: 'local-llm',
    name: 'Local',
    type: AGENT_TYPES.LOCAL,
    provider: 'Ollama',
    model: 'qwen2.5-coder:14b',
    capabilities: ['quick-edits', 'css', 'simple-fixes'],
    avatar: '💻',
  },
];

export const PROJECT_COLORS = [
  '#007AFF', // Blue
  '#34C759', // Green
  '#FF9500', // Orange
  '#FF3B30', // Red
  '#AF52DE', // Purple
  '#5856D6', // Indigo
  '#FF2D55', // Pink
  '#5AC8FA', // Cyan
  '#FFCC00', // Yellow
  '#8E8E93', // Gray
];
