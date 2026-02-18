import path from 'path';
import { randomUUID } from 'crypto';
import type { ContextPack } from './agents';
import { retrieveMemorySnippets, type MemorySnippet } from './memory-retrieval';

const DEFAULT_CONTEXT_BUDGET_CHARS = 12000;
const DEFAULT_MEMORY_SNIPPETS = 5;

export interface ContextPackBuildInput {
  projectId: string;
  projectRootPath: string;
  prompt: string;
  activeTask?: string;
  openFiles?: string[];
  recentChanges?: string[];
  userNotes?: string;
  userSnippets?: string[];
  runId?: string;
  maxChars?: number;
  maxMemorySnippets?: number;
}

function redactSecrets(input: string): string {
  return input
    .replace(/(api[_-]?key\s*[:=]\s*)([^\s"']+)/gi, '$1[REDACTED]')
    .replace(/(token\s*[:=]\s*)([^\s"']+)/gi, '$1[REDACTED]')
    .replace(/(password\s*[:=]\s*)([^\s"']+)/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)([A-Za-z0-9._-]+)/g, '$1[REDACTED]');
}

function limitText(input: string, maxChars: number): { value: string; truncated: boolean } {
  if (input.length <= maxChars) {
    return { value: input, truncated: false };
  }
  return {
    value: `${input.slice(0, Math.max(0, maxChars - 24))}\n...[truncated to fit budget]`,
    truncated: true,
  };
}

export function renderInjectedContext(pack: ContextPack): string {
  return [
    `Project Summary:\n${pack.sections.summary}`,
    `Active Task:\n${pack.sections.activeTask || '(none)'}`,
    `Open Files:\n${pack.sections.files.map((file) => `- ${file.path}: ${file.summary}`).join('\n') || '(none)'}`,
    `Recent Changes:\n${pack.sections.gitStatus || '(none)'}`,
    `Retrieved Memory Snippets:\n${pack.sections.memories.map((memory) => `- ${memory}`).join('\n') || '(none)'}`,
    `User Notes and Attachments:\n${pack.sections.userNotes || '(none)'}`,
  ].join('\n\n');
}

export function buildContextPack(input: ContextPackBuildInput): ContextPack {
  const maxChars = input.maxChars ?? DEFAULT_CONTEXT_BUDGET_CHARS;
  const maxMemorySnippets = input.maxMemorySnippets ?? DEFAULT_MEMORY_SNIPPETS;

  const retrievalBudget = Math.floor(maxChars * 0.35);
  const retrieval = retrieveMemorySnippets({
    projectId: input.projectId,
    projectPath: input.projectRootPath,
    query: input.prompt,
    maxSnippets: maxMemorySnippets,
    maxChars: retrievalBudget,
  });

  const memoryLines = retrieval.snippets.map((snippet: MemorySnippet) => {
    const why = snippet.matchedKeywords.length
      ? `matched: ${snippet.matchedKeywords.join(', ')}`
      : 'recency-only';
    return `${snippet.source} (score=${snippet.score.toFixed(2)}; ${why}; updated=${snippet.updatedAt})\n${snippet.content}`;
  });

  const fileEntries = (input.openFiles ?? []).slice(0, 20).map((filePath) => ({
    path: filePath,
    summary: `Opened by user (${path.extname(filePath) || 'file'})`,
  }));

  const notesMerged = [
    input.userNotes ?? '',
    ...(input.userSnippets ?? []),
  ].filter(Boolean).join('\n\n');

  const sections = {
    summary: `Project ${input.projectId}. Prompt intent: ${input.prompt.slice(0, 240)}`,
    activeTask: input.activeTask ?? '',
    files: fileEntries,
    gitStatus: (input.recentChanges ?? []).join('\n'),
    memories: memoryLines,
    userNotes: redactSecrets(notesMerged),
  };

  let pack: ContextPack = {
    id: `context-${randomUUID()}`,
    projectId: input.projectId,
    runId: input.runId,
    createdAt: new Date().toISOString(),
    sections,
    sizeChars: 0,
    retrievedSnippetIds: retrieval.snippets.map((snippet) => snippet.id),
    retrievalDebug: retrieval.snippets.map((snippet) => ({
      id: snippet.id,
      source: snippet.source,
      score: snippet.score,
      matchedKeywords: snippet.matchedKeywords,
      updatedAt: snippet.updatedAt,
    })),
    truncated: false,
    budgetChars: maxChars,
  };

  const serialized = renderInjectedContext(pack);
  const capped = limitText(serialized, maxChars);
  if (capped.truncated) {
    pack.sections.userNotes = `${pack.sections.userNotes}\n\n[Context pack truncated to fit budget]`.trim();
  }

  pack.sizeChars = Math.min(maxChars, redactSecrets(JSON.stringify(pack.sections)).length);
  pack.truncated = capped.truncated || retrieval.truncatedToFit;
  return pack;
}

export const contextPackConfig = {
  DEFAULT_CONTEXT_BUDGET_CHARS,
  DEFAULT_MEMORY_SNIPPETS,
};
