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
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net_1.default.createServer();
        server.once('error', () => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close(() => {
                resolve(true);
            });
        });
        server.listen(port, '127.0.0.1');
    });
}
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
    const defaultRoot = path_1.default.join(os_1.default.homedir(), 'BUD BOT', 'projects');
    if (process.env.AGENTX_SANDBOX) {
        return path_1.default.resolve(process.env.AGENTX_SANDBOX);
    }
    return defaultRoot;
}
async function initializeConfig() {
    const runtimeDir = path_1.default.join(os_1.default.homedir(), '.agentx');
    const userConfig = loadUserConfig(runtimeDir);
    const openclawFileConfig = loadOpenClawConfig();
    console.log('🔍 Discovering available ports...');
    const [port, uiPort] = await Promise.all([
        findAvailablePort(3001, 3010),
        findAvailablePort(3000, 3010),
    ]);
    const resolvedGatewayUrl = sanitizeGatewayUrl(openclawFileConfig.gatewayUrl) ||
        sanitizeGatewayUrl(userConfig.openclaw?.gatewayUrl) ||
        'ws://127.0.0.1:18789';
    const resolvedPort = openclawFileConfig.port || userConfig.openclaw?.port || 18789;
    const resolvedToken = openclawFileConfig.token || userConfig.openclaw?.token || '';
    exports.config = {
        port,
        uiPort,
        sandboxRoot: resolveSandboxRoot(),
        runtimeDir,
        databasePath: path_1.default.join(runtimeDir, 'daemon.db'),
        auditLogPath: path_1.default.join(runtimeDir, 'audit.jsonl'),
        maxOutputBuffer: 10 * 1024 * 1024,
        defaultTimeout: 5 * 60 * 1000,
        logRetention: 7 * 24 * 60 * 60 * 1000,
        aiEngine: userConfig.ai?.engine === 'openclaw' ? 'openclaw' : 'external',
        openclaw: {
            gatewayUrl: resolvedGatewayUrl,
            token: resolvedToken,
            port: resolvedPort,
            reconnectInitialDelayMs: Math.max(250, userConfig.openclaw?.reconnectInitialDelayMs ?? 1000),
            reconnectMaxDelayMs: Math.max(1000, userConfig.openclaw?.reconnectMaxDelayMs ?? 15000),
            reconnectMultiplier: Math.max(1.1, userConfig.openclaw?.reconnectMultiplier ?? 1.8),
        },
    };
    if (!fs_1.default.existsSync(exports.config.runtimeDir)) {
        fs_1.default.mkdirSync(exports.config.runtimeDir, { recursive: true });
    }
    persistAgentXConfig(runtimeDir, exports.config, userConfig);
    console.log('Config loaded:', {
        port: exports.config.port,
        uiPort: exports.config.uiPort,
        sandboxRoot: exports.config.sandboxRoot,
        aiEngine: exports.config.aiEngine,
        openclawGateway: exports.config.openclaw.gatewayUrl,
        openclawPort: exports.config.openclaw.port,
        openclawTokenLoaded: Boolean(exports.config.openclaw.token),
    });
    return exports.config;
}
function loadUserConfig(runtimeDir) {
    try {
        const userConfigPath = path_1.default.join(runtimeDir, 'config.json');
        if (!fs_1.default.existsSync(userConfigPath)) {
            return {};
        }
        const raw = fs_1.default.readFileSync(userConfigPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
}
function loadOpenClawConfig() {
    try {
        const configPath = path_1.default.join(os_1.default.homedir(), '.openclaw', 'openclaw.json');
        const raw = fs_1.default.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        const port = Number(parsed?.gateway?.port);
        const token = typeof parsed?.gateway?.auth?.token === 'string' ? parsed.gateway.auth.token.trim() : '';
        const safePort = Number.isFinite(port) && port > 0 ? port : 18789;
        return {
            gatewayUrl: `ws://127.0.0.1:${safePort}`,
            token,
            port: safePort,
        };
    }
    catch {
        return {
            gatewayUrl: 'ws://127.0.0.1:18789',
            token: '',
            port: 18789,
        };
    }
}
function persistAgentXConfig(runtimeDir, loadedConfig, previousConfig) {
    const configPath = path_1.default.join(runtimeDir, 'config.json');
    const toStore = {
        ...previousConfig,
        ai: {
            ...(previousConfig.ai || {}),
            engine: loadedConfig.aiEngine,
        },
        openclaw: {
            ...(previousConfig.openclaw || {}),
            gatewayUrl: loadedConfig.openclaw.gatewayUrl,
            token: loadedConfig.openclaw.token,
            port: loadedConfig.openclaw.port,
            reconnectInitialDelayMs: loadedConfig.openclaw.reconnectInitialDelayMs,
            reconnectMaxDelayMs: loadedConfig.openclaw.reconnectMaxDelayMs,
            reconnectMultiplier: loadedConfig.openclaw.reconnectMultiplier,
        },
    };
    fs_1.default.writeFileSync(configPath, JSON.stringify(toStore, null, 2));
}
function sanitizeGatewayUrl(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.replace(/\0/g, '');
}
