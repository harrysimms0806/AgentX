import { AuditEvent } from '@agentx/api-types';
declare class Audit {
    private logPath;
    private buffer;
    private flushInterval;
    private dbInitialized;
    private sensitiveKeys;
    initialize(): Promise<void>;
    /**
     * Redact sensitive values from payload
     */
    private redactPayload;
    /**
     * Append an audit event
     * Phase 2: Dual-write to JSONL (backup) and SQLite (query)
     */
    log(event: AuditEvent): Promise<AuditEvent>;
    /**
     * Legacy log method for backward compatibility
     */
    logLegacy(projectId: string, actorType: 'user' | 'agent' | 'system', actionType: string, payload: Record<string, unknown>, actorId?: string): AuditEvent;
    /**
     * Read audit log from SQLite (Phase 2)
     */
    read(projectId?: string, limit?: number): AuditEvent[];
    /**
     * Export full audit log
     */
    export(projectId?: string): string;
    private flush;
    /**
     * Cleanup on shutdown
     */
    shutdown(): void;
}
export declare const audit: Audit;
export {};
