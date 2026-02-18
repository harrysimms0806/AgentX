"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.initializeConfig = initializeConfig;
// Configuration management
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const net_1 = __importDefault(require("net"));
/**
 * Check if a port is available by attempting to create a server
 */
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net_1.default.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false); // Port is in use
            }
            else {
                resolve(false); // Other error, treat as unavailable
            }
        });
        server.once('listening', () => {
            server.close(() => {
                resolve(true); // Port is available
            });
        });
        server.listen(port, '127.0.0.1');
    });
}
/**
 * Find first available port in range [preferred, max]
 */
async function findAvailablePort(preferred, max) {
    for (let port = preferred; port <= max; port++) {
        if (await isPortAvailable(port)) {
            return port;
        }
        console.log(`  Port ${port} in use, trying next...`);
    }
    throw new Error(`No available ports in range ${preferred}-${max}`);
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
/**
 * Initialize configuration with port discovery
 * Must be called before accessing config
 */
async function initializeConfig() {
    const runtimeDir = path_1.default.join(os_1.default.homedir(), '.agentx');
    console.log('🔍 Discovering available ports...');
    const [port, uiPort] = await Promise.all([
        findAvailablePort(3001, 3010),
        findAvailablePort(3000, 3010),
    ]);
    exports.config = {
        port,
        uiPort,
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
    return exports.config;
}
