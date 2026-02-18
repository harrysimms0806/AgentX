// Configuration management
import fs from 'fs';
import path from 'path';
import os from 'os';

interface Config {
  port: number;
  uiPort: number;
  sandboxRoot: string;
  runtimeDir: string;
  databasePath: string;
  auditLogPath: string;
  maxOutputBuffer: number;
  defaultTimeout: number;
  logRetention: number;
}

function findAvailablePort(preferred: number, max: number): number {
  // TODO: Actually check if ports are available
  // For now, return preferred (will fail fast if taken)
  return preferred;
}

function resolveSandboxRoot(): string {
  // Default to BUD BOT/projects for compatibility
  const defaultRoot = path.join(os.homedir(), 'BUD BOT', 'projects');
  
  // Allow override via env
  if (process.env.AGENTX_SANDBOX) {
    return path.resolve(process.env.AGENTX_SANDBOX);
  }
  
  return defaultRoot;
}

const runtimeDir = path.join(os.homedir(), '.agentx');

export const config: Config = {
  port: findAvailablePort(3001, 3010),
  uiPort: findAvailablePort(3000, 3010),
  sandboxRoot: resolveSandboxRoot(),
  runtimeDir,
  databasePath: path.join(runtimeDir, 'daemon.db'),
  auditLogPath: path.join(runtimeDir, 'audit.jsonl'),
  maxOutputBuffer: 10 * 1024 * 1024, // 10MB
  defaultTimeout: 5 * 60 * 1000, // 5 minutes
  logRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Ensure runtime directory exists
if (!fs.existsSync(config.runtimeDir)) {
  fs.mkdirSync(config.runtimeDir, { recursive: true });
}

console.log('Config loaded:', {
  port: config.port,
  uiPort: config.uiPort,
  sandboxRoot: config.sandboxRoot,
});
