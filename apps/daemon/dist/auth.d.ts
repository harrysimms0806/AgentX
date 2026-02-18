interface Session {
    token: string;
    clientId: string;
    createdAt: Date;
    lastUsed: Date;
}
declare class Auth {
    private sessions;
    private sessionsFile;
    private enabled;
    constructor();
    initialize(): Promise<void>;
    createSession(clientId: string): Session;
    validateToken(token: string): Session | null;
    revokeSession(token: string): boolean;
    isEnabled(): boolean;
    private persistSessions;
}
export declare const auth: Auth;
export {};
