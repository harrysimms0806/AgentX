// WebSocket Server with Terminal Support
// Phase 3: Real-time terminal sessions

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { randomUUID } from 'crypto';
import { terminalManager } from './terminal';
import { auth } from './auth';
import { audit } from './audit';

interface WSClient {
  id: string;
  ws: WebSocket;
  terminalId?: string;
  projectId?: string;
  authenticated: boolean;
  clientId: string;
  onDataHandler?: (data: string) => void;
}

const MAX_WS_BUFFERED_BYTES = 1024 * 1024; // 1MB per connection

class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();

  initialize(server: any): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      verifyClient: (info, done) => {
        const authHeader = info.req.headers.authorization;
        const protocolHeader = info.req.headers['sec-websocket-protocol'];

        let token: string | undefined;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.slice('Bearer '.length);
        } else if (typeof protocolHeader === 'string' && protocolHeader.startsWith('bearer,')) {
          // Browser fallback: subprotocol format "bearer,<token>".
          token = protocolHeader.slice('bearer,'.length);
        }

        if (!token) {
          done(false, 401, 'Authorization required (Bearer header or bearer subprotocol)');
          return;
        }
        const session = auth.validateToken(token);
        if (!session) {
          done(false, 401, 'Invalid or expired token');
          return;
        }

        (info.req as any).session = session;
        done(true);
      },
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('🔌 WebSocket server initialized on /ws (header-auth required)');
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = randomUUID();
    const session = (req as any).session;
    const client: WSClient = {
      id: clientId,
      ws,
      authenticated: !!session,
      clientId: session?.clientId || 'unknown',
    };

    this.clients.set(clientId, client);
    console.log(`WS client connected: ${clientId} (${client.clientId})`);

    this.send(client, {
      type: 'connected',
      clientId,
      authenticated: true,
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (err) {
        this.send(client, {
          type: 'error',
          code: 'INVALID_JSON',
          error: 'Invalid JSON message',
        });
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (err) => {
      console.error(`WS error for ${clientId}:`, err);
    });
  }

  private async handleMessage(client: WSClient, message: any): Promise<void> {
    const { type } = message;

    if (!client.authenticated) {
      this.send(client, {
        type: 'error',
        code: 'AUTH_REQUIRED',
        error: 'Authentication required',
      });
      client.ws.close(1008, 'auth required');
      return;
    }

    switch (type) {
      case 'terminal:create':
        await this.handleTerminalCreate(client, message);
        break;
      case 'terminal:attach':
        await this.handleTerminalAttach(client, message);
        break;
      case 'terminal:resize':
        this.handleTerminalResize(client, message);
        break;
      case 'terminal:data':
        this.handleTerminalData(client, message);
        break;
      case 'terminal:kill':
        await this.handleTerminalKill(client, message);
        break;
      case 'terminal:list':
        this.handleTerminalList(client, message);
        break;
      case 'terminal:clear':
        this.handleTerminalClear(client, message);
        break;
      default:
        this.send(client, {
          type: 'error',
          code: 'UNKNOWN_MESSAGE_TYPE',
          error: `Unknown message type: ${type}`,
        });
    }
  }

  private async handleTerminalCreate(client: WSClient, message: any): Promise<void> {
    const { projectId, cwd, shell } = message;

    if (!projectId) {
      this.send(client, {
        type: 'terminal:error',
        code: 'PROJECT_ID_REQUIRED',
        error: 'projectId required',
      });
      return;
    }

    try {
      const terminal = terminalManager.create(projectId, cwd, shell);

      await audit.log({
        id: randomUUID(),
        projectId,
        actorType: 'user',
        actorId: client.clientId,
        actionType: 'TERMINAL_CREATE',
        payload: { cwd: terminal.cwd, shell, sessionId: terminal.id, pid: terminal.pid },
        createdAt: new Date().toISOString(),
      });

      this.send(client, {
        type: 'terminal:created',
        terminal: {
          id: terminal.id,
          projectId: terminal.projectId,
          cwd: terminal.cwd,
          pid: terminal.pid,
          title: terminal.title,
          status: terminal.status,
        },
      });
    } catch (err: any) {
      this.send(client, {
        type: 'terminal:error',
        code: err?.code || 'TERMINAL_CREATE_FAILED',
        error: err?.message || 'Failed to create terminal',
      });
    }
  }

  private async handleTerminalAttach(client: WSClient, message: any): Promise<void> {
    const { terminalId } = message;

    const terminal = terminalManager.get(terminalId);
    if (!terminal) {
      this.send(client, {
        type: 'terminal:error',
        code: 'TERMINAL_NOT_FOUND',
        error: 'Terminal not found',
      });
      return;
    }

    if (client.terminalId && client.onDataHandler) {
      terminalManager.detach(client.terminalId, client.onDataHandler);
    }

    const onData = (data: string) => {
      this.send(client, {
        type: 'terminal:data',
        terminalId,
        data,
      });
    };

    const attached = terminalManager.attach(terminalId, onData);
    if (!attached) {
      this.send(client, {
        type: 'terminal:error',
        code: 'TERMINAL_ATTACH_FAILED',
        error: 'Failed to attach to terminal',
      });
      return;
    }

    client.terminalId = terminalId;
    client.projectId = terminal.projectId;
    client.onDataHandler = onData;

    this.send(client, {
      type: 'terminal:attached',
      terminalId,
    });
  }

  private handleTerminalResize(client: WSClient, message: any): void {
    const { terminalId, cols, rows } = message;

    if (!terminalId || !cols || !rows) {
      this.send(client, {
        type: 'terminal:error',
        code: 'RESIZE_DIMENSIONS_REQUIRED',
        error: 'terminalId, cols, and rows required',
      });
      return;
    }

    const success = terminalManager.resize(terminalId, cols, rows);
    if (!success) {
      this.send(client, {
        type: 'terminal:error',
        code: 'TERMINAL_NOT_ACTIVE',
        error: 'Failed to resize terminal',
      });
    }
  }

  private handleTerminalData(client: WSClient, message: any): void {
    const { terminalId, data } = message;

    const targetId = terminalId || client.terminalId;
    if (!targetId) {
      this.send(client, {
        type: 'terminal:error',
        code: 'TERMINAL_NOT_ATTACHED',
        error: 'No terminal attached or specified',
      });
      return;
    }

    const success = terminalManager.write(targetId, data);
    if (!success) {
      this.send(client, {
        type: 'terminal:error',
        code: 'TERMINAL_WRITE_FAILED',
        error: 'Failed to write to terminal',
      });
    }
  }

  private async handleTerminalKill(client: WSClient, message: any): Promise<void> {
    const { terminalId } = message;

    const terminal = terminalManager.get(terminalId);
    if (terminal) {
      await audit.log({
        id: randomUUID(),
        projectId: terminal.projectId,
        actorType: 'user',
        actorId: client.clientId,
        actionType: 'TERMINAL_KILL',
        payload: { terminalId, sessionId: terminalId, pid: terminal.pid },
        createdAt: new Date().toISOString(),
      });
    }

    const success = terminalManager.kill(terminalId);
    this.send(client, {
      type: 'terminal:killed',
      terminalId,
      success,
    });

    if (client.terminalId === terminalId) {
      client.terminalId = undefined;
      client.projectId = undefined;
      client.onDataHandler = undefined;
    }
  }

  private handleTerminalClear(client: WSClient, message: any): void {
    const { terminalId } = message;
    const success = terminalManager.clear(terminalId);
    this.send(client, {
      type: 'terminal:cleared',
      terminalId,
      success,
    });
  }

  private handleTerminalList(client: WSClient, message: any): void {
    const { projectId } = message;

    const terminals = projectId
      ? terminalManager.getByProject(projectId)
      : terminalManager.getAll();

    this.send(client, {
      type: 'terminal:list',
      terminals,
    });
  }

  private handleDisconnect(client: WSClient): void {
    if (client.terminalId && client.onDataHandler) {
      terminalManager.detach(client.terminalId, client.onDataHandler);
    }

    this.clients.delete(client.id);
  }

  private send(client: WSClient, message: any): void {
    if (client.ws.readyState !== WebSocket.OPEN) return;

    if (client.ws.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
      client.ws.close(1009, 'Client backpressure overflow');
      return;
    }

    client.ws.send(JSON.stringify(message));
  }

  shutdown(): void {
    console.log(`Closing ${this.clients.size} WebSocket connections...`);

    for (const client of this.clients.values()) {
      client.ws.close();
    }

    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }
  }
}

export const wsServer = new WebSocketServerManager();
