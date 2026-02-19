export interface Config {
    port: number;
    uiPort: number;
    sandboxRoot: string;
    runtimeDir: string;
    databasePath: string;
    auditLogPath: string;
    maxOutputBuffer: number;
    defaultTimeout: number;
    logRetention: number;
    aiEngine: 'external' | 'openclaw';
    openclaw: {
        gatewayUrl: string;
        token: string;
        port: number;
        reconnectInitialDelayMs: number;
        reconnectMaxDelayMs: number;
        reconnectMultiplier: number;
    };
}
export declare let config: Config;
export declare function initializeConfig(): Promise<Config>;
