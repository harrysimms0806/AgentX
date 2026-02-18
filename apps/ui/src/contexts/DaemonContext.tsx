'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  daemonPort: number;
  uiPort: number;
  timestamp: string;
}

interface DaemonContextType {
  connected: boolean;
  health: HealthResponse | null;
  currentProject: string | null;
  safeMode: boolean;
  activeRuns: number;
  token: string | null;
}

const DaemonContext = createContext<DaemonContextType>({
  connected: false,
  health: null,
  currentProject: null,
  safeMode: true,
  activeRuns: 0,
  token: null,
});

export function DaemonProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Check daemon health
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/daemon/health');
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
          setConnected(true);
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);

    // Get auth token
    const getToken = async () => {
      try {
        const res = await fetch('/api/daemon/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: 'agentx-ui' }),
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
        }
      } catch (err) {
        console.error('Failed to get token:', err);
      }
    };

    getToken();

    return () => clearInterval(interval);
  }, []);

  return (
    <DaemonContext.Provider
      value={{
        connected,
        health,
        currentProject: null, // TODO: Load from storage
        safeMode: true,
        activeRuns: 0,
        token,
      }}
    >
      {children}
    </DaemonContext.Provider>
  );
}

export const useDaemon = () => useContext(DaemonContext);
