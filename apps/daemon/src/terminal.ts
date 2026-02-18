// Terminal Session Manager
// Phase 3: WebSocket-based interactive terminals

import { spawn, IPty } from 'node-pty';
import path from 'path';
import { randomUUID } from 'crypto';
import type { TerminalSession } from '@agentx/api-types';
import { sandbox } from './sandbox';

export interface Terminal {
  id: string;
  projectId: string;
  pty: IPty;
  cwd: string;
  createdAt: string;
  lastActiveAt: string;
  title: string;
  status: 'active' | 'closed' | 'stale';
  dataHandlers: Set<(data: string) => void>;
}

class TerminalManager {
  private terminals: Map<string, Terminal> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    // Clean up stale terminals every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStale();
    }, 5 * 60 * 1000);

    console.log('🖥️  Terminal manager initialized');
  }

  /**
   * Create a new terminal session
   */
  create(projectId: string, cwd?: string, shell?: string): Terminal {
    // Validate project
    const projectCheck = sandbox.getProjectPath(projectId);
    if (!projectCheck.allowed) {
      throw new Error(projectCheck.error || 'Invalid project');
    }

    // Determine working directory
    const workingDir = cwd 
      ? path.join(projectCheck.path, cwd)
      : projectCheck.path;

    // Determine shell (default to user's shell)
    const userShell = shell || process.env.SHELL || '/bin/bash';

    const id = randomUUID();
    const now = new Date().toISOString();

    // Create PTY
    const pty = spawn(userShell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        AGENTX_PROJECT_ID: projectId,
        AGENTX_TERMINAL_ID: id,
      },
    });

    const terminal: Terminal = {
      id,
      projectId,
      pty,
      cwd: workingDir,
      createdAt: now,
      lastActiveAt: now,
      title: path.basename(workingDir),
      status: 'active',
      dataHandlers: new Set(),
    };

    // Broadcast data to all attached handlers
    pty.onData((data) => {
      terminal.lastActiveAt = new Date().toISOString();
      for (const handler of terminal.dataHandlers) {
        try {
          handler(data);
        } catch (err) {
          // Remove failed handler
          terminal.dataHandlers.delete(handler);
        }
      }
    });

    // Handle exit
    pty.onExit(({ exitCode }) => {
      terminal.status = exitCode === 0 ? 'closed' : 'stale';
      console.log(`Terminal ${id} exited with code ${exitCode}`);
    });

    this.terminals.set(id, terminal);

    console.log(`Created terminal ${id} for project ${projectId}`);
    return terminal;
  }

  /**
   * Get a terminal by ID
   */
  get(id: string): Terminal | undefined {
    return this.terminals.get(id);
  }

  /**
   * Attach a data handler to a terminal
   */
  attach(id: string, handler: (data: string) => void): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.status !== 'active') {
      return false;
    }
    terminal.dataHandlers.add(handler);
    return true;
  }

  /**
   * Detach a data handler from a terminal
   */
  detach(id: string, handler: (data: string) => void): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    return terminal.dataHandlers.delete(handler);
  }

  /**
   * Get all terminals for a project
   */
  getByProject(projectId: string): TerminalSession[] {
    const sessions: TerminalSession[] = [];
    for (const terminal of this.terminals.values()) {
      if (terminal.projectId === projectId) {
        sessions.push(this.toSession(terminal));
      }
    }
    return sessions.sort((a, b) => 
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  }

  /**
   * Get all active terminals
   */
  getAll(): TerminalSession[] {
    const sessions: TerminalSession[] = [];
    for (const terminal of this.terminals.values()) {
      sessions.push(this.toSession(terminal));
    }
    return sessions.sort((a, b) => 
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  }

  /**
   * Resize a terminal
   */
  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.status !== 'active') {
      return false;
    }

    terminal.pty.resize(cols, rows);
    return true;
  }

  /**
   * Write data to terminal
   */
  write(id: string, data: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.status !== 'active') {
      return false;
    }

    terminal.pty.write(data);
    terminal.lastActiveAt = new Date().toISOString();
    return true;
  }

  /**
   * Kill a terminal
   */
  kill(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }

    terminal.pty.kill();
    terminal.status = 'closed';
    terminal.dataHandlers.clear();
    this.terminals.delete(id);
    console.log(`Killed terminal ${id}`);
    return true;
  }

  /**
   * Kill all terminals for a project
   */
  killByProject(projectId: string): number {
    let count = 0;
    for (const [id, terminal] of this.terminals) {
      if (terminal.projectId === projectId) {
        terminal.pty.kill();
        terminal.status = 'closed';
        terminal.dataHandlers.clear();
        this.terminals.delete(id);
        count++;
      }
    }
    console.log(`Killed ${count} terminals for project ${projectId}`);
    return count;
  }

  /**
   * Clean up stale terminals (inactive for >30 minutes)
   */
  private cleanupStale(): void {
    const now = new Date();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [id, terminal] of this.terminals) {
      const lastActive = new Date(terminal.lastActiveAt);
      const inactiveTime = now.getTime() - lastActive.getTime();

      if (inactiveTime > staleThreshold) {
        console.log(`Cleaning up stale terminal ${id}`);
        terminal.pty.kill();
        terminal.status = 'stale';
        terminal.dataHandlers.clear();
        this.terminals.delete(id);
      }
    }
  }

  /**
   * Convert Terminal to TerminalSession (API-safe)
   */
  private toSession(terminal: Terminal): TerminalSession {
    return {
      id: terminal.id,
      projectId: terminal.projectId,
      cwd: terminal.cwd,
      pid: terminal.pty.pid,
      createdAt: terminal.createdAt,
      lastActiveAt: terminal.lastActiveAt,
      title: terminal.title,
      status: terminal.status,
    };
  }

  /**
   * Shutdown all terminals
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    console.log(`Shutting down ${this.terminals.size} terminals...`);
    for (const [id, terminal] of this.terminals) {
      terminal.pty.kill();
      terminal.status = 'closed';
      terminal.dataHandlers.clear();
    }
    this.terminals.clear();
  }
}

export const terminalManager = new TerminalManager();
