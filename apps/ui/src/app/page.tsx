'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDaemon } from '@/contexts/DaemonContext';
import { getProjects } from '@/lib/daemon/client';

export default function Dashboard() {
  const { connected, daemonPort, statusMessage, token } = useDaemon();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await getProjects(token);
      if (!active || !result.ok) return;
      setProjects(result.data);
    })();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      <section className="panel glass-panel">
        <div className="row">
          <h3>Daemon Status</h3>
          <span className={`pill ${connected ? 'online' : 'offline'}`}>{connected ? 'Connected' : 'Not Connected'}</span>
        </div>
        <p className="subtle">Port: {daemonPort ?? 'n/a'} · {statusMessage}</p>
      </section>

      <section className="panel glass-panel">
        <h3>Projects</h3>
        <div className="project-list">
          {projects.length === 0 ? <div className="subtle">No projects yet.</div> : projects.map((project, idx) => (
            <div className="project-row" key={project.id}>
              <span>{project.name}</span>
              <span className="dot">{idx === 0 ? '● active' : '○ idle'}</span>
            </div>
          ))}
        </div>
        <button className="ghost-button">+ New Project</button>
      </section>

      <section className="panel glass-panel">
        <h3>Quick Actions</h3>
        <div className="actions">
          <Link href="/workspace" className="ghost-button">Open Workspace</Link>
          <Link href="/audit" className="ghost-button">View Audit</Link>
        </div>
      </section>

      <style jsx>{`
        .dashboard { padding: var(--space-xl); display: flex; flex-direction: column; gap: var(--space-lg); max-width: 840px; }
        .panel { padding: var(--space-md); display: flex; flex-direction: column; gap: var(--space-md); box-shadow: none; }
        .row { display: flex; justify-content: space-between; align-items: center; }
        .pill { font-size: 12px; border-radius: 999px; padding: 4px 10px; }
        .online { color: var(--accent-green); background: rgba(48, 209, 88, 0.15); }
        .offline { color: var(--accent-red); background: rgba(255, 69, 58, 0.14); }
        .subtle { color: var(--text-secondary); }
        .project-list { display: flex; flex-direction: column; gap: var(--space-sm); }
        .project-row { height: 32px; display: flex; align-items: center; justify-content: space-between; }
        .dot { color: var(--text-secondary); font-size: 12px; }
        .actions { display: flex; gap: var(--space-md); }
        .ghost-button {
          height: 32px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: var(--radius-sm);
          background: var(--bg-tertiary); color: var(--text-primary); padding: 0 var(--space-md);
          display: inline-flex; align-items: center; text-decoration: none; cursor: pointer;
          transition: background var(--transition-fast);
        }
        .ghost-button:hover { background: rgba(255, 255, 255, 0.08); }
      `}</style>
    </div>
  );
}
