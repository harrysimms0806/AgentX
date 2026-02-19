'use client';

import { useDaemon } from '@/contexts/DaemonContext';
import { useEffect, useMemo, useState } from 'react';
import { getObservabilityMetrics, getProjects, getWorkflowRuns, getWorkflowTemplates, startWorkflowRun, type ObservabilityMetrics, type WorkflowRun, type WorkflowTemplate } from '@/lib/daemon/client';

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'n/a';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function Dashboard() {
  const {
    connectionState,
    connected,
    health,
    daemonUrl,
    daemonPort,
    discoverySource,
    statusMessage,
    retryAttempt,
    lastHealthAt,
    lastAuthAt,
    token,
  } = useDaemon();
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState('');
  const [metrics, setMetrics] = useState<ObservabilityMetrics | null>(null);

  useEffect(() => {
    if (!connected) return;
    void (async () => {
      const projectRes = await getProjects(token);
      if (projectRes.ok) {
        setProjects(projectRes.data);
        if (projectRes.data[0]) setProjectId(projectRes.data[0].id);
      }
      const templateRes = await getWorkflowTemplates(token);
      if (templateRes.ok) {
        setTemplates(templateRes.data.templates);
        if (templateRes.data.templates[0]) setSelectedTemplate(templateRes.data.templates[0].id);
      }
    })();
  }, [connected, token]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      const [runRes, metricsRes] = await Promise.all([
        getWorkflowRuns(projectId, token),
        getObservabilityMetrics(projectId, token),
      ]);
      if (runRes.ok) setRuns(runRes.data.runs);
      if (metricsRes.ok) setMetrics(metricsRes.data);
    };
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [projectId, token]);

  const latestRun = useMemo(() => runs[0], [runs]);

  async function runWorkflow() {
    if (!projectId || !selectedTemplate) return;
    const res = await startWorkflowRun(projectId, selectedTemplate, token);
    if (!res.ok) {
      setWorkflowStatus(res.error.error);
      return;
    }
    setWorkflowStatus(`Started ${res.data.run.id}`);
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Welcome to AgentX Terminal</p>
      </header>

      <div className="dashboard-grid">
        <div className="card wide">
          <div className="card-header">
            <span className="card-icon">◉</span>
            <h3>Daemon Status</h3>
          </div>
          <div className="card-body">
            <div className={`status-row ${connected ? 'success' : 'error'}`}>
              <span className="status-indicator" />
              <span>{connected ? 'Connected' : 'Not Connected'}</span>
            </div>

            <p className="message">{statusMessage}</p>

            <div className="health-details">
              <div className="detail-row">
                <span className="label">Connection state:</span>
                <span>{connectionState}</span>
              </div>
              <div className="detail-row">
                <span className="label">Retry attempt:</span>
                <span>{retryAttempt}</span>
              </div>
              <div className="detail-row">
                <span className="label">Daemon endpoint:</span>
                <span>{daemonUrl ?? 'Unavailable until runtime discovery succeeds'}</span>
              </div>
              {health ? (
                <>
                  <div className="detail-row">
                    <span className="label">Version:</span>
                    <span>{health.version}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Uptime:</span>
                    <span>{Math.floor(health.uptime)}s</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Daemon port:</span>
                    <span>{health.daemonPort}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Health payload:</span>
                    <code className="health-json">{JSON.stringify(health)}</code>
                  </div>
                </>
              ) : (
                <div className="detail-row">
                  <span className="label">Health payload:</span>
                  <span>Unavailable while daemon is offline.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">◎</span>
            <h3>Connection Details</h3>
          </div>
          <div className="card-body">
            <div className="detail-row">
              <span className="label">Discovery source:</span>
              <span>{discoverySource ?? '~/.agentx/runtime.json (not found yet)'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Resolved daemon URL:</span>
              <span>{daemonUrl ?? 'Not resolved'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Resolved daemon port:</span>
              <span>{daemonPort ?? 'Not resolved'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Last successful health:</span>
              <span>{formatTimestamp(lastHealthAt)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Last auth refresh:</span>
              <span>{formatTimestamp(lastAuthAt)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <h3>Quick Actions</h3>
          </div>
          <div className="card-body">
            <button className="action-btn primary">
              <span>+</span> New Project
            </button>
            <button className="action-btn">
              <span>◇</span> Open Workspace
            </button>
            <button className="action-btn">
              <span>◎</span> View Audit Log
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">⛭</span>
            <h3>Workflows</h3>
          </div>
          <div className="card-body">
            <div className="detail-row" style={{ marginBottom: '8px' }}>
              <span className="label">Project:</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="detail-row" style={{ marginBottom: '8px' }}>
              <span className="label">Template:</span>
              <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            <button className="action-btn primary" onClick={() => void runWorkflow()} disabled={!projectId || !selectedTemplate || !token}>
              ▶ Run workflow
            </button>
            {workflowStatus ? <p className="message" style={{ marginTop: '8px' }}>{workflowStatus}</p> : null}
            {latestRun ? (
              <div style={{ marginTop: '10px', fontSize: '12px' }}>
                <div><strong>Status:</strong> {latestRun.status}</div>
                <div><strong>Before:</strong> {latestRun.checkpointBefore || 'n/a'}</div>
                <div><strong>After:</strong> {latestRun.checkpointAfter || 'pending'}</div>
                <div style={{ marginTop: '6px' }}>
                  {latestRun.steps.map((step) => (
                    <div key={step.id}>• {step.label} — {step.status}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">📈</span>
            <h3>Observability</h3>
          </div>
          <div className="card-body">
            <div className="detail-row"><span className="label">Runs/day points:</span><span>{metrics?.runsPerDay.length ?? 0}</span></div>
            <div className="detail-row"><span className="label">Avg run duration:</span><span>{metrics ? `${metrics.avgRunDurationMs}ms` : 'n/a'}</span></div>
            <div className="detail-row"><span className="label">Tool event types:</span><span>{metrics ? Object.keys(metrics.toolCallCounts).length : 0}</span></div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              <div><strong>Recent failure reasons</strong></div>
              {(metrics?.failureReasons ?? []).slice(0, 3).map((item) => (
                <div key={item.runId}>• {item.reason}</div>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              <div><strong>Expensive runs</strong></div>
              {(metrics?.expensiveRuns ?? []).slice(0, 3).map((item) => (
                <div key={item.runId}>• {item.runId.slice(0, 8)}… {item.durationMs}ms</div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">✦</span>
            <h3>Agents</h3>
          </div>
          <div className="card-body">
            <div className="agent-status-list">
              {[
                { name: 'Kimi', emoji: '🌙', status: 'idle' },
                { name: 'Claude', emoji: '✦', status: 'idle' },
                { name: 'Codex', emoji: '⚡', status: 'idle' },
              ].map((agent) => (
                <div key={agent.name} className="agent-row">
                  <span>
                    {agent.emoji} {agent.name}
                  </span>
                  <span className={`badge ${agent.status}`}>{agent.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dashboard {
          padding: var(--space-xl);
          max-width: 1400px;
          margin: 0 auto;
        }

        .dashboard-header {
          margin-bottom: var(--space-xl);
        }

        .dashboard-header h1 {
          font-size: 32px;
          font-weight: 600;
          letter-spacing: -0.5px;
          margin-bottom: var(--space-xs);
        }

        .subtitle {
          color: var(--text-secondary);
          font-size: 16px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: var(--space-lg);
        }

        .card {
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .card.wide {
          grid-column: 1 / -1;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-md);
          border-bottom: 1px solid var(--border);
        }

        .card-icon {
          font-size: 18px;
          color: var(--accent);
        }

        .card-header h3 {
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .card-body {
          padding: var(--space-md);
        }

        .status-row {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          font-size: 18px;
          font-weight: 500;
        }

        .status-row.success {
          color: var(--status-success);
        }

        .status-row.error {
          color: var(--status-error);
        }

        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: currentColor;
        }

        .message {
          margin-top: var(--space-sm);
          color: var(--text-secondary);
        }

        .health-details {
          margin-top: var(--space-md);
          padding-top: var(--space-md);
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--space-md);
          font-size: 13px;
        }

        .detail-row .label {
          color: var(--text-tertiary);
          min-width: 140px;
        }

        .health-json {
          display: inline-block;
          max-width: 600px;
          overflow: auto;
          color: var(--text-secondary);
        }

        .action-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-md);
          margin-bottom: var(--space-sm);
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.15s ease;
          font-size: 14px;
        }

        .action-btn:hover {
          border-color: var(--accent);
          background: var(--accent-muted);
        }

        .action-btn.primary {
          background: var(--accent);
          border-color: var(--accent);
          color: #000;
        }

        .action-btn.primary:hover {
          background: var(--accent-hover);
        }

        .agent-status-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }

        .agent-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-sm);
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          font-size: 14px;
        }

        .badge {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 12px;
          background: var(--text-tertiary);
          color: var(--bg-primary);
        }

        .badge.idle {
          background: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}
