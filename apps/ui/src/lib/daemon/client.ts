import { DAEMON_API_PREFIX, RETRY_CONFIG, SESSION_CLIENT_ID } from './config';
import type { FileNode, TerminalSession } from '@agentx/api-types';

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  daemonPort: number;
  uiPort: number;
  timestamp: string;
  aiEngine: 'external' | 'openclaw';
  openclaw: {
    connected: boolean;
    state: 'offline' | 'reconnecting' | 'connected';
    gatewayUrl: string;
    lastError: string | null;
    connectedAt?: string;
  };
}

export interface DiscoveryResponse {
  ok: boolean;
  daemonUrl: string;
  daemonPort: number;
  uiPort: number;
  schemaVersion: string;
  startedAt: string;
  source: string;
}

export interface ApiError {
  error: string;
  code?: string;
  requestApproval?: boolean;
}

export interface FileTreeResponse {
  path: string;
  truncated: boolean;
  nodes: FileNode[];
}

export interface FileReadResponse {
  content: string;
  size: number;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  truncated?: boolean;
}

export interface GitStatusFile {
  path: string;
  stagedStatus: string;
  unstagedStatus: string;
}



export interface ProjectPolicy {
  allowedWriteGlobs: string[];
  blockedCommandPatterns: string[];
  approvalRequiredFor: Array<'write_files' | 'run_commands' | 'git_commit'>;
  maxFilesChangedPerRun: number;
}



export interface ContextSnippet {
  id: string;
  sourceType: 'file' | 'run' | 'chat';
  sourceRef: string;
  score: number;
  reason: string;
  updatedAt: string;
  contentPreview?: string;
}

export interface StoredContextPack {
  id: string;
  createdAt: string;
  runId?: string;
  sizeChars?: number;
  budgetChars?: number;
  truncated?: boolean;
  retrievalDebug?: ContextSnippet[];
}

export interface ProjectBriefSnippet {
  id: string;
  snippet: ContextSnippet;
  pinnedAt: string;
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

export interface RunRecord {
  id: string;
  status: string;
  summary?: string;
  startedAt?: string;
  endedAt?: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}) {
  let attempt = 0;
  let delay = RETRY_CONFIG.initialDelayMs;

  while (true) {
    const res = await fetch(input, init);
    attempt += 1;

    if (res.ok || attempt >= 3 || !shouldRetry(res.status)) {
      return res;
    }

    await sleep(delay);
    delay = Math.min(RETRY_CONFIG.maxDelayMs, Math.round(delay * RETRY_CONFIG.multiplier));
  }
}

export async function getDiscovery() {
  const res = await fetch(`${DAEMON_API_PREFIX}/discovery`, { cache: 'no-store' });
  if (!res.ok) {
    const error = await parseJson<ApiError>(res);
    return { ok: false as const, status: res.status, error };
  }

  const data = await parseJson<DiscoveryResponse>(res);
  return { ok: true as const, data };
}

export async function getHealth() {
  const res = await fetch(`${DAEMON_API_PREFIX}/health`, { cache: 'no-store' });
  if (!res.ok) {
    const error = await parseJson<ApiError>(res);
    return { ok: false as const, status: res.status, error };
  }

  const data = await parseJson<HealthResponse>(res);
  return { ok: true as const, data };
}

export async function createSessionToken() {
  const res = await fetch(`${DAEMON_API_PREFIX}/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: SESSION_CLIENT_ID }),
  });

  if (!res.ok) {
    const error = await parseJson<ApiError>(res);
    return { ok: false as const, status: res.status, error };
  }

  const data = await parseJson<{ token: string }>(res);
  return { ok: true as const, token: data.token };
}

export async function daemonRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ApiError }> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const isHealth = normalizedPath === '/health';

  const headers = new Headers(options.headers ?? {});
  if (!isHealth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetchWithRetry(`${DAEMON_API_PREFIX}${normalizedPath}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    const error = await parseJson<ApiError>(res);
    return { ok: false, status: res.status, error };
  }

  const data = await parseJson<T>(res);
  return { ok: true, data };
}

export async function getProjects(token: string | null) {
  return daemonRequest<Array<{ id: string; name: string }>>('/projects', {}, token);
}

