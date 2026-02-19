'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearTerminal, closeBudSession, createSessionToken, getBudSessions, getDiscovery, getHealth, getTerminals, killTerminal, resumeBudSession, type BudSessionRecord, type HealthResponse } from '@/lib/daemon/client';
import { RETRY_CONFIG } from '@/lib/daemon/config';

export type DaemonConnectionState =
  | 'discovering'
  | 'runtime_missing'
  | 'connecting'
  | 'online'
  | 'auth_failed'
  | 'offline'
  | 'error';

interface DaemonContextType {
  connectionState: DaemonConnectionState;
  connected: boolean;
  health: HealthResponse | null;
  daemonPort: number | null;
  daemonUrl: string | null;
  discoverySource: string | null;
  currentProject: string;
  safeModeLabel: string;
  activeRuns: number;

  terminals: Array<{ id: string; title: string; status: 'active' | 'closed' | 'stale'; projectId: string }>;
  activeTerminals: number;
  staleTerminals: number;
  killTerminalSession: (id: string) => Promise<void>;
  clearStaleTerminals: () => Promise<void>;
  token: string | null;
  statusMessage: string;
  retryAttempt: number;
  lastHealthAt: string | null;
  lastAuthAt: string | null;
  resumableSession: BudSessionRecord | null;
  resumeSession: () => Promise<void>;
  startNewSession: () => Promise<void>;
}

const DaemonContext = createContext<DaemonContextType>({
  connectionState: 'discovering',
  connected: false,
  health: null,
  daemonPort: null,
  daemonUrl: null,
  discoverySource: null,
  currentProject: 'No project selected',
  safeModeLabel: 'Safe mode: on',
  activeRuns: 0,
  terminals: [],
  activeTerminals: 0,
  staleTerminals: 0,
  killTerminalSession: async () => {},
  clearStaleTerminals: async () => {},
  token: null,
  statusMessage: 'Discovering daemon runtime…',
  retryAttempt: 0,
  lastHealthAt: null,
  lastAuthAt: null,
  resumableSession: null,
  resumeSession: async () => {},
  startNewSession: async () => {},
});

function getDelayMs(attempt: number) {
  const delay = RETRY_CONFIG.initialDelayMs * RETRY_CONFIG.multiplier ** Math.max(0, attempt - 1);
  return Math.min(RETRY_CONFIG.maxDelayMs, Math.round(delay));
}

