// Configuration management
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';

export interface Config {
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

// Config will be populated by initializeConfig()
export let config: Config;

/**
 * Check if a port is available by attempting to create a server
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(false); // Other error, treat as unavailable
      }
    });
    
    server.once('listening', () => {
      server.close(() => {
        resolve(true); // Port is available
      });
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find first available port in range [preferred, max]
 */
async function findAvailablePort(preferred: number, max: number): Promise<number> {
  for (let port = preferred; port <= max; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`  Port ${port} in use, trying next...`);
  }
  throw new Error(`No available ports in range ${preferred}-${max}`);
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

/**
 * Initialize configuration with port discovery
 * Must be called before accessing config
 */
export async function initializeConfig(): Promise<Config> {
  const runtimeDir = path.join(os.homedir(), '.agentx');
  
  console.log('🔍 Discovering available ports...');
  const [port, uiPort] = await Promise.all([
    findAvailablePort(3001, 3010),
    findAvailablePort(3000, 3010),
  ]);
  
  config = {
    port,
    uiPort,
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
  
  return config;
}
