'use client';

import { useDaemon } from '@/contexts/DaemonContext';

function stateLabel(state: string) {
  switch (state) {
    case 'connected':
      return 'Daemon connected';
    case 'starting':
      return 'Daemon starting';
    case 'retrying':
      return 'Daemon retrying';
    case 'runtime-missing':
      return 'Runtime file missing';
    case 'auth-failed':
      return 'Not authorised';
    default:
      return 'Daemon disconnected';
  }
}

export default function StatusBar() {
  const {
    connectionState,
    connected,
    health,
    currentProject,
    safeModeLabel,
    activeRuns,
    terminals,
    activeTerminals,
    staleTerminals,
    killTerminalSession,
    clearStaleTerminals,
    daemonPort,
    daemonUrl,
    statusMessage,
  } = useDaemon();

  return (
    <footer className="status-bar">
      <div className="status-section">
        <div className={`status-item ${connected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot" />
          <span>{stateLabel(connectionState)}</span>
        </div>

        <div className="status-item">
          <span className="label">Project:</span>
          <span className="value">{currentProject}</span>
        </div>

        <div className="status-item warning">
          <span>⚠ {safeModeLabel}</span>
        </div>
      </div>

      <div className="status-section">
        <div className="status-item">
          <span className="label">Status:</span>
          <span className="value muted">{statusMessage}</span>
        </div>

        {daemonUrl && (
          <div className="status-item endpoint">
            <span className="label">Endpoint:</span>
            <span className="value muted">{daemonUrl}</span>
          </div>
        )}

        {(daemonPort || health?.daemonPort) && (
          <div className="status-item">
            <span className="label">Port:</span>
            <span className="value">{daemonPort ?? health?.daemonPort}</span>
          </div>
        )}

        {activeRuns > 0 && (
          <div className="status-item running">
            <span className="status-dot running" />
            <span>{activeRuns} Active Run{activeRuns !== 1 ? 's' : ''}</span>
          </div>
        )}

        {activeTerminals > 0 && (
          <div className="status-item running">
            <span className="status-dot running" />
            <span>{activeTerminals} Active Terminal{activeTerminals !== 1 ? 's' : ''}</span>
          </div>
        )}

        {staleTerminals > 0 && (
          <div className="status-item warning">
            <span>{staleTerminals} stale terminal{staleTerminals !== 1 ? 's' : ''}</span>
            <button className="status-action" onClick={() => void clearStaleTerminals()}>
              Clear
            </button>
          </div>
        )}

        {terminals.slice(0, 2).map((terminal) => (
          <div key={terminal.id} className="status-item endpoint">
            <span className="label">Term:</span>
            <span className="value muted">{terminal.title} ({terminal.status})</span>
            {terminal.status === 'active' && (
              <button className="status-action" onClick={() => void killTerminalSession(terminal.id)}>
                Kill
              </button>
            )}
          </div>
        ))}

      </div>

      <style jsx>{`
        .status-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          min-height: 32px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-md);
          font-size: 12px;
          z-index: 100;
          gap: var(--space-md);
        }

        .status-section {
          display: flex;
          align-items: center;
          gap: var(--space-lg);
          min-width: 0;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          color: var(--text-secondary);
          min-width: 0;
        }

        .status-item.connected {
          color: var(--status-success);
        }

        .status-item.disconnected {
          color: var(--status-error);
        }

        .status-item.warning {
          color: var(--status-warning);
        }

        .status-item.running {
          color: var(--status-running);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .status-dot.running {
          animation: pulse 1.5s ease-in-out infinite;
        }

        .label {
          color: var(--text-tertiary);
        }

        .value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .value.muted {
          color: var(--text-secondary);
          max-width: 340px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .status-item.endpoint .value.muted {
          max-width: 240px;
        }

        .status-action {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-secondary);
          border-radius: 6px;
          font-size: 11px;
          padding: 1px 6px;
          cursor: pointer;
        }

        .status-action:hover {
          color: var(--text-primary);
          border-color: var(--text-secondary);
        }
      `}</style>
    </footer>
  );
}
