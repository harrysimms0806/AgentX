'use client';

import { useDaemon } from '@/contexts/DaemonContext';
import { useEffect, useMemo, useState } from 'react';
import { approvePlugin, getContextPacks, getIntelligenceInsights, getObservabilityMetrics, getOpenClawStatus, getPlugins, getProjects, getWorkflowRuns, getWorkflowTemplates, installSamplePlugin, invokePluginTool, startWorkflowRun, type IntelligenceInsight, type ObservabilityMetrics, type PluginRecord, type WorkflowRun, type WorkflowTemplate } from '@/lib/daemon/client';

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
  const [insights, setInsights] = useState<IntelligenceInsight[]>([]);
  const [contextUsage, setContextUsage] = useState<{ avg: number; overCap: number; count: number }>({ avg: 0, overCap: 0, count: 0 });
  const [openclawUptime, setOpenclawUptime] = useState<string>('n/a');
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [pluginStatus, setPluginStatus] = useState<string>('');

  useEffect(() => {
    if (!connected) return;
    void (async () => {
      const projectRes = await getProjects(token);
      if (projectRes.ok) {
        setProjects(projectRes.data);
        if (projectRes.data[0]) setProjectId(projectRes.data[0].id);
      }
      const templateRes = projectRes.ok && projectRes.data[0] ? await getWorkflowTemplates(projectRes.data[0].id, token) : { ok: false as const, status: 0, error: { error: 'No project' } as any };
      if (templateRes.ok) {
        setTemplates(templateRes.data.templates);
        if (templateRes.data.templates[0]) setSelectedTemplate(templateRes.data.templates[0].id);
      }
    })();
  }, [connected, token]);


  useEffect(() => {
    if (!projectId || !token) return;
    void (async () => {
      const templateRes = await getWorkflowTemplates(projectId, token);
      if (templateRes.ok) {
        setTemplates(templateRes.data.templates);
        if (templateRes.data.templates[0] && !templateRes.data.templates.find((t) => t.id === selectedTemplate)) {
          setSelectedTemplate(templateRes.data.templates[0].id);
        }
      }
    })();
  }, [projectId, token]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      const [runRes, metricsRes, insightRes, contextRes, openclawRes, pluginsRes] = await Promise.all([
        getWorkflowRuns(projectId, token),
        getObservabilityMetrics(projectId, token),
        getIntelligenceInsights(projectId, token),
        getContextPacks(projectId, token),
        getOpenClawStatus(token),
        getPlugins(token),
      ]);
      if (runRes.ok) setRuns(runRes.data.runs);
      if (metricsRes.ok) setMetrics(metricsRes.data);
      if (insightRes.ok) setInsights(insightRes.data.insights);
      if (pluginsRes.ok) setPlugins(pluginsRes.data.plugins);
      if (contextRes.ok) {
        const packs = contextRes.data.contextPacks;
        const budgets = packs.map((pack) => {
          const budget = pack.budgetChars || 100000;
          return { used: pack.sizeChars || 0, budget };
        });
        const count = budgets.length;
        const avg = count > 0 ? Math.round((budgets.reduce((sum, item) => sum + Math.min(1, item.used / item.budget), 0) / count) * 100) : 0;
        const overCap = budgets.filter((item) => item.used >= item.budget).length;
        setContextUsage({ avg, overCap, count });
      }
      if (openclawRes.ok) {
        const connectedAt = openclawRes.data.openclaw.connectedAt;
        if (openclawRes.data.openclaw.connected && connectedAt) {
          const seconds = Math.max(0, Math.round((Date.now() - new Date(connectedAt).getTime()) / 1000));
          setOpenclawUptime(`${seconds}s`);
        } else {
          setOpenclawUptime('offline');
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [projectId, token]);

  const latestRun = useMemo(() => runs[0], [runs]);
  const workflowSuccessRate = useMemo(() => {
    if (runs.length === 0) return 'n/a';
    const finished = runs.filter((run) => run.status === 'succeeded' || run.status === 'failed');
    if (finished.length === 0) return 'n/a';
    const success = finished.filter((run) => run.status === 'succeeded').length;
    return `${Math.round((success / finished.length) * 100)}%`;
  }, [runs]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const channel = new BroadcastChannel('agentx-multitab-sync');
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; projectId?: string };
      if (payload?.type === 'active-project' && payload.projectId && payload.projectId !== projectId) {
        setProjectId(payload.projectId);
      }
    };
    channel.addEventListener('message', onMessage);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
    };
  }, [projectId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !projectId) return;
    const channel = new BroadcastChannel('agentx-multitab-sync');
    channel.postMessage({ type: 'active-project', projectId, ts: Date.now() });
    channel.close();
  }, [projectId]);


  async function runWorkflow() {
    if (!projectId || !selectedTemplate) return;
    const res = await startWorkflowRun(projectId, selectedTemplate, token);
    if (!res.ok) {
      setWorkflowStatus(res.error.error);
      return;
    }
    setWorkflowStatus(`Started ${res.data.run.id}`);
  }

  async function setupSamplePlugin() {
    const install = await installSamplePlugin(token);
    if (!install.ok) {
      setPluginStatus(install.error.error);
      return;
    }

    const approve = await approvePlugin(install.data.plugin.id, ['register_tool'], token);
    if (!approve.ok) {
      setPluginStatus(approve.error.error);
      return;
    }

    const invoke = await invokePluginTool(approve.data.plugin.toolName, { input: 'hello from dashboard' }, token);
    if (!invoke.ok) {
      setPluginStatus(invoke.error.error);
      return;
    }

    setPluginStatus(`Installed and invoked ${approve.data.plugin.toolName}: ${JSON.stringify(invoke.data.result)}`);
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
                <div><strong>Workflow:</strong> {latestRun.workflowId}</div>
                <div style={{ marginTop: '6px' }}>
                  {latestRun.steps.map((step) => (
                    <div key={step.id}>• step #{step.order + 1} — {step.status}{step.requiresApproval ? ' (approval gate)' : ''}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">🧠</span>
            <h3>Intelligence</h3>
          </div>
          <div className="card-body" style={{ fontSize: '12px' }}>
            {insights.length === 0 ? (
              <div>No suggestions right now.</div>
            ) : insights.slice(0, 6).map((insight) => (
              <div key={insight.id} style={{ marginBottom: '8px', borderLeft: `3px solid ${insight.type === 'warning' ? 'var(--status-warning)' : 'var(--status-success)'}`, paddingLeft: '8px' }}>
                <div><strong>{insight.title}</strong> {insight.type === 'warning' ? '⚠' : '💡'}</div>
                <div>{insight.detail}</div>
                {insight.blockable ? <div style={{ color: 'var(--status-warning)' }}>Policy can be configured to hard-block this pattern.</div> : null}
              </div>
            ))}
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
            <span className="card-icon">🧩</span>
            <h3>Plugin Sandbox</h3>
          </div>
          <div className="card-body">
            <div className="detail-row"><span className="label">Installed plugins:</span><span>{plugins.length}</span></div>
            <div className="detail-row"><span className="label">Active tools:</span><span>{plugins.filter((plugin) => plugin.status === 'active').length}</span></div>
            <button className="action-btn" onClick={() => void setupSamplePlugin()} disabled={!token}>
              Install + approve sample plugin
            </button>
            {pluginStatus ? <p className="message">{pluginStatus}</p> : null}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-icon">🛰</span>
            <h3>Dashboard v2 Widgets</h3>
          </div>
          <div className="card-body">
            <div className="detail-row"><span className="label">Active workflows:</span><span>{runs.filter((run) => run.status === 'running' || run.status === 'paused').length}</span></div>
            <div className="detail-row"><span className="label">Workflow success rate:</span><span>{workflowSuccessRate}</span></div>
            <div className="detail-row"><span className="label">Avg run duration:</span><span>{metrics ? `${metrics.avgRunDurationMs}ms` : 'n/a'}</span></div>
            <div className="detail-row"><span className="label">Context capacity avg:</span><span>{contextUsage.count ? `${contextUsage.avg}%` : 'n/a'}</span></div>
            <div className="detail-row"><span className="label">Context over-cap packs:</span><span>{contextUsage.overCap}</span></div>
            <div className="detail-row"><span className="label">OpenClaw connection uptime:</span><span>{openclawUptime}</span></div>
            {contextUsage.avg >= 85 ? <p style={{ color: 'var(--status-warning)', marginTop: '8px' }}>Context pack usage is above 85%; consider trimming files/summaries.</p> : null}
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
