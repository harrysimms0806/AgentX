'use client';

interface AgentListProps {
  collapsed?: boolean;
}

const agents = [
  { id: 'kimi', name: 'Kimi', emoji: '🌙', status: 'idle' },
  { id: 'claude', name: 'Claude', emoji: '✦', status: 'idle' },
  { id: 'codex', name: 'Codex', emoji: '⚡', status: 'idle' },
];

export default function AgentList({ collapsed }: AgentListProps) {
  return (
    <div className="agent-list">
      {!collapsed && (>
        <>
          <div className="section-title">Agents</div>
          <div className="agents">
            {agents.map((agent) => (
              <div key={agent.id} className="agent-item">
                <span className="agent-emoji">{agent.emoji}</span>
                <span className="agent-name">{agent.name}</span>
                <span className={`agent-status ${agent.status}`} />
              </div>
            ))}
          </div>
        </>
      )}
      
      <style jsx>{`
        .agent-list {
          margin-top: auto;
          padding: var(--space-md);
          border-top: 1px solid var(--border);
        }
        
        .section-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
          margin-bottom: var(--space-sm);
        }
        
        .agents {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        
        .agent-item {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.15s ease;
        }
        
        .agent-item:hover {
          background: var(--accent-muted);
        }
        
        .agent-emoji {
          font-size: 16px;
        }
        
        .agent-name {
          flex: 1;
          font-size: 13px;
          color: var(--text-secondary);
        }
        
        .agent-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--status-success);
        }
        
        .agent-status.idle {
          background: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}
