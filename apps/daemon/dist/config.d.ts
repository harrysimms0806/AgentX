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
}
export declare let config: Config;
/**
 * Initialize configuration with port discovery
 * Must be called before accessing config
 */
export declare function initializeConfig(): Promise<Config>;
