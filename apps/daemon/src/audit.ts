// Append-only audit logging
import fs from 'fs';
import { randomUUID } from 'crypto';
import { AuditEvent } from '@agentx/api-types';

class Audit {
  private logPath: string = '';
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  
  // Sensitive keys that should be redacted from logs
  private sensitiveKeys: string[] = [
    'token',
    'authorization',
    'password',
    'secret',
    'key',
    'apiKey',
    'api_key',
    'privateKey',
    'private_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'credential',
    'credentials',
  ];

  async initialize(): Promise<void> {
    // Get config at initialization time (after port discovery)
    const { config } = await import('./config');
    this.logPath = config.auditLogPath;
    
    // Ensure log file exists
    if (!fs.existsSync(this.logPath)) {
      fs.writeFileSync(this.logPath, '');
    }
    
    console.log(`📝 Audit log: ${this.logPath}`);
    
    // Start periodic flush
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  /**
   * Redact sensitive values from payload
   */
  private redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(payload)) {
      // Check if key matches any sensitive pattern (case-insensitive)
      const isSensitive = this.sensitiveKeys.some(
        sensitive => key.toLowerCase().includes(sensitive.toLowerCase())
      );
      
      if (isSensitive) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively redact nested objects
        redacted[key] = this.redactPayload(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }
    
    return redacted;
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
    // Redact sensitive fields from payload
    const safePayload = this.redactPayload(payload);
    
    const event: AuditEvent = {
      id: randomUUID(),
      projectId,
      actorType,
      actorId,
      actionType,
      payload: safePayload,
      createdAt: new Date().toISOString(),
    };

    // Add to buffer for batch writing
    this.buffer.push(JSON.stringify(event));

    // Flush immediately for privileged actions to reduce loss window
    this.flush();

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
