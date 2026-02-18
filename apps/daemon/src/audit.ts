// Append-only audit logging
import fs from 'fs';
import { randomUUID } from 'crypto';
import { config } from './config';
import { AuditEvent } from '@agentx/api-types';

class Audit {
  private logPath: string;
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logPath = config.auditLogPath;
  }

  async initialize(): Promise<void> {
    // Ensure log file exists
    if (!fs.existsSync(this.logPath)) {
      fs.writeFileSync(this.logPath, '');
    }
    
    console.log(`📝 Audit log: ${this.logPath}`);
    
    // Start periodic flush
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * Append an audit event
   * This is the ONLY way to write to the audit log
   */
  log(
    projectId: string,
    actorType: 'user' | 'agent' | 'system',
    actionType: string,
    payload: Record<string, unknown>,
    actorId?: string
  ): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      projectId,
      actorType,
      actorId,
      actionType,
      payload,
      createdAt: new Date().toISOString(),
    };

    // Add to buffer for batch writing
    this.buffer.push(JSON.stringify(event));
    
    // Immediate flush for critical actions
    if (['WRITE', 'DELETE', 'EXEC'].includes(actionType)) {
      this.flush();
    }

    return event;
  }

  /**
   * Read audit log (exportable but never editable)
   */
  read(projectId?: string, limit: number = 100): AuditEvent[] {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    const content = fs.readFileSync(this.logPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    
    const events: AuditEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as AuditEvent;
        if (!projectId || event.projectId === projectId) {
          events.push(event);
        }
      } catch {
        // Skip corrupted lines
      }
    }

    // Sort by date descending, take limit
    return events
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Export full audit log
   */
  export(projectId?: string): string {
    const events = this.read(projectId, Infinity);
    return JSON.stringify(events, null, 2);
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    
    const lines = this.buffer.join('\n') + '\n';
    fs.appendFileSync(this.logPath, lines);
    this.buffer = [];
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

export const audit = new Audit();

// Ensure flush on exit
process.on('exit', () => audit.shutdown());
process.on('SIGINT', () => {
  audit.shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  audit.shutdown();
  process.exit(0);
});
