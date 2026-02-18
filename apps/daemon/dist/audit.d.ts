import { AuditEvent } from '@agentx/api-types';
declare class Audit {
    private logPath;
    private buffer;
    private flushInterval;
    constructor();
    initialize(): Promise<void>;
    /**
     * Append an audit event
     * This is the ONLY way to write to the audit log
     */
    log(projectId: string, actorType: 'user' | 'agent' | 'system', actionType: string, payload: Record<string, unknown>, actorId?: string): AuditEvent;
    /**
     * Read audit log (exportable but never editable)
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
