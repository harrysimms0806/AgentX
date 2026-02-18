declare module 'node-pty' {
  export interface IPty {
    pid: number;
    onData(listener: (data: string) => void): void;
    onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
  }

  export function spawn(file: string, args: string[], options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string | undefined>;
  }): IPty;
}

declare module 'ws' {
  import { EventEmitter } from 'events';
  import { Server } from 'http';

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    readyState: number;
    bufferedAmount: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: unknown) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: unknown) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: {
      server: Server;
      path?: string;
      verifyClient?: (info: any, done: (result: boolean, code?: number, name?: string) => void) => void;
    });
    on(event: 'connection', listener: (ws: WebSocket, req: any) => void): this;
    close(): void;
  }
}
