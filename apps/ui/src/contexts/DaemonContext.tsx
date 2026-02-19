'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { clearTerminal, closeBudSession, createSessionToken, getBudSessions, getDiscovery, getHealth, getTerminals, killTerminal, resumeBudSession, type BudSessionRecord, type HealthResponse } from '@/lib/daemon/client';

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
  refreshConnection: () => void;
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
  statusMessage: 'Initializing...',
  retryAttempt: 0,
  lastHealthAt: null,
  lastAuthAt: null,
  resumableSession: null,
  resumeSession: async () => {},
  startNewSession: async () => {},
  refreshConnection: () => {},
});

// Module-level cache for token
let globalToken: string | null = null;
let globalTokenExpiry: number = 0;
const TOKEN_LIFETIME_MS = 55 * 60 * 1000;

export function DaemonProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<DaemonConnectionState>('discovering');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [daemonUrl, setDaemonUrl] = useState<string | null>(null);
  const [daemonPort, setDaemonPort] = useState<number | null>(null);
  const [discoverySource, setDiscoverySource] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(globalToken);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [terminals, setTerminals] = useState<Array<{ id: string; title: string; status: 'active' | 'closed' | 'stale'; projectId: string }>>([]);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [lastHealthAt, setLastHealthAt] = useState<string | null>(null);
  const [lastAuthAt, setLastAuthAt] = useState<string | null>(null);
  const [resumableSession, setResumableSession] = useState<BudSessionRecord | null>(null);
  const [resumePromptShown, setResumePromptShown] = useState(false);
  const terminalProjectScope = 'default';
  const isConnectingRef = useRef(false);
  const mountedRef = useRef(true);

  // Main connection function
  const tryConnect = async () => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    
    try {
      setConnectionState('discovering');
      setStatusMessage('Discovering daemon...');
      
      // Step 1: Discovery
      const discovery = await getDiscovery();
      if (!discovery.ok) {
        setConnectionState('runtime_missing');
        setStatusMessage('Daemon not found. Is it running?');
        return;
      }
      
      if (!mountedRef.current) return;
      
      setDaemonUrl(discovery.data.daemonUrl);
      setDaemonPort(discovery.data.daemonPort);
      setDiscoverySource(discovery.data.source);
      
      // Step 2: Health check
      setConnectionState('connecting');
      setStatusMessage('Checking daemon health...');
      
      const healthResult = await getHealth();
      if (!healthResult.ok) {
        setConnectionState('offline');
        setStatusMessage('Daemon unhealthy. Retrying...');
        return;
      }
      
      if (!mountedRef.current) return;
      
      setHealth(healthResult.data);
      setLastHealthAt(new Date().toISOString());
      
      // Step 3: Get or reuse token
      let sessionToken = globalToken;
      
      if (!sessionToken || Date.now() >= globalTokenExpiry) {
        setStatusMessage('Creating session...');
        const session = await createSessionToken();
        
        if (!session.ok) {
          setConnectionState('auth_failed');
          setStatusMessage('Authentication failed');
          globalToken = null;
          setToken(null);
          return;
        }
        
        sessionToken = session.token;
        globalToken = session.token;
        globalTokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
      }
      
      if (!mountedRef.current) return;
      
      setToken(sessionToken);
      setLastAuthAt(new Date().toISOString());
      
      // Step 4: Load terminals
      const terminalResult = await getTerminals(sessionToken, terminalProjectScope);
      if (terminalResult.ok) {
        setTerminals(terminalResult.data.terminals.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          projectId: t.projectId,
        })));
      }
      
      // Step 5: Check for resumable sessions
      const sessionsResult = await getBudSessions(terminalProjectScope, sessionToken);
      if (sessionsResult.ok) {
        const candidate = sessionsResult.data.sessions.find((item) => item.status === 'running');
        setResumableSession(candidate || null);
      }
      
      if (!mountedRef.current) return;
      
      // Success!
      setConnectionState('online');
      setStatusMessage(`Connected on port ${healthResult.data.daemonPort}`);
      setRetryAttempt(0);
      
    } catch (err) {
      if (!mountedRef.current) return;
      setConnectionState('error');
      setStatusMessage('Connection error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      isConnectingRef.current = false;
    }
  };

  // Initial connection
  useEffect(() => {
    mountedRef.current = true;
    tryConnect();
    
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Periodic health check when online
  useEffect(() => {
    if (connectionState !== 'online') return;
    
    const interval = setInterval(async () => {
      const healthResult = await getHealth();
      if (healthResult.ok) {
        setHealth(healthResult.data);
        setLastHealthAt(new Date().toISOString());
      } else {
        setConnectionState('offline');
        setStatusMessage('Connection lost. Retrying...');
        tryConnect();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [connectionState]);

  const refreshConnection = () => {
    setRetryAttempt((prev) => prev + 1);
    tryConnect();
  };

  const resumeSession = async () => {
    if (!token || !resumableSession) return;
    const result = await resumeBudSession(resumableSession.sessionId, token);
    if (result.ok) {
      setResumableSession(result.data.session);
    }
  };

  const startNewSession = async () => {
    if (!token || !resumableSession) return;
    await closeBudSession(resumableSession.sessionId, token);
    setResumableSession(null);
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
      activeTerminals: terminals.filter((t) => t.status === 'active').length,
      staleTerminals: terminals.filter((t) => t.status === 'stale').length,
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
      refreshConnection,
    }),
    [connectionState, health, daemonPort, daemonUrl, discoverySource, token, statusMessage, retryAttempt, lastHealthAt, lastAuthAt, resumableSession, terminals]
  );

  return <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>;
}

export function useDaemon() {
  const context = useContext(DaemonContext);
  if (!context) {
    throw new Error('useDaemon must be used within DaemonProvider');
  }
  return context;
}
