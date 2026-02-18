// Terminal Session Manager
// Phase 3: WebSocket-based interactive terminals

import type { TerminalSession } from '@agentx/api-types';
import { supervisor } from './supervisor';
import { validateTerminalAccess } from './terminal-policy';

export interface Terminal {
  id: string;
  projectId: string;
  cwd: string;
  createdAt: string;
  lastActiveAt: string;
  title: string;
  status: 'active' | 'closed' | 'stale';
  pid?: number;
  dataHandlers: Set<(data: string) => void>;
}

class TerminalManager {
  private terminals: Map<string, Terminal> = new Map();

  initialize(): void {
    supervisor.on('terminal:data', ({ terminalId, data }: { terminalId: string; data: string }) => {
      const terminal = this.terminals.get(terminalId);
      if (!terminal) return;
      terminal.lastActiveAt = new Date().toISOString();
      for (const handler of terminal.dataHandlers) {
        handler(data);
      }
    });

    supervisor.on('terminal:exit', ({ terminalId }: { terminalId: string }) => {
      const terminal = this.terminals.get(terminalId);
      if (!terminal) return;
      const latest = supervisor.getTerminal(terminalId);
      terminal.status = latest?.status || 'stale';
      terminal.pid = latest?.pid;
      terminal.lastActiveAt = new Date().toISOString();
    });

    // Hydrate persisted terminal sessions from supervisor registry.
    for (const existing of supervisor.listTerminals()) {
      this.terminals.set(existing.id, {
        id: existing.id,
        projectId: existing.projectId,
        cwd: existing.cwd,
        createdAt: existing.createdAt,
        lastActiveAt: existing.lastActiveAt,
        title: existing.title,
        status: existing.status,
        pid: existing.pid,
        dataHandlers: new Set(),
      });
    }

    console.log('🖥️  Terminal manager initialized');
  }

  create(projectId: string, cwd?: string, shell?: string): Terminal {
    const policy = validateTerminalAccess(projectId, cwd);
    if (!policy.allowed || !policy.realCwd) {
      const error = new Error(policy.error || 'Terminal blocked');
      (error as any).code = policy.code || 'TERMINAL_BLOCKED';
      throw error;
    }

    const created = supervisor.createTerminal(projectId, policy.realCwd, shell);
    const terminal: Terminal = {
      id: created.id,
      projectId: created.projectId,
      cwd: created.cwd,
      createdAt: created.createdAt,
      lastActiveAt: created.lastActiveAt,
      title: created.title,
      status: created.status,
      pid: created.pid,
      dataHandlers: new Set(),
    };

    this.terminals.set(terminal.id, terminal);
    return terminal;
  }

  get(id: string): Terminal | undefined {
    const terminal = this.terminals.get(id);
    if (!terminal) return undefined;

    const latest = supervisor.getTerminal(id);
    if (latest) {
      terminal.status = latest.status;
      terminal.lastActiveAt = latest.lastActiveAt;
      terminal.pid = latest.pid;
      terminal.cwd = latest.cwd;
    }

    return terminal;
  }

  attach(id: string, handler: (data: string) => void): boolean {
    const terminal = this.get(id);
    if (!terminal || terminal.status !== 'active') {
      return false;
    }

    terminal.dataHandlers.add(handler);

    // Replay bounded recent output for late subscribers.
    const recent = supervisor.getTerminalOutput(id);
    for (const chunk of recent) {
      handler(chunk);
    }

    return true;
  }

  detach(id: string, handler: (data: string) => void): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    return terminal.dataHandlers.delete(handler);
  }

  getByProject(projectId: string): TerminalSession[] {
    return this.getAll().filter((terminal) => terminal.projectId === projectId);
  }

  getAll(): TerminalSession[] {
    // Keep local session map synchronized with supervisor for stale visibility.
    const known = supervisor.listTerminals();
    for (const row of known) {
      const existing = this.terminals.get(row.id);
      if (existing) {
        existing.projectId = row.projectId;
        existing.cwd = row.cwd;
        existing.createdAt = row.createdAt;
        existing.lastActiveAt = row.lastActiveAt;
        existing.title = row.title;
        existing.status = row.status;
        existing.pid = row.pid;
        continue;
      }

      this.terminals.set(row.id, {
        id: row.id,
        projectId: row.projectId,
        cwd: row.cwd,
        createdAt: row.createdAt,
        lastActiveAt: row.lastActiveAt,
        title: row.title,
        status: row.status,
        pid: row.pid,
        dataHandlers: new Set(),
      });
    }

    return Array.from(this.terminals.values())
      .map((terminal) => ({
        id: terminal.id,
        projectId: terminal.projectId,
        cwd: terminal.cwd,
        pid: terminal.pid,
        createdAt: terminal.createdAt,
        lastActiveAt: terminal.lastActiveAt,
        title: terminal.title,
        status: terminal.status,
      }))
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
  }

  resize(id: string, cols: number, rows: number): boolean {
    return supervisor.resizeTerminal(id, cols, rows);
  }

  write(id: string, data: string): boolean {
    return supervisor.writeTerminal(id, data);
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;

    supervisor.killTerminal(id, 'user');
    terminal.status = 'closed';
    terminal.dataHandlers.clear();
    return true;
  }

  clear(id: string): boolean {
    this.terminals.delete(id);
    return supervisor.clearTerminal(id);
  }

  killByProject(projectId: string): number {
    const terminals = this.getByProject(projectId);
    for (const terminal of terminals) {
      this.kill(terminal.id);
    }
    return terminals.length;
  }

  shutdown(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dataHandlers.clear();
    }
    this.terminals.clear();
  }
}

export const terminalManager = new TerminalManager();