export function DaemonProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<DaemonConnectionState>('discovering');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [daemonUrl, setDaemonUrl] = useState<string | null>(null);
  const [daemonPort, setDaemonPort] = useState<number | null>(null);
  const [discoverySource, setDiscoverySource] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Discovering daemon runtime…');
  const [terminals, setTerminals] = useState<Array<{ id: string; title: string; status: 'active' | 'closed' | 'stale'; projectId: string }>>([]);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [lastHealthAt, setLastHealthAt] = useState<string | null>(null);
  const [lastAuthAt, setLastAuthAt] = useState<string | null>(null);
  const [resumableSession, setResumableSession] = useState<BudSessionRecord | null>(null);
  const [resumePromptShown, setResumePromptShown] = useState(false);
  const terminalProjectScope = 'default';

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (attempt: number) => {
      const delayMs = getDelayMs(attempt);
      timeoutId = setTimeout(() => {
        void poll(attempt + 1);
      }, delayMs);
    };

    const poll = async (attempt = 1) => {
      if (!active) {
        return;
      }

      setRetryAttempt(attempt);
      setConnectionState('discovering');

      const discovery = await getDiscovery();
      if (!discovery.ok) {
        if (!active) {
          return;
        }

        if (discovery.error.code === 'RUNTIME_MISSING') {
          setConnectionState('runtime_missing');
          setStatusMessage('Runtime file missing. Start daemon to generate ~/.agentx/runtime.json.');
        } else {
          setConnectionState('error');
          setStatusMessage('Runtime discovery failed. Verify ~/.agentx/runtime.json content.');
        }
        setHealth(null);
        setLastHealthAt(null);
        scheduleRetry(attempt);
        return;
      }

      setDaemonUrl(discovery.data.daemonUrl);
      setDaemonPort(discovery.data.daemonPort);
      setDiscoverySource(discovery.data.source);

      const healthResult = await getHealth();
      if (!healthResult.ok) {
        if (!active) {
          return;
        }

        setConnectionState('offline');
        setHealth(null);
        setLastHealthAt(null);
        setStatusMessage('Daemon not running yet. Retrying connection…');
        scheduleRetry(attempt);
        return;
      }

      setConnectionState('connecting');
      const session = await createSessionToken();
      if (!session.ok) {
        if (!active) {
          return;
        }

        if (session.status === 401 || session.status === 403) {
          setConnectionState('auth_failed');
          setStatusMessage('Not authorised / session expired.');
        } else {
          setConnectionState('error');
          setStatusMessage('Unable to create daemon session. Retrying…');
        }
        setToken(null);
        scheduleRetry(attempt);
        return;
      }

      if (!active) {
        return;
      }

      const nowIso = new Date().toISOString();
      setToken(session.token);
      setHealth(healthResult.data);
      setLastHealthAt(nowIso);
      setLastAuthAt(nowIso);
      setConnectionState('online');
      setStatusMessage(`Connected to daemon on port ${healthResult.data.daemonPort}.`);

      const terminalResult = await getTerminals(session.token, terminalProjectScope);
      if (terminalResult.ok) {
        setTerminals(terminalResult.data.terminals.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          projectId: t.projectId,
        })));
      }

      const sessionsResult = await getBudSessions(terminalProjectScope, session.token);
      if (sessionsResult.ok) {
        const candidate = sessionsResult.data.sessions.find((item) => item.status === 'running');
        setResumableSession(candidate || null);
        if (candidate && !resumePromptShown) {
          setResumePromptShown(true);
          const shouldResume = window.confirm(`Resume session ${candidate.sessionId.slice(0, 8)} from ${new Date(candidate.lastSeenAt).toLocaleString()}?`);
          if (shouldResume) {
            const resumed = await resumeBudSession(candidate.sessionId, session.token);
            if (resumed.ok) {
              setResumableSession(resumed.data.session);
              setStatusMessage(`Resumed session ${resumed.data.session.sessionId.slice(0, 8)}.`);
            }
          }
        }
      }

      scheduleRetry(1);
    };

    void poll();

    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);




  const resumeSession = async () => {
    if (!token || !resumableSession) return;
    const result = await resumeBudSession(resumableSession.sessionId, token);
    if (result.ok) {
      setResumableSession(result.data.session);
      setStatusMessage(`Resumed session ${result.data.session.sessionId.slice(0, 8)}.`);
    }
  };

  const startNewSession = async () => {
    if (!token || !resumableSession) return;
    await closeBudSession(resumableSession.sessionId, token);
    setResumableSession(null);
    setStatusMessage('Starting a new session. Previous session was closed.');
  };

  const killTerminalSession = async (id: string) => {
    if (!token) return;
    const terminal = terminals.find((item) => item.id === id);
    if (!terminal) return;
    await killTerminal(id, terminal.projectId, token);
    const refreshed = await getTerminals(token, terminal.projectId);
    if (refreshed.ok) {
      setTerminals(refreshed.data.terminals.map((t) => ({ id: t.id, title: t.title, status: t.status, projectId: t.projectId })));
    }
  };

  const clearStaleTerminals = async () => {
    if (!token) return;
    const stale = terminals.filter((terminal) => terminal.status === 'stale' || terminal.status === 'closed');
    for (const terminal of stale) {
      await clearTerminal(terminal.id, terminal.projectId, token);
    }
    const scope = stale[0]?.projectId ?? terminalProjectScope;
    const refreshed = await getTerminals(token, scope);
    if (refreshed.ok) {
      setTerminals(refreshed.data.terminals.map((t) => ({ id: t.id, title: t.title, status: t.status, projectId: t.projectId })));
    }
  };

  const value = useMemo(
    () => ({
      connectionState,
      connected: connectionState === 'online',
      health,
      daemonPort,
      daemonUrl,
      discoverySource,
      currentProject: 'No project selected',
      safeModeLabel: 'Safe mode: on',
      activeRuns: 0,
      terminals,
      activeTerminals: terminals.filter((terminal) => terminal.status === 'active').length,
      staleTerminals: terminals.filter((terminal) => terminal.status === 'stale').length,
      killTerminalSession,
      clearStaleTerminals,
      token,
      statusMessage,
      retryAttempt,
      lastHealthAt,
      lastAuthAt,
      resumableSession,
      resumeSession,
      startNewSession,
    }),
    [
      connectionState,
      health,
      daemonPort,
      daemonUrl,
      discoverySource,
      token,
      statusMessage,
      retryAttempt,
      lastHealthAt,
      lastAuthAt,
      resumableSession,
      resumeSession,
      startNewSession,
      killTerminalSession,
      clearStaleTerminals,
      resumableSession,
      resumeSession,
      startNewSession,
      resumePromptShown,
    ]
  );

  return <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>;
}

export const useDaemon = () => useContext(DaemonContext);
