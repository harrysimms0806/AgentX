// Authentication system
import { randomBytes, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

interface Session {
  token: string;
  clientId: string;
  createdAt: Date;
  lastUsed: Date;
}

class Auth {
  private sessions: Map<string, Session> = new Map();
  private sessionsFile: string = '';
  private enabled = true;

  async initialize(): Promise<void> {
    // Get config at initialization time (after port discovery)
    const { config } = await import('./config');
    this.sessionsFile = path.join(config.runtimeDir, 'sessions.json');
    
    // Load existing sessions
    if (fs.existsSync(this.sessionsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf8'));
        for (const session of data.sessions || []) {
          this.sessions.set(session.token, {
            ...session,
            createdAt: new Date(session.createdAt),
            lastUsed: new Date(session.lastUsed),
          });
        }
        console.log(`📋 Loaded ${this.sessions.size} session(s)`);
      } catch (err) {
        console.warn('Failed to load sessions:', err);
      }
    }
  }

  createSession(clientId: string): Session {
    const token = randomBytes(32).toString('hex');
    const session: Session = {
      token,
      clientId,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    
    this.sessions.set(token, session);
    this.persistSessions();
    
    console.log(`🔑 Created session for ${clientId}`);
    return session;
  }

  validateToken(token: string): Session | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    
    // Update last used
    session.lastUsed = new Date();
    this.persistSessions();
    
    return session;
  }

  revokeSession(token: string): boolean {
    const result = this.sessions.delete(token);
    if (result) {
      this.persistSessions();
    }
    return result;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private persistSessions(): void {
    const data = {
      sessions: Array.from(this.sessions.values()),
    };
    fs.writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2));
  }
}

export const auth = new Auth();
