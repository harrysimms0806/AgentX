"use strict";
// AgentX Daemon - Phase 5 Implementation
// Core daemon + SQLite + WebSocket terminals + Agent orchestration + AI execution
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const http_1 = __importDefault(require("http"));
const config_1 = require("./config");
const auth_1 = require("./auth");
const sandbox_1 = require("./sandbox");
const audit_1 = require("./audit");
const supervisor_1 = require("./supervisor");
const database_1 = require("./database");
const terminal_1 = require("./terminal");
const websocket_1 = require("./websocket");
const agents_1 = require("./agents");
const openclaw_adapter_1 = require("./openclaw-adapter");
const auth_2 = require("./middleware/auth");
const health_1 = require("./routes/health");
const auth_3 = require("./routes/auth");
const projects_1 = require("./routes/projects");
const filesystem_1 = require("./routes/filesystem");
const audit_2 = require("./routes/audit");
const supervisor_2 = require("./routes/supervisor");
const locks_1 = require("./routes/locks");
const git_1 = require("./routes/git");
const terminals_1 = require("./routes/terminals");
const agents_2 = require("./routes/agents");
const runs_1 = require("./routes/runs");
const workflows_1 = require("./routes/workflows");
const openclaw_1 = require("./routes/openclaw");
const intelligence_1 = require("./routes/intelligence");
const plugins_1 = require("./routes/plugins");
const app = (0, express_1.default)();
exports.app = app;
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Disable for local dev
    crossOriginEmbedderPolicy: false,
}));
// CORS restricted to localhost only
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow UI origin or no origin (same-origin requests)
        if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
// AUTH POLICY
// HTTP Routes: Explicit public routes mounted without authMiddleware:
// - /health - Health check (no auth required)
// - /auth/session - Create session (must be public to obtain token)
// ALL other HTTP routes require Bearer token via authMiddleware
//
// WebSocket Policy (for future Phase 3+):
// - WS connections must perform auth handshake on connect
// - Reject connection if valid Bearer token not provided in subprotocol/header
// - Use same authMiddleware logic adapted for WS upgrade
// - Audit all WS connections like HTTP requests
// Routes - public endpoints mounted WITHOUT authMiddleware
app.use('/health', health_1.healthRouter);
app.use('/auth', auth_3.authPublicRouter); // /auth/session - public
// Routes - protected endpoints mounted WITH authMiddleware
app.use('/auth', auth_2.authMiddleware, auth_3.authProtectedRouter); // /auth/revoke - protected
app.use('/projects', auth_2.authMiddleware, projects_1.projectsRouter);
app.use('/fs', auth_2.authMiddleware, filesystem_1.fsRouter);
app.use('/audit', auth_2.authMiddleware, audit_2.auditRouter);
app.use('/supervisor', auth_2.authMiddleware, supervisor_2.supervisorRouter);
app.use('/locks', auth_2.authMiddleware, locks_1.locksRouter);
app.use('/git', auth_2.authMiddleware, git_1.gitRouter);
app.use('/terminals', auth_2.authMiddleware, terminals_1.terminalsRouter);
app.use('/agents', auth_2.authMiddleware, agents_2.agentsRouter);
app.use('/runs', auth_2.authMiddleware, runs_1.runsRouter);
app.use('/workflows', auth_2.authMiddleware, workflows_1.workflowsRouter);
app.use('/openclaw', auth_2.authMiddleware, openclaw_1.openclawRouter);
app.use('/intelligence', auth_2.authMiddleware, intelligence_1.intelligenceRouter);
app.use('/plugins', auth_2.authMiddleware, plugins_1.pluginsRouter);
// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString(),
    });
});
// Initialize and start
async function main() {
    console.log('🔧 AgentX Daemon - Phase 5');
    // Initialize config first (includes port discovery)
    await (0, config_1.initializeConfig)();
    console.log(`Sandbox root: ${config_1.config.sandboxRoot}`);
    // Initialize subsystems
    await auth_1.auth.initialize();
    await sandbox_1.sandbox.initialize();
    await audit_1.audit.initialize();
    await supervisor_1.supervisor.initialize();
    // Initialize SQLite database (Phase 2)
    (0, database_1.initDatabase)();
    console.log('💾 SQLite persistence initialized');
    // Cleanup expired Bud sessions every 10 minutes
    setInterval(() => {
        const cleaned = database_1.budSessionDb.cleanupExpired();
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} expired Bud session(s)`);
        }
    }, 10 * 60 * 1000);
    // Initialize terminal manager (Phase 3)
    terminal_1.terminalManager.initialize();
    // Initialize agent manager (Phase 4)
    agents_1.agentManager.initialize();
    // Initialize OpenClaw gateway adapter (Phase 6.1)
    openclaw_adapter_1.openclawAdapter.initialize({
        enabled: config_1.config.aiEngine === 'openclaw',
        gatewayUrl: config_1.config.openclaw.gatewayUrl,
        token: config_1.config.openclaw.token,
        reconnectInitialDelayMs: config_1.config.openclaw.reconnectInitialDelayMs,
        reconnectMaxDelayMs: config_1.config.openclaw.reconnectMaxDelayMs,
        reconnectMultiplier: config_1.config.openclaw.reconnectMultiplier,
    });
    // Write runtime config for UI discovery
    // Schema versioned for backward compatibility
    const runtimeConfig = {
        schemaVersion: '1.0',
        uiPort: config_1.config.uiPort,
        daemonPort: config_1.config.port,
        startedAt: new Date().toISOString(),
    };
    const runtimeDir = path_1.default.join(os_1.default.homedir(), '.agentx');
    if (!fs_1.default.existsSync(runtimeDir)) {
        fs_1.default.mkdirSync(runtimeDir, { recursive: true });
    }
    fs_1.default.writeFileSync(path_1.default.join(runtimeDir, 'runtime.json'), JSON.stringify(runtimeConfig, null, 2));
    // Start server
    const server = http_1.default.createServer(app);
    // Initialize WebSocket server (Phase 3)
    websocket_1.wsServer.initialize(server);
    server.listen(config_1.config.port, '127.0.0.1', () => {
        console.log(`✅ Daemon running on http://127.0.0.1:${config_1.config.port}`);
        console.log(`📁 Sandbox: ${config_1.config.sandboxRoot}`);
        console.log(`🔒 Auth: ${auth_1.auth.isEnabled() ? 'enabled' : 'disabled'}`);
        console.log('🖥️  WebSocket terminals: enabled on /ws');
        console.log('🤖 Agent orchestration: enabled');
        console.log('🧠 AI agent execution: enabled (Phase 5)');
    });
}
main().catch((err) => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
});
// Graceful shutdown handlers
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    openclaw_adapter_1.openclawAdapter.stop();
    agents_1.agentManager.shutdown();
    websocket_1.wsServer.shutdown();
    terminal_1.terminalManager.shutdown();
    await supervisor_1.supervisor.shutdown();
    audit_1.audit.shutdown();
    (0, database_1.closeDatabase)();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    openclaw_adapter_1.openclawAdapter.stop();
    agents_1.agentManager.shutdown();
    websocket_1.wsServer.shutdown();
    terminal_1.terminalManager.shutdown();
    await supervisor_1.supervisor.shutdown();
    audit_1.audit.shutdown();
    (0, database_1.closeDatabase)();
    process.exit(0);
});
