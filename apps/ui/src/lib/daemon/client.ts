import { DAEMON_API_PREFIX, RETRY_CONFIG, SESSION_CLIENT_ID } from './config';
import type { FileNode, TerminalSession } from '@agentx/api-types';

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  daemonPort: number;
  uiPort: number;
  timestamp: string;
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
  retrievalDebug?: ContextSnippet[];
}

export interface ProjectBriefSnippet {
  id: string;
  snippet: ContextSnippet;
  pinnedAt: string;
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

export async function readFile(projectId: string, filePath: string, token: string | null) {
  const query = new URLSearchParams({ projectId, path: filePath }).toString();
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
  name: string;
  description: string;
  allowedAgents: string[];
  requiredApprovals: Array<'write_files' | 'run_commands' | 'git_commit'>;
  steps: string[];
}

export interface WorkflowRun {
  id: string;
  templateId: string;
  projectId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  checkpointBefore?: string;
  checkpointAfter?: string;
  steps: Array<{ id: string; label: string; status: 'pending' | 'running' | 'succeeded' | 'failed'; startedAt?: string; endedAt?: string }>;
}

export async function getWorkflowTemplates(token: string | null) {
  return daemonRequest<{ templates: WorkflowTemplate[] }>('/workflows/templates', {}, token);
}

export async function startWorkflowRun(projectId: string, templateId: string, token: string | null) {
  return daemonRequest<{ run: WorkflowRun }>('/workflows/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, templateId }),
  }, token);
}

export async function getWorkflowRuns(projectId: string, token: string | null) {
  const query = new URLSearchParams({ projectId }).toString();
  return daemonRequest<{ runs: WorkflowRun[] }>(`/workflows/runs?${query}`, {}, token);
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
