import { randomUUID } from 'crypto';

export const OPENCLAW_ALLOWED_TOOLS = new Set([
  'readFile',
  'writeFile',
  'runCommand',
  'listFiles',
  'gitStatus',
  'searchFiles',
  'gitCommit',
  'complete',
]);

export interface OpenClawSpawnTaskMessage {
  type: 'spawn/task';
  version?: string;
  sessionId: string;
  projectId: string;
  runId?: string;
  prompt: string;
}

export interface OpenClawToolCallMessage {
  type: 'tool_call';
  version?: string;
  id: string;
  sessionId?: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface OpenClawToolResultMessage {
  type: 'tool_result';
  version?: string;
  id: string;
  sessionId?: string;
  tool: string;
  success: boolean;
  result: unknown;
  error?: string;
}

export interface OpenClawCompleteMessage {
  type: 'complete';
  version?: string;
  sessionId?: string;
  summary: string;
}

export interface OpenClawErrorMessage {
  type: 'error';
  version?: string;
  sessionId?: string;
  error: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function parseSpawnTaskMessage(value: unknown): OpenClawSpawnTaskMessage | null {
  if (!isRecord(value)) return null;
  if (value.type !== 'spawn/task') return null;

  const sessionId = asString(value.sessionId);
  const projectId = asString(value.projectId);
  const prompt = asString(value.prompt);
  if (!sessionId || !projectId || !prompt) {
    return null;
  }

  return {
    type: 'spawn/task',
    version: asString(value.version),
    sessionId,
    projectId,
    runId: asString(value.runId),
    prompt,
  };
}

export function parseToolCallMessage(value: unknown): OpenClawToolCallMessage | null {
  if (!isRecord(value)) return null;
  if (value.type !== 'tool_call') return null;

  const id = asString(value.id) || `tool-call-${randomUUID()}`;
  const tool = asString(value.tool);
  const args = isRecord(value.args) ? value.args : null;
  if (!tool || !args || !OPENCLAW_ALLOWED_TOOLS.has(tool)) {
    return null;
  }

  return {
    type: 'tool_call',
    version: asString(value.version),
    id,
    sessionId: asString(value.sessionId),
    tool,
    args,
  };
}

export function parseCompleteOrErrorMessage(value: unknown): OpenClawCompleteMessage | OpenClawErrorMessage | null {
  if (!isRecord(value)) return null;

  if (value.type === 'complete') {
    const summary = asString(value.summary);
    if (!summary) return null;
    return {
      type: 'complete',
      version: asString(value.version),
      sessionId: asString(value.sessionId),
      summary,
    };
  }

  if (value.type === 'error') {
    const error = asString(value.error);
    if (!error) return null;
    return {
      type: 'error',
      version: asString(value.version),
      sessionId: asString(value.sessionId),
      error,
    };
  }

  return null;
}

export function buildToolResultMessage(input: {
  id: string;
  tool: string;
  sessionId?: string;
  success: boolean;
  result: unknown;
  error?: string;
  version?: string;
}): OpenClawToolResultMessage {
  return {
    type: 'tool_result',
    version: input.version,
    id: input.id,
    tool: input.tool,
    sessionId: input.sessionId,
    success: input.success,
    result: input.result,
    error: input.error,
  };
}
