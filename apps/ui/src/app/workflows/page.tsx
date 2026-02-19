'use client';

import { useDaemon } from '@/contexts/DaemonContext';
import { useEffect, useMemo, useState } from 'react';
import {
  approveWorkflowStep,
  createWorkflowTemplate,
  getProjects,
  getWorkflowRuns,
  getWorkflowTemplates,
  startWorkflowRun,
  type WorkflowRun,
  type WorkflowTemplate,
} from '@/lib/daemon/client';

const DEFAULT_TEMPLATE = JSON.stringify(
  {
    name: 'Custom Workflow',
    steps: [
      { label: 'Spawn Bud', type: 'spawn-bud' },
      { label: 'Approval Gate', type: 'condition', requiresApproval: true, config: { key: 'allowReview', equals: true } },
      { label: 'Wait', type: 'wait', config: { ms: 500 } },
    ],
  },
  null,
  2
);

export default function WorkflowsPage() {
  const { token, connected } = useDaemon();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [jsonDraft, setJsonDraft] = useState(DEFAULT_TEMPLATE);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!connected || !token) return;
    void (async () => {
      const projectRes = await getProjects(token);
      if (projectRes.ok) {
        setProjects(projectRes.data);
        if (projectRes.data[0] && !projectId) {
          setProjectId(projectRes.data[0].id);
        }
      }
    })();
  }, [connected, token, projectId]);

  useEffect(() => {
    if (!projectId || !token) return;
    const load = async () => {
      const [templatesRes, runsRes] = await Promise.all([
        getWorkflowTemplates(projectId, token),
        getWorkflowRuns(projectId, token),
      ]);
      if (templatesRes.ok) {
        setTemplates(templatesRes.data.templates);
        if (!selectedTemplate && templatesRes.data.templates[0]) {
          setSelectedTemplate(templatesRes.data.templates[0].id);
        }
      }
      if (runsRes.ok) {
        setRuns(runsRes.data.runs);
      }
    };

    void load();
    const interval = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(interval);
  }, [projectId, token, selectedTemplate]);

  async function createFromJson() {
    if (!projectId || !token) return;

    try {
      const parsed = JSON.parse(jsonDraft) as {
        name: string;
        steps: Array<{ label: string; type: 'spawn-agent' | 'spawn-bud' | 'handoff' | 'condition' | 'wait'; requiresApproval?: boolean; config?: Record<string, unknown> }>;
      };

      const res = await createWorkflowTemplate(projectId, parsed.name, parsed.steps, token);
      if (!res.ok) {
        setStatus(res.error.error);
        return;
      }

      setStatus(`Workflow created: ${res.data.workflow.name}`);
      setSelectedTemplate(res.data.workflow.id);
    } catch (err: any) {
      setStatus(`Invalid JSON: ${err.message}`);
    }
  }

  async function runSelectedWorkflow() {
    if (!projectId || !selectedTemplate || !token) return;
    const res = await startWorkflowRun(projectId, selectedTemplate, token, { allowReview: true });
    if (!res.ok) {
      setStatus(res.error.error);
      return;
    }

    setStatus(`Run started: ${res.data.run.id}`);
  }

  async function approveStep(runId: string, runStepId: string) {
    if (!token) return;
    const res = await approveWorkflowStep(runId, runStepId, token);
    if (!res.ok) {
      setStatus(res.error.error);
      return;
    }
    setStatus(`Approved step ${runStepId.slice(0, 8)}.`);
  }

  const latestRun = useMemo(() => runs[0], [runs]);

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1>Workflows</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <h3>Workflow Builder (JSON)</h3>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 12 }}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%' }}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          <textarea
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            style={{ width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: 12 }}
          />

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void createFromJson()}>Save Workflow</button>
            <button type="button" onClick={() => setJsonDraft(DEFAULT_TEMPLATE)}>Reset</button>
          </div>
        </section>

        <section style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <h3>Run & Timeline</h3>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 12 }}>Template</span>
            <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select workflow...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => void runSelectedWorkflow()} disabled={!selectedTemplate}>Trigger Workflow</button>

          {latestRun ? (
            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 12 }}>
              <div><strong>Run:</strong> {latestRun.id}</div>
              <div><strong>Status:</strong> {latestRun.status}</div>
              <div style={{ marginTop: 8 }}>
                {latestRun.steps.map((step) => (
                  <div key={step.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                    <div>Step #{step.order + 1} — {step.status}</div>
                    {step.requiresApproval && !step.approvedAt && step.status === 'paused' && (
                      <button type="button" onClick={() => void approveStep(latestRun.id, step.id)} style={{ marginTop: 4 }}>
                        Approve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>No runs yet.</div>
          )}
        </section>
      </div>

      {status ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{status}</div> : null}
    </div>
  );
}
