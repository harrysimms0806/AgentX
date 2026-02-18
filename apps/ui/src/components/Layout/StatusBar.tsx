'use client';

import { useDaemon } from '@/contexts/DaemonContext';

export default function StatusBar() {
  const { connected, health, currentProject, safeMode, activeRuns } = useDaemon();

  return (
    <footer className="status-bar">
      <div className="status-section">
        <div className={`status-item ${connected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot" />
          <span>{connected ? 'Daemon Connected' : 'Daemon Offline'}</span>
        </div>
        
        {currentProject && (
          <div className="status-item">
            <span className="label">Project:</span>
            <span className="value">{currentProject}</span>
          </div>
        )}
        
        {safeMode && (
          <div className="status-item warning">
            <span>⚠ Safe Mode</span>
          </div>
        )}
      </div>

      <div className="status-section">
        {activeRuns > 0 && (
          <div className="status-item running">
            <span className="status-dot running" />
            <span>{activeRuns} Active Run{activeRuns !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        {health && (
          <div className="status-item">
            <span className="label">Port:</span>
            <span className="value">{health.daemonPort}</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .status-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 32px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-md);
          font-size: 12px;
          z-index: 100;
        }
        
        .status-section {
          display: flex;
          align-items: center;
          gap: var(--space-lg);
        }
        
        .status-item {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          color: var(--text-secondary);
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
      `}</style>
    </footer>
  );
}
