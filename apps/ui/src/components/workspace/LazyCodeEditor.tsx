'use client';

import { useMemo } from 'react';

interface LazyCodeEditorProps {
  path: string;
  content: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

// Fallback editor used when Monaco package is unavailable in this environment.
// Kept as isolated lazy chunk so dashboard/settings do not load editor code.
export default function LazyCodeEditor({ path, content, onChange, readOnly = false }: LazyCodeEditorProps) {
  const language = useMemo(() => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    return 'plaintext';
  }, [path]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 }}>
        {path} • {language}
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.5,
          padding: 12,
        }}
      />
    </div>
  );
}
