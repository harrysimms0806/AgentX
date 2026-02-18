"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// Configuration management
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
function findAvailablePort(preferred, max) {
    // TODO: Actually check if ports are available
    // For now, return preferred (will fail fast if taken)
    return preferred;
}
function resolveSandboxRoot() {
    // Default to BUD BOT/projects for compatibility
    const defaultRoot = path_1.default.join(os_1.default.homedir(), 'BUD BOT', 'projects');
    // Allow override via env
    if (process.env.AGENTX_SANDBOX) {
        return path_1.default.resolve(process.env.AGENTX_SANDBOX);
    }
    return defaultRoot;
}
const runtimeDir = path_1.default.join(os_1.default.homedir(), '.agentx');
exports.config = {
    port: findAvailablePort(3001, 3010),
    uiPort: findAvailablePort(3000, 3010),
    sandboxRoot: resolveSandboxRoot(),
    runtimeDir,
    databasePath: path_1.default.join(runtimeDir, 'daemon.db'),
    auditLogPath: path_1.default.join(runtimeDir, 'audit.jsonl'),
    maxOutputBuffer: 10 * 1024 * 1024, // 10MB
    defaultTimeout: 5 * 60 * 1000, // 5 minutes
    logRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
};
// Ensure runtime directory exists
if (!fs_1.default.existsSync(exports.config.runtimeDir)) {
    fs_1.default.mkdirSync(exports.config.runtimeDir, { recursive: true });
}
console.log('Config loaded:', {
    port: exports.config.port,
    uiPort: exports.config.uiPort,
    sandboxRoot: exports.config.sandboxRoot,
});
