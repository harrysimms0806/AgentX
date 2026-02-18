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
