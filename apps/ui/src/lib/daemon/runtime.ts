import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'RUNTIME_MISSING'
      | 'RUNTIME_INVALID_JSON'
      | 'RUNTIME_INVALID_SCHEMA'
      | 'RUNTIME_READ_FAILED'
  ) {
    super(message);
  }
}

interface RuntimeConfig {
  schemaVersion: string;
  uiPort: number;
  daemonPort: number;
  startedAt: string;
}

interface RuntimeDiscovery {
  schemaVersion: string;
  daemonUrl: string;
  daemonPort: number;
  uiPort: number;
  startedAt: string;
  source: string;
}

function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535;
}

function parseRuntimeConfig(raw: unknown): RuntimeConfig {
  if (!raw || typeof raw !== 'object') {
    throw new RuntimeError('Runtime file has invalid schema', 'RUNTIME_INVALID_SCHEMA');
  }

  const runtime = raw as Partial<RuntimeConfig>;

  if (
    typeof runtime.schemaVersion !== 'string' ||
    !isValidPort(runtime.daemonPort) ||
    !isValidPort(runtime.uiPort)
  ) {
    throw new RuntimeError('Runtime file has invalid schema', 'RUNTIME_INVALID_SCHEMA');
  }

  return {
    schemaVersion: runtime.schemaVersion,
    daemonPort: runtime.daemonPort,
    uiPort: runtime.uiPort,
    startedAt: typeof runtime.startedAt === 'string' ? runtime.startedAt : new Date(0).toISOString(),
  };
}

export async function readRuntimeConfig(): Promise<RuntimeDiscovery> {
  const runtimePath = path.join(os.homedir(), '.agentx', 'runtime.json');

  try {
    const raw = await fs.readFile(runtimePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const runtime = parseRuntimeConfig(parsed);

    return {
      schemaVersion: runtime.schemaVersion,
      daemonUrl: `http://127.0.0.1:${runtime.daemonPort}`,
      daemonPort: runtime.daemonPort,
      uiPort: runtime.uiPort,
      startedAt: runtime.startedAt,
      source: runtimePath,
    };
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      throw new RuntimeError('Runtime file not found at ~/.agentx/runtime.json', 'RUNTIME_MISSING');
    }

    if (error instanceof SyntaxError) {
      throw new RuntimeError('Runtime file contains invalid JSON', 'RUNTIME_INVALID_JSON');
    }

    if (error instanceof RuntimeError) {
      throw error;
    }

    throw new RuntimeError('Failed to read runtime file', 'RUNTIME_READ_FAILED');
  }
}
