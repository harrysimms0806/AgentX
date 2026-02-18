'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDaemon } from '@/contexts/DaemonContext';
import { getFileTree, getProjects, readFile, type FileTreeResponse } from '@/lib/daemon/client';
import type { FileNode } from '@agentx/api-types';

const CodeEditor = dynamic(() => import('@/components/workspace/LazyCodeEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading editor…</div>,
});

export default function WorkspacePage() {
  const { token, connected } = useDaemon();
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [treeByPath, setTreeByPath] = useState<Record<string, FileNode[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['.']));
  const [activeFile, setActiveFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    if (!token || !connected) return;

    let active = true;
    (async () => {
      const res = await getProjects(token);
      if (!active) return;
      if (!res.ok) {
        setStatus(res.error.error);
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
    if (!projectId || !token) return;

    void loadPath('.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  async function loadPath(targetPath: string) {
    if (!token || !projectId || treeByPath[targetPath]) return;

    const res = await getFileTree(projectId, targetPath, token);
    if (!res.ok) {
      setStatus(res.error.error);
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
      setStatus(res.error.error);
      return;
    }

    setActiveFile(filePath);
    setFileContent(res.data.content);
    setStatus(`Opened ${filePath}`);
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

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'grid', gridTemplateColumns: '320px 1fr' }}>
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

      <main style={{ height: '100%', minHeight: 0 }}>
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
    </div>
  );
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
