'use client';

import { useEffect, useState } from 'react';
import { useDaemon } from '@/contexts/DaemonContext';

export default function StatusBar() {
  const { connected, currentProject, safeModeLabel } = useDaemon();
  const [timeLabel, setTimeLabel] = useState('');

  useEffect(() => {
    const update = () => setTimeLabel(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    update();
    const timer = setInterval(update, 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="status-bar">
      <div className="item" style={{ color: connected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        <span>●</span>
        <span>{connected ? 'Connected' : 'Offline'}</span>
      </div>
      <div className="item">{currentProject}</div>
      <div className="item">{safeModeLabel === 'Safe mode: on' ? 'Safe Mode: On' : safeModeLabel}</div>
      <div className="item right">{timeLabel}</div>

      <style jsx>{`
        .status-bar {
          position: fixed; left: 0; right: 0; bottom: 0; height: 28px;
          background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(14px); border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex; align-items: center; gap: 24px; padding: 0 var(--space-md); font-size: 12px; color: var(--text-secondary); z-index: 100;
        }
        .item { display: flex; align-items: center; gap: 6px; }
        .right { margin-left: auto; color: var(--text-tertiary); }
      `}</style>
    </footer>
  );
}
