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

class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();

  /**
   * Initialize WebSocket server
   */
  initialize(server: any): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('🔌 WebSocket server initialized on /ws');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = randomUUID();
    const client: WSClient = {
      id: clientId,
      ws,
      authenticated: false,
      clientId: '',
    };

    this.clients.set(clientId, client);
    console.log(`WS client connected: ${clientId}`);

    // Send welcome message
    this.send(client, {
      type: 'connected',
      clientId,
      message: 'WebSocket connected. Send auth handshake to continue.',
    });

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (err) {
        this.send(client, {
          type: 'error',
          error: 'Invalid JSON message',
        });
      }
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`WS error for ${clientId}:`, err);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(client: WSClient, message: any): Promise<void> {
    const { type } = message;

    // Auth handshake must be first message
    if (!client.authenticated && type !== 'auth') {
      this.send(client, {
        type: 'error',
        error: 'Authentication required. Send auth handshake first.',
      });
      return;
    }

    switch (type) {
      case 'auth':
        await this.handleAuth(client, message);
        break;

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
        this.handleTerminalKill(client, message);
        break;

      case 'terminal:list':
        this.handleTerminalList(client, message);
        break;

      default:
        this.send(client, {
          type: 'error',
          error: `Unknown message type: ${type}`,
        });
    }
  }

  /**
   * Handle auth handshake
   */
  private async handleAuth(client: WSClient, message: any): Promise<void> {
    const { token } = message;

    if (!token) {
      this.send(client, {
        type: 'auth:failed',
        error: 'Token required',
      });
      return;
    }

    const session = await auth.validateToken(token);
    if (!session) {
      this.send(client, {
        type: 'auth:failed',
        error: 'Invalid or expired token',
      });
      return;
    }

    client.authenticated = true;
    client.clientId = session.clientId;

    this.send(client, {
      type: 'auth:success',
      clientId: session.clientId,
    });

    console.log(`WS client ${client.id} authenticated as ${session.clientId}`);
  }

  /**
   * Handle terminal creation
   */
  private async handleTerminalCreate(client: WSClient, message: any): Promise<void> {
    const { projectId, cwd, shell } = message;

    if (!projectId) {
      this.send(client, {
        type: 'terminal:error',
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
        payload: { cwd, shell },
        createdAt: new Date().toISOString(),
      });

      this.send(client, {
        type: 'terminal:created',
        terminal: {
          id: terminal.id,
          projectId: terminal.projectId,
          cwd: terminal.cwd,
          title: terminal.title,
          status: terminal.status,
        },
      });
    } catch (err: any) {
      this.send(client, {
        type: 'terminal:error',
        error: err.message,
      });
    }
  }

  /**
   * Handle terminal attachment (start receiving/sending data)
   */
  private async handleTerminalAttach(client: WSClient, message: any): Promise<void> {
    const { terminalId } = message;

    const terminal = terminalManager.get(terminalId);
    if (!terminal) {
      this.send(client, {
        type: 'terminal:error',
        error: 'Terminal not found',
      });
      return;
    }

    // Detach from previous terminal if any
    if (client.terminalId && client.onDataHandler) {
      terminalManager.detach(client.terminalId, client.onDataHandler);
    }

    // Create data handler for this client
    const onData = (data: string) => {
      this.send(client, {
        type: 'terminal:data',
        terminalId,
        data,
      });
    };

    // Attach to terminal
    const attached = terminalManager.attach(terminalId, onData);
    if (!attached) {
      this.send(client, {
        type: 'terminal:error',
        error: 'Failed to attach to terminal',
      });
      return;
    }

    // Store references
    client.terminalId = terminalId;
    client.projectId = terminal.projectId;
    client.onDataHandler = onData;

    this.send(client, {
      type: 'terminal:attached',
      terminalId,
    });

    console.log(`Client ${client.id} attached to terminal ${terminalId}`);
  }

  /**
   * Handle terminal resize
   */
  private handleTerminalResize(client: WSClient, message: any): void {
    const { terminalId, cols, rows } = message;

    if (!terminalId || !cols || !rows) {
      this.send(client, {
        type: 'terminal:error',
        error: 'terminalId, cols, and rows required',
      });
      return;
    }

    const success = terminalManager.resize(terminalId, cols, rows);
    if (!success) {
      this.send(client, {
        type: 'terminal:error',
        error: 'Failed to resize terminal',
      });
    }
  }

  /**
   * Handle terminal data (input from client)
   */
  private handleTerminalData(client: WSClient, message: any): void {
    const { terminalId, data } = message;

    // Use attached terminal or specified one
    const targetId = terminalId || client.terminalId;
    if (!targetId) {
      this.send(client, {
        type: 'terminal:error',
        error: 'No terminal attached or specified',
      });
      return;
    }

    const success = terminalManager.write(targetId, data);
    if (!success) {
      this.send(client, {
        type: 'terminal:error',
        error: 'Failed to write to terminal',
      });
    }
  }

  /**
   * Handle terminal kill
   */
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
        payload: { terminalId },
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

  /**
   * Handle terminal list request
   */
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

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: WSClient): void {
    console.log(`WS client disconnected: ${client.id}`);

    // Detach from terminal
    if (client.terminalId && client.onDataHandler) {
      terminalManager.detach(client.terminalId, client.onDataHandler);
    }

    this.clients.delete(client.id);
  }

  /**
   * Send message to client
   */
  private send(client: WSClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Shutdown all connections
   */
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