export async function getFileTree(projectId: string, dirPath: string, token: string | null) {
  const query = new URLSearchParams({ projectId, path: dirPath }).toString();
  return daemonRequest<FileTreeResponse>(`/fs/tree?${query}`, {}, token);
}

export async function readFile(projectId: string, filePath: string, token: string | null, range?: { startLine?: number; endLine?: number }) {
  const query = new URLSearchParams({
    projectId,
    path: filePath,
    ...(range?.startLine ? { startLine: String(range.startLine) } : {}),
    ...(range?.endLine ? { endLine: String(range.endLine) } : {}),
  }).toString();
  return daemonRequest<FileReadResponse>(`/fs/read?${query}`, {}, token);
}

export async function getGitStatus(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ files: GitStatusFile[] }>(`/git/status?${query}`, {}, token);
}

export async function getGitDiff(projectId: string, token: string | null, filePath?: string) {
  const query = new URLSearchParams({ projectId, ...(filePath ? { path: filePath } : {}) }).toString();
  return daemonRequest<{ diff: string }>(`/git/diff?${query}`, {}, token);
}



export interface BudSessionStatusResponse {
  session: BudSessionRecord;
  run?: {
    runId: string;
    instanceId: string;
    status: string;
    iteration: number;
    maxIterations: number;
    steps: Array<{ id: string; type: string; content: string; timestamp: string }>;
  };
}

export async function spawnBud(definitionId: string, projectId: string, prompt: string, token: string | null, contextPackId?: string) {
  return daemonRequest<{ success: boolean; sessionId: string; runId: string; instance: { id: string } }>(`/agents/spawn-bud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ definitionId, projectId, prompt, contextPackId }),
  }, token);
}

export async function getBudSessionStatus(sessionId: string, token: string | null) {
  return daemonRequest<BudSessionStatusResponse>(`/agents/bud/${sessionId}/status`, {}, token);
}

export async function killBudSession(sessionId: string, token: string | null) {
  return daemonRequest<{ success: boolean }>(`/agents/bud/${sessionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  }, token);
}

export async function getOpenClawStatus(token: string | null) {
  return daemonRequest<{ aiEngine: 'external' | 'openclaw'; openclaw: { connected: boolean; state: string; gatewayUrl: string; lastError: string | null; connectedAt?: string } }>(`/openclaw/status`, {}, token);
}

export async function getBudSessions(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ sessions: BudSessionRecord[] }>(`/agents/sessions?${query}`, {}, token);
}

export async function resumeBudSession(sessionId: string, token: string | null) {
  return daemonRequest<{ success: boolean; session: BudSessionRecord }>(`/agents/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, token);
}

export async function closeBudSession(sessionId: string, token: string | null) {
  return daemonRequest<{ success: boolean }>(`/agents/sessions/${sessionId}/start-new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, token);
}

export async function getRuns(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ runs: RunRecord[] }>(`/runs?${query}`, {}, token);
}


export async function getTerminals(token: string | null, projectId: string) {
  const query = `?${new URLSearchParams({ projectId }).toString()}`;
  return daemonRequest<{ terminals: TerminalSession[] }>(`/terminals${query}`, {}, token);
}

export async function killTerminal(terminalId: string, projectId: string, token: string | null) {
  return daemonRequest<{ success: boolean; message: string }>(`/terminals/${terminalId}/kill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  }, token);
}

export async function clearTerminal(terminalId: string, projectId: string, token: string | null) {
  return daemonRequest<{ success: boolean; message: string }>(`/terminals/${terminalId}/clear`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  }, token);
}


export async function getProjectPolicy(projectId: string, token: string | null) {
  return daemonRequest<ProjectPolicy>(`/projects/${projectId}/policy`, {}, token);
}

export async function updateProjectPolicy(projectId: string, policy: ProjectPolicy, token: string | null) {
  return daemonRequest<ProjectPolicy>(`/projects/${projectId}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  }, token);
}


export async function getContextPacks(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ contextPacks: StoredContextPack[] }>(`/agents/context-packs?${query}`, {}, token);
}

export async function getProjectBrief(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ snippets: ProjectBriefSnippet[] }>(`/agents/project-brief?${query}`, {}, token);
}

