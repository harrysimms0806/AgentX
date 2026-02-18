import { DAEMON_API_PREFIX, SESSION_CLIENT_ID } from './config';

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

async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
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

  const res = await fetch(`${DAEMON_API_PREFIX}${normalizedPath}`, {
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
