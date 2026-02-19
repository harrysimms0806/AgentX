import { spawn, type ChildProcess } from 'child_process';
const WebSocket = require('ws');

export interface OpenClawRunOptions {
  projectId: string;
  agentId: string;
  prompt: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onStart?: (pid?: number) => void;
  onTimeout?: () => void;
}

export interface OpenClawRunHandle {
  process: ChildProcess;
  args: string[];
}

export interface OpenClawConnectionStatus {
  connected: boolean;
  gatewayUrl: string;
  state: 'offline' | 'reconnecting' | 'connected';
  lastError: string | null;
  reconnectAttempts: number;
  connectedAt?: string;
}

export interface OpenClawInitConfig {
  enabled: boolean;
  gatewayUrl: string;
  token: string;
  reconnectInitialDelayMs: number;
  reconnectMaxDelayMs: number;
  reconnectMultiplier: number;
}

function sanitizeArg(value: string): string {
  return value.replace(/\0/g, '').trim();
}

class OpenClawAdapter {
  private readonly command = process.env.OPENCLAW_CMD || 'openclaw';
  private connectionStatus: OpenClawConnectionStatus = {
    connected: false,
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
    state: 'offline',
    lastError: null,
    reconnectAttempts: 0,
    connectedAt: undefined,
  };
  private ws: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 1000;
  private initializedConfig: OpenClawInitConfig | null = null;

  initialize(config: OpenClawInitConfig): void {
    this.initializedConfig = config;
    this.connectionStatus.gatewayUrl = config.gatewayUrl;
    this.reconnectDelayMs = config.reconnectInitialDelayMs;

    if (!config.enabled) {
      this.stop();
      this.connectionStatus = {
        ...this.connectionStatus,
        connected: false,
        state: 'offline',
        lastError: null,
        reconnectAttempts: 0,
        connectedAt: new Date().toISOString(),
      };
      return;
    }

    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  getStatus(): OpenClawConnectionStatus {
    return { ...this.connectionStatus };
  }

  private connect(): void {
    if (!this.initializedConfig?.enabled) {
      return;
    }

    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0)) {
      return;
    }

    const gatewayUrl = this.initializedConfig.gatewayUrl;
    this.connectionStatus = {
      ...this.connectionStatus,
      gatewayUrl,
      state: this.connectionStatus.reconnectAttempts > 0 ? 'reconnecting' : 'offline',
    };

    const headers = this.initializedConfig.token
      ? { Authorization: `Bearer ${this.initializedConfig.token}` }
      : undefined;

    this.ws = new WebSocket(gatewayUrl, headers ? { headers } : undefined);
    const socket = this.ws;

    socket.on('open', () => {
      this.connectionStatus = {
        ...this.connectionStatus,
        connected: true,
        state: 'connected',
        lastError: null,
        reconnectAttempts: 0,
        connectedAt: new Date().toISOString(),
      };
      this.reconnectDelayMs = this.initializedConfig?.reconnectInitialDelayMs ?? 1000;
    });

    socket.on('close', () => {
      this.connectionStatus = {
        ...this.connectionStatus,
        connected: false,
        connectedAt: undefined,
      };
      this.scheduleReconnect('Gateway connection closed');
    });

    socket.on('error', (error: Error) => {
      this.scheduleReconnect(error.message || 'Failed to connect to gateway');
    });
  }

  private scheduleReconnect(errorMessage: string): void {
    if (!this.initializedConfig?.enabled) {
      return;
    }

    this.connectionStatus = {
      ...this.connectionStatus,
      connected: false,
      state: 'reconnecting',
      lastError: this.redactError(errorMessage),
      reconnectAttempts: this.connectionStatus.reconnectAttempts + 1,
      connectedAt: undefined,
    };

    if (this.reconnectTimer) {
      return;
    }

    const delay = this.reconnectDelayMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    const nextDelay = Math.round(delay * (this.initializedConfig?.reconnectMultiplier ?? 1.8));
    this.reconnectDelayMs = Math.min(this.initializedConfig?.reconnectMaxDelayMs ?? 15000, nextDelay);
  }

  private redactError(error: string): string {
    return error
      .replace(/(token|api[_-]?key|authorization)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]')
      .slice(0, 300);
  }

  runTask(options: OpenClawRunOptions): OpenClawRunHandle {
    const prompt = sanitizeArg(options.prompt);
    const agentId = sanitizeArg(options.agentId);

    const args = ['run', '--agent', agentId, '--project', options.projectId, '--prompt', prompt, '--stream'];

    const child = spawn(this.command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        AGENTX_PROJECT_ID: options.projectId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    options.onStart?.(child.pid);

    const timeout = setTimeout(() => {
      options.onTimeout?.();
      try {
        child.kill('SIGTERM');
      } catch {
      }

      setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null && child.pid) {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch {
          }
        }
      }, 5000);
    }, options.timeoutMs);

    child.stdout?.on('data', (data) => {
      options.onStdout?.(data.toString());
    });

    child.stderr?.on('data', (data) => {
      options.onStderr?.(data.toString());
    });

    child.on('exit', () => {
      clearTimeout(timeout);
    });

    return { process: child, args };
  }
}

export const openclawAdapter = new OpenClawAdapter();
