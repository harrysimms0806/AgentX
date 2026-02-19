'use client';

import { useState } from 'react';

interface AgentListProps {
  collapsed?: boolean;
}

const agents = ['Kimi', 'Claude', 'Codex'];

export default function AgentList({ collapsed }: AgentListProps) {
  const [showAgents, setShowAgents] = useState(true);
  const [showStatus, setShowStatus] = useState(true);

  if (collapsed) {
    return <div className="agent-list" />;
  }

  return (
    <div className="agent-list">
      <button className="section-toggle" onClick={() => setShowAgents((v) => !v)}>AGENTS</button>
      {showAgents && (
        <div className="list">
          {agents.map((agent) => (
            <div key={agent} className="row">
              <span>{agent}</span>
              <span className="dot">●</span>
            </div>
          ))}
        </div>
      )}

      <button className="section-toggle" onClick={() => setShowStatus((v) => !v)}>STATUS</button>
      {showStatus && (
        <div className="list">
          <div className="row"><span>Connected</span><span style={{ color: 'var(--accent-green)' }}>●</span></div>
          <div className="row"><span>Safe Mode</span><span style={{ color: 'var(--accent-orange)' }}>●</span></div>
        </div>
      )}

      <style jsx>{`
        .agent-list { margin-top: auto; padding: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; gap: 8px; }
        .section-toggle { background: transparent; border: none; color: var(--text-tertiary); font-size: 13px; font-weight: 500; text-align: left; cursor: pointer; }
        .list { display: flex; flex-direction: column; gap: 4px; }
        .row { height: 32px; display: flex; align-items: center; justify-content: space-between; padding: 0 6px; border-radius: 8px; color: var(--text-secondary); }
        .row:hover { background: rgba(255, 255, 255, 0.06); }
        .dot { color: var(--text-tertiary); }
      `}</style>
    </div>
  );
}
