interface Config {
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
export declare const config: Config;
export {};