export async function pinProjectBriefSnippet(projectId: string, snippet: ContextSnippet, token: string | null) {
  return daemonRequest<{ success: boolean; snippetId: string }>(`/agents/project-brief/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, snippet }),
  }, token);
}

export async function unpinProjectBriefSnippet(projectId: string, snippetId: string, token: string | null) {
  return daemonRequest<{ success: boolean }>(`/agents/project-brief/unpin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, snippetId }),
  }, token);
}


export interface WorkflowTemplate {
  id: string;
  projectId: string;
  name: string;
  steps: Array<{ id: string; label: string; type: 'spawn-agent' | 'spawn-bud' | 'handoff' | 'condition' | 'wait'; requiresApproval?: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  projectId: string;
  status: 'queued' | 'running' | 'paused' | 'succeeded' | 'failed';
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  steps: Array<{ id: string; workflowStepId?: string; order: number; status: 'pending' | 'running' | 'paused' | 'succeeded' | 'failed'; requiresApproval: boolean; approvedAt?: string; startedAt?: string; endedAt?: string }>;
}

export async function getWorkflowTemplates(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ templates: WorkflowTemplate[] }>(`/workflows/templates?${query}`, {}, token);
}

export async function createWorkflowTemplate(projectId: string, name: string, steps: Array<{ label: string; type: 'spawn-agent' | 'spawn-bud' | 'handoff' | 'condition' | 'wait'; requiresApproval?: boolean; config?: Record<string, unknown> }>, token: string | null) {
  return daemonRequest<{ workflow: WorkflowTemplate }>(`/workflows/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, name, steps }),
  }, token);
}

export async function startWorkflowRun(projectId: string, workflowId: string, token: string | null, input?: Record<string, unknown>) {
  return daemonRequest<{ run: WorkflowRun }>('/workflows/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, workflowId, input: input || {} }),
  }, token);
}

export async function approveWorkflowStep(runId: string, runStepId: string, token: string | null) {
  return daemonRequest<{ run: WorkflowRun }>(`/workflows/runs/${runId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runStepId }),
  }, token);
}

export async function getWorkflowRuns(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ runs: WorkflowRun[] }>(`/workflows/runs?${query}`, {}, token);
}



export interface IntelligenceInsight {
  id: string;
  type: 'suggestion' | 'warning';
  title: string;
  detail: string;
  blockable?: boolean;
}

export async function getIntelligenceInsights(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ insights: IntelligenceInsight[] }>(`/intelligence/insights?${query}`, {}, token);
}

export interface ObservabilityMetrics {
  runsPerDay: Array<{ day: string; count: number }>;
  avgRunDurationMs: number;
  toolCallCounts: Record<string, number>;
  failureReasons: Array<{ runId: string; reason: string }>;
  expensiveRuns: Array<{ runId: string; projectId: string; status: string; durationMs: number }>;
  generatedAt: string;
}

export async function getObservabilityMetrics(projectId: string | undefined, token: string | null) {
  const query = new URLSearchParams(projectId ? { projectId } : {}).toString();
  return daemonRequest<ObservabilityMetrics>(`/audit/metrics${query ? `?${query}` : ''}`, {}, token);
}


export interface PluginRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  toolName: string;
  status: 'pending' | 'active' | 'disabled';
  requestedPermissions: string[];
  approvedPermissions: string[];
  createdAt: string;
  updatedAt: string;
}

export async function getPlugins(token: string | null) {
  return daemonRequest<{ plugins: PluginRecord[] }>(`/plugins`, {}, token);
}

export async function installSamplePlugin(token: string | null) {
  return daemonRequest<{ plugin: PluginRecord }>(`/plugins/install-sample`, {
    method: 'POST',
  }, token);
}

export async function approvePlugin(pluginId: string, permissions: string[], token: string | null) {
  return daemonRequest<{ plugin: PluginRecord }>(`/plugins/${pluginId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions }),
  }, token);
}

export async function invokePluginTool(toolName: string, args: Record<string, unknown>, token: string | null) {
  return daemonRequest<{ result: unknown }>(`/plugins/tools/${toolName}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  }, token);
}
