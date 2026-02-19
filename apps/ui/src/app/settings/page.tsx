'use client';

import { useEffect, useState } from 'react';
import { useDaemon } from '@/contexts/DaemonContext';
import { getProjectPolicy, getProjects, updateProjectPolicy, type ProjectPolicy } from '@/lib/daemon/client';

const DEFAULT_POLICY: ProjectPolicy = {
  allowedWriteGlobs: ['**'],
  blockedCommandPatterns: [],
  approvalRequiredFor: [],
  maxFilesChangedPerRun: 20,
};

export default function SettingsPage() {
  const { token, connected } = useDaemon();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [policy, setPolicy] = useState<ProjectPolicy>(DEFAULT_POLICY);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!token || !connected) return;
    void (async () => {
      const res = await getProjects(token);
      if (!res.ok) {
        setStatus(res.error.error);
        return;
      }

      setProjects(res.data);
      if (res.data.length > 0) {
        setProjectId(res.data[0].id);
      }
    })();
  }, [token, connected]);

  useEffect(() => {
    if (!token || !projectId) return;
    void (async () => {
      const res = await getProjectPolicy(projectId, token);
      if (!res.ok) {
        setStatus(res.error.error);
        return;
      }
      setPolicy(res.data);
    })();
  }, [projectId, token]);

  async function savePolicy() {
    if (!token || !projectId) return;
    const res = await updateProjectPolicy(projectId, policy, token);
    if (!res.ok) {
      setStatus(res.error.error);
      return;
    }
    setPolicy(res.data);
    setStatus('Policy updated');
  }

  function toggleApproval(action: 'write_files' | 'run_commands' | 'git_commit') {
    setPolicy((prev) => {
      const has = prev.approvalRequiredFor.includes(action);
      return {
        ...prev,
        approvalRequiredFor: has
          ? prev.approvalRequiredFor.filter((entry) => entry !== action)
          : [...prev.approvalRequiredFor, action],
      };
    });
  }

  return (
    <div style={{ padding: 32, maxWidth: 920 }}>
      <h1>Policy Engine</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Configure per-project write scope, blocked commands, approval gates, and max changed files per run.
      </p>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span>Project</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ marginLeft: 8 }}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div>Allowed write globs (one per line)</div>
        <textarea
          rows={4}
          value={policy.allowedWriteGlobs.join('\n')}
          onChange={(e) => setPolicy((prev) => ({ ...prev, allowedWriteGlobs: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) }))}
          style={{ width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div>Blocked command patterns (regex, one per line)</div>
        <textarea
          rows={4}
          value={policy.blockedCommandPatterns.join('\n')}
          onChange={(e) => setPolicy((prev) => ({ ...prev, blockedCommandPatterns: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) }))}
          style={{ width: '100%' }}
        />
      </label>

      <div style={{ marginBottom: 12 }}>
        <div>Approval required for</div>
        {(['write_files', 'run_commands', 'git_commit'] as const).map((action) => (
          <label key={action} style={{ display: 'block' }}>
            <input type="checkbox" checked={policy.approvalRequiredFor.includes(action)} onChange={() => toggleApproval(action)} /> {action}
          </label>
        ))}
      </div>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <div>Max files changed per run</div>
        <input
          type="number"
          min={1}
          value={policy.maxFilesChangedPerRun}
          onChange={(e) => setPolicy((prev) => ({ ...prev, maxFilesChangedPerRun: Number(e.target.value) || 1 }))}
        />
      </label>

      <button onClick={() => void savePolicy()}>Save policy</button>
      {status ? <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>{status}</p> : null}
    </div>
  );
}
