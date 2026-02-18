import fs from 'fs';
import path from 'path';

export interface MemorySnippet {
  id: string;
  projectId: string;
  source: string;
  content: string;
  score: number;
  matchedKeywords: string[];
  updatedAt: string;
}

export interface RetrieveMemoryInput {
  projectId: string;
  projectPath: string;
  query: string;
  maxSnippets: number;
  maxChars: number;
}

function tokenize(input: string): string[] {
  return Array.from(new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )).sort();
}

function scoreSnippet(content: string, updatedMs: number, keywords: string[]): { score: number; matched: string[] } {
  const lower = content.toLowerCase();
  const matched = keywords.filter((keyword) => lower.includes(keyword));
  const keywordScore = matched.length * 10;
  const recencyHours = Math.max(0, (Date.now() - updatedMs) / (1000 * 60 * 60));
  const recencyScore = Math.max(0, 5 - recencyHours / 24);
  return { score: keywordScore + recencyScore, matched };
}

export function retrieveMemorySnippets(input: RetrieveMemoryInput): {
  snippets: MemorySnippet[];
  totalCandidates: number;
  truncatedToFit: boolean;
} {
  const memoryDir = path.join(input.projectPath, 'memory');
  if (!fs.existsSync(memoryDir)) {
    return { snippets: [], totalCandidates: 0, truncatedToFit: false };
  }

  const keywords = tokenize(input.query);
  const entries = fs.readdirSync(memoryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(memoryDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name, fullPath, updatedMs: stat.mtimeMs };
    })
    .sort((a, b) => {
      if (b.updatedMs !== a.updatedMs) return b.updatedMs - a.updatedMs;
      return a.name.localeCompare(b.name);
    });

  const scored = entries.map((entry) => {
    const raw = fs.readFileSync(entry.fullPath, 'utf8').slice(0, 1200);
    const { score, matched } = scoreSnippet(raw, entry.updatedMs, keywords);
    return {
      id: `${input.projectId}:${entry.name}`,
      projectId: input.projectId,
      source: `memory/${entry.name}`,
      content: raw,
      score,
      matchedKeywords: matched,
      updatedAt: new Date(entry.updatedMs).toISOString(),
    } as MemorySnippet;
  }).filter((snippet) => snippet.score > 0 || keywords.length === 0);

  const ordered = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
    return a.source.localeCompare(b.source);
  });

  const selected: MemorySnippet[] = [];
  let used = 0;
  let truncatedToFit = false;

  for (const snippet of ordered.slice(0, input.maxSnippets)) {
    const nextSize = snippet.content.length + used;
    if (nextSize > input.maxChars) {
      truncatedToFit = true;
      continue;
    }
    selected.push(snippet);
    used = nextSize;
  }

  return {
    snippets: selected,
    totalCandidates: ordered.length,
    truncatedToFit,
  };
}
