'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDaemon } from '@/contexts/DaemonContext';
import {
  getFileTree,
  getGitDiff,
  getContextPacks,
  getGitStatus,
  getProjectBrief,
  getProjects,
  getRuns,
  getBudSessions,
  getBudSessionStatus,
  killBudSession,
  pinProjectBriefSnippet,
  readFile,
  unpinProjectBriefSnippet,
  type FileTreeResponse,
  type ContextSnippet,
  type GitStatusFile,
  type ProjectBriefSnippet,
  type RunRecord,
} from '@/lib/daemon/client';
import type { FileNode } from '@agentx/api-types';

const CodeEditor = dynamic(() => import('@/components/workspace/LazyCodeEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading editor…</div>,
});

type RunSummary = {
  intent: string;
  filesChanged: string[];
  riskyAreas: string[];
};

export default function WorkspacePage() {
  const { token, connected } = useDaemon();
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [treeByPath, setTreeByPath] = useState<Record<string, FileNode[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['.']));
  const [activeFile, setActiveFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [reviewFiles, setReviewFiles] = useState<GitStatusFile[]>([]);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string>('');
  const [reviewDiff, setReviewDiff] = useState<string>('');
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<'review' | 'context'>('review');
  const [contextSnippets, setContextSnippets] = useState<ContextSnippet[]>([]);
  const [projectBrief, setProjectBrief] = useState<ProjectBriefSnippet[]>([]);
  const [budSessions, setBudSessions] = useState<Array<{ sessionId: string; runId?: string; status: string; lastSeenAt: string }>>([]);
  const [selectedBudSessionId, setSelectedBudSessionId] = useState<string>('');
  const [budRunSteps, setBudRunSteps] = useState<Array<{ id: string; type: string; content: string; timestamp: string }>>([]);
  const [latestContextPack, setLatestContextPack] = useState<{ sizeChars?: number; budgetChars?: number; truncated?: boolean } | null>(null);

  useEffect(() => {
    if (!token || !connected) return;

    let active = true;
    (async () => {
      const res = await getProjects(token);
      if (!active) return;
      if (!res.ok) {
        setStatus(formatApiError(res.error));
        return;
      }

      setProjects(res.data);
      if (!projectId && res.data.length > 0) {
        setProjectId(res.data[0].id);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, connected, projectId]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const channel = new BroadcastChannel('agentx-multitab-sync');
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; projectId?: string; budSessionId?: string };
      if (payload?.type === 'active-project' && payload.projectId && payload.projectId !== projectId) {
        setProjectId(payload.projectId);
      }
      if (payload?.type === 'selected-bud-session' && payload.budSessionId !== undefined && payload.budSessionId !== selectedBudSessionId) {
        setSelectedBudSessionId(payload.budSessionId);
      }
    };
    channel.addEventListener('message', onMessage);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
    };
  }, [projectId, selectedBudSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !projectId) return;
    const channel = new BroadcastChannel('agentx-multitab-sync');
    channel.postMessage({ type: 'active-project', projectId, ts: Date.now() });
    channel.close();
  }, [projectId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const channel = new BroadcastChannel('agentx-multitab-sync');
    channel.postMessage({ type: 'selected-bud-session', budSessionId: selectedBudSessionId, ts: Date.now() });
    channel.close();
  }, [selectedBudSessionId]);

  useEffect(() => {
    if (!projectId || !token) return;

    void loadPath('.');
    void loadReviewData(projectId, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  async function loadReviewData(targetProjectId: string, authToken: string) {
    const [statusRes, runsRes, packsRes, briefRes, budSessionsRes] = await Promise.all([
      getGitStatus(targetProjectId, authToken),
      getRuns(targetProjectId, authToken),
      getContextPacks(targetProjectId, authToken),
      getProjectBrief(targetProjectId, authToken),
      getBudSessions(targetProjectId, authToken),
    ]);

    if (!statusRes.ok) {
      setStatus(formatApiError(statusRes.error));
      return;
    }

    setReviewFiles(statusRes.data.files);

    const defaultPath = statusRes.data.files[0]?.path ?? '';
    setSelectedReviewPath(defaultPath);

    const diffRes = await getGitDiff(targetProjectId, authToken, defaultPath || undefined);
    if (diffRes.ok) {
      setReviewDiff(diffRes.data.diff || '(No diff for selected file)');
    }

    if (runsRes.ok) {
      const latestSummary = extractLatestRunSummary(runsRes.data.runs);
      setRunSummary(latestSummary);
    }

    if (packsRes.ok) {
      const latestPack = packsRes.data.contextPacks[0];
      setContextSnippets(latestPack?.retrievalDebug ?? []);
      setLatestContextPack(latestPack ? {
        sizeChars: latestPack.sizeChars,
        budgetChars: latestPack.budgetChars,
        truncated: latestPack.truncated,
      } : null);
    }

    if (briefRes.ok) {
      setProjectBrief(briefRes.data.snippets);
    }

    if (budSessionsRes.ok) {
      setBudSessions(budSessionsRes.data.sessions.map((s) => ({
        sessionId: s.sessionId,
        runId: s.runId,
        status: s.status,
        lastSeenAt: s.lastSeenAt,
      })));
      if (!selectedBudSessionId && budSessionsRes.data.sessions[0]) {
        setSelectedBudSessionId(budSessionsRes.data.sessions[0].sessionId);
      }
    }
  }

  async function loadPath(targetPath: string) {
    if (!token || !projectId || treeByPath[targetPath]) return;

    const res = await getFileTree(projectId, targetPath, token);
    if (!res.ok) {
      setStatus(formatApiError(res.error));
      return;
    }

    const data = res.data as FileTreeResponse;
    setTreeByPath((prev) => ({ ...prev, [targetPath]: data.nodes }));
    if (data.truncated) {
      setStatus(`Directory listing truncated at ${targetPath}.`);
    }
  }

  async function openFile(filePath: string) {
    if (!token || !projectId) return;

    const res = await readFile(projectId, filePath, token);
    if (!res.ok) {
      setStatus(formatApiError(res.error));
      return;
    }

    setActiveFile(filePath);
    setFileContent(res.data.content);
    setStatus(`Opened ${filePath}`);
  }

  async function selectReviewPath(filePath: string) {
    if (!projectId || !token) return;
    setSelectedReviewPath(filePath);

    const diffRes = await getGitDiff(projectId, token, filePath);
    if (!diffRes.ok) {
      setStatus(formatApiError(diffRes.error));
      return;
    }

    setReviewDiff(diffRes.data.diff || '(No diff for selected file)');
  }

  async function copyDiff() {
    if (!reviewDiff) return;

    try {
      await navigator.clipboard.writeText(reviewDiff);
      setStatus('Diff copied to clipboard');
    } catch {
      setStatus('Unable to copy diff in this browser session');
    }
  }


  async function pinSnippet(snippet: ContextSnippet) {
    if (!projectId || !token) return;
    const res = await pinProjectBriefSnippet(projectId, snippet, token);
    if (!res.ok) {
      setStatus(formatApiError(res.error));
      return;
    }
    const briefRes = await getProjectBrief(projectId, token);
    if (briefRes.ok) setProjectBrief(briefRes.data.snippets);
  }

  async function unpinSnippet(snippetId: string) {
    if (!projectId || !token) return;
    const res = await unpinProjectBriefSnippet(projectId, snippetId, token);
    if (!res.ok) {
      setStatus(formatApiError(res.error));
      return;
    }
    setProjectBrief((prev) => prev.filter((snippet) => snippet.id !== snippetId));
  }


  useEffect(() => {
    if (!selectedBudSessionId || !token) return;

    let active = true;
    const poll = async () => {
      const statusRes = await getBudSessionStatus(selectedBudSessionId, token);
      if (active && statusRes.ok) {
        setBudRunSteps(statusRes.data.run?.steps ?? []);
      }
    };

    void poll();
    const id = setInterval(() => { void poll(); }, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [selectedBudSessionId, token]);

  async function killSelectedBudSession() {
    if (!selectedBudSessionId || !token) return;
    const res = await killBudSession(selectedBudSessionId, token);
    if (!res.ok) {
      setStatus(formatApiError(res.error));
      return;
    }
    setStatus(`Killed Bud session ${selectedBudSessionId.slice(0, 8)}.`);
    await loadReviewData(projectId, token);
  }

  function toggleExpand(dirPath: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });

    void loadPath(dirPath);
  }

  const visibleRootNodes = useMemo(() => treeByPath['.'] ?? [], [treeByPath]);


  const contextBudget = latestContextPack?.budgetChars ?? 100000;
  const contextUsed = latestContextPack?.sizeChars ?? 0;
  const contextPercent = Math.min(100, Math.round((contextUsed / Math.max(1, contextBudget)) * 100));
  const contextWarn = contextPercent >= 85;


  function formatApiError(error: { error: string; requestApproval?: boolean }) {
    return error.requestApproval ? `${error.error} — Request approval to continue.` : error.error;
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'grid', gridTemplateColumns: '300px 1fr 420px' }}>
      <aside style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: 12 }}>
        <h1 style={{ marginBottom: 12 }}>Workspace</h1>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>Project</span>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTreeByPath({});
              setExpandedPaths(new Set(['.']));
              setActiveFile('');
              setFileContent('');
              setReviewFiles([]);
              setSelectedReviewPath('');
              setReviewDiff('');
            }}
            style={{ width: '100%', marginTop: 4 }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          {visibleRootNodes.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={expandedPaths}
              treeByPath={treeByPath}
              onToggle={toggleExpand}
              onOpenFile={openFile}
            />
          ))}
        </div>
      </aside>

      <main style={{ height: '100%', minHeight: 0, borderRight: '1px solid var(--border)' }}>
        {activeFile ? (
          <CodeEditor path={activeFile} content={fileContent} onChange={setFileContent} readOnly={false} />
        ) : (
          <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Select a file to open.</div>
        )}
        {status ? (
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
            {status}
          </div>
        ) : null}
      </main>

      <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button type="button" onClick={() => setActiveRightTab('review')} style={{ flex: 1, padding: '10px 12px', background: activeRightTab === 'review' ? 'var(--muted)' : 'transparent' }}>Review</button>
          <button type="button" onClick={() => setActiveRightTab('context')} style={{ flex: 1, padding: '10px 12px', background: activeRightTab === 'context' ? 'var(--muted)' : 'transparent' }}>Context Pack</button>
        </div>

        {activeRightTab === 'review' ? (
          <>
            {runSummary ? (
              <div style={{ borderBottom: '1px solid var(--border)', padding: 12, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Latest Run Summary</div>
                <div><strong>Intent:</strong> {runSummary.intent || '(not available)'}</div>
                <div><strong>Files changed:</strong> {runSummary.filesChanged.length}</div>
                <div><strong>Risky areas:</strong> {runSummary.riskyAreas.join(', ') || 'none'}</div>
              </div>
            ) : null}

            <div style={{ borderBottom: '1px solid var(--border)', padding: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Modified Files</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflow: 'auto' }}>
                {reviewFiles.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No modified files.</span>
                ) : (
                  reviewFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => void selectReviewPath(file.path)}
                      style={{
                        textAlign: 'left',
                        border: '1px solid var(--border)',
                        background: selectedReviewPath === file.path ? 'var(--muted)' : 'transparent',
                        color: 'var(--text-primary)',
                        borderRadius: 6,
                        padding: '6px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 12 }}>{file.path}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {file.stagedStatus || '-'} / {file.unstagedStatus || '-'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid var(--border)' }}>
              <button type="button" onClick={() => void copyDiff()}>Copy Diff</button>
              <button type="button" onClick={() => selectedReviewPath && void openFile(selectedReviewPath)} disabled={!selectedReviewPath}>
                Open in Editor
              </button>
            </div>

            <pre style={{ margin: 0, padding: 12, overflow: 'auto', fontSize: 11, flex: 1, background: '#0f172a', color: '#e2e8f0' }}>
              {reviewDiff || 'Select a modified file to inspect diff.'}
            </pre>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div style={{ borderBottom: '1px solid var(--border)', padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Context Capacity</div>
              <div style={{ fontSize: 12, color: contextWarn ? 'var(--status-warning)' : 'var(--text-secondary)', marginBottom: 6 }}>
                {contextUsed.toLocaleString()} / {contextBudget.toLocaleString()} chars ({contextPercent}%)
                {contextWarn ? ' • Approaching context limit (85%+)' : ''}
              </div>
              <div style={{ height: 8, background: 'var(--muted)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  width: `${contextPercent}%`,
                  height: '100%',
                  background: contextWarn ? 'var(--status-warning)' : 'var(--status-success)',
                }} />
              </div>
              {latestContextPack?.truncated ? (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--status-warning)' }}>
                  Latest context pack was truncated to fit the hard 100,000-char cap.
                </div>
              ) : null}
            </div>

            <div style={{ borderBottom: '1px solid var(--border)', padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Bud Sessions</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select value={selectedBudSessionId} onChange={(e) => setSelectedBudSessionId(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Select session…</option>
                  {budSessions.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.sessionId.slice(0, 8)} • {session.status}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void killSelectedBudSession()} disabled={!selectedBudSessionId}>Kill</button>
              </div>
              <div style={{ maxHeight: 140, overflow: 'auto', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
                {budRunSteps.length === 0 ? (
                  <span style={{ color: 'var(--text-secondary)' }}>No Bud stream events yet.</span>
                ) : budRunSteps.slice(-20).map((step) => (
                  <div key={step.id} style={{ marginBottom: 4 }}>
                    <strong>{step.type}</strong> — {step.content.slice(0, 100)}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderBottom: '1px solid var(--border)', padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Snippets (source-linked)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflow: 'auto' }}>
                {contextSnippets.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No context snippets available yet.</span>
                ) : contextSnippets.map((snippet) => (
                  <div key={snippet.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, fontSize: 12 }}>
                    <div><strong>{snippet.sourceType}</strong> • {snippet.sourceRef}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>why included: {snippet.reason} • score: {snippet.score.toFixed(2)}</div>
                    <div style={{ marginTop: 4 }}>{snippet.contentPreview || '(no preview)'}</div>
                    <button type="button" onClick={() => void pinSnippet(snippet)} style={{ marginTop: 6 }}>Pin to Project Brief</button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: 12, overflow: 'auto' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Project Brief (pinned)</div>
              {projectBrief.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No pinned snippets.</span>
              ) : projectBrief.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 12 }}>
                  <div><strong>{item.snippet.sourceType}</strong> • {item.snippet.sourceRef}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>pinned: {new Date(item.pinnedAt).toLocaleString()}</div>
                  <div style={{ marginTop: 4 }}>{item.snippet.contentPreview || '(no preview)'}</div>
                  <button type="button" onClick={() => void unpinSnippet(item.id)} style={{ marginTop: 6 }}>Unpin</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function extractLatestRunSummary(runs: RunRecord[]): RunSummary | null {
  const sorted = [...runs].sort((a, b) => {
    return (new Date(b.endedAt || b.startedAt || 0).getTime() - new Date(a.endedAt || a.startedAt || 0).getTime());
  });

  for (const run of sorted) {
    if (!run.summary) continue;
    try {
      const parsed = JSON.parse(run.summary) as RunSummary;
      if (parsed && Array.isArray(parsed.filesChanged) && Array.isArray(parsed.riskyAreas)) {
        return parsed;
      }
    } catch {
      // Ignore legacy summaries.
    }
  }

  return null;
}

function TreeNode({
  node,
  depth,
  expandedPaths,
  treeByPath,
  onToggle,
  onOpenFile,
}: {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  treeByPath: Record<string, FileNode[]>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const isDir = node.type === 'directory';
  const expanded = expandedPaths.has(node.path);
  const children = treeByPath[node.path] ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => (isDir ? onToggle(node.path) : onOpenFile(node.path))}
        style={{
          display: 'flex',
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          padding: '4px 8px',
          textAlign: 'left',
          cursor: 'pointer',
          paddingLeft: 8 + depth * 14,
        }}
      >
        <span style={{ width: 18 }}>{isDir ? (expanded ? '▾' : '▸') : '•'}</span>
        <span>{node.name}</span>
      </button>

      {isDir && expanded &&
        children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            treeByPath={treeByPath}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
          />
        ))}
    </div>
  );
}
