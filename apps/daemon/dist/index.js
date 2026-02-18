"use strict";
// AgentX Daemon - Phase 0 Implementation
// Core daemon with auth, sandbox, audit, and supervisor
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
const config_1 = require("./config");
const auth_1 = require("./auth");
const sandbox_1 = require("./sandbox");
const audit_1 = require("./audit");
const supervisor_1 = require("./supervisor");
const auth_2 = require("./middleware/auth");
const health_1 = require("./routes/health");
const auth_3 = require("./routes/auth");
const projects_1 = require("./routes/projects");
const filesystem_1 = require("./routes/filesystem");
const audit_2 = require("./routes/audit");
const supervisor_2 = require("./routes/supervisor");
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
// PUBLIC ROUTE ALLOWLIST
// These are the ONLY routes that do not require Bearer token authentication
// - /health - Health check for monitoring
// - /auth/session - Create new session (must be public to obtain token)
// ALL other routes require valid Bearer token via authMiddleware
const PUBLIC_ROUTES = ['/health', '/auth/session'];
// Routes - /health is the ONLY public endpoint (per Phase 0 requirements)
app.use('/health', health_1.healthRouter);
app.use('/auth', auth_3.authPublicRouter); // /auth/session - public
app.use('/auth', auth_2.authMiddleware, auth_3.authProtectedRouter); // /auth/revoke - protected
app.use('/projects', auth_2.authMiddleware, projects_1.projectsRouter);
app.use('/fs', auth_2.authMiddleware, filesystem_1.fsRouter);
app.use('/audit', auth_2.authMiddleware, audit_2.auditRouter);
app.use('/supervisor', auth_2.authMiddleware, supervisor_2.supervisorRouter);
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
    console.log('🔧 AgentX Daemon - Phase 0');
    // Initialize config first (includes port discovery)
    await (0, config_1.initializeConfig)();
    console.log(`Sandbox root: ${config_1.config.sandboxRoot}`);
    // Initialize subsystems
    await auth_1.auth.initialize();
    await sandbox_1.sandbox.initialize();
    await audit_1.audit.initialize();
    await supervisor_1.supervisor.initialize();
    // Write runtime config for UI discovery
    const runtimeConfig = {
        uiPort: config_1.config.uiPort,
        daemonPort: config_1.config.port,
        startedAt: new Date().toISOString(),
        sandboxRoot: config_1.config.sandboxRoot,
    };
    const runtimeDir = path_1.default.join(os_1.default.homedir(), '.agentx');
    if (!fs_1.default.existsSync(runtimeDir)) {
        fs_1.default.mkdirSync(runtimeDir, { recursive: true });
    }
    fs_1.default.writeFileSync(path_1.default.join(runtimeDir, 'runtime.json'), JSON.stringify(runtimeConfig, null, 2));
    // Start server
    app.listen(config_1.config.port, '127.0.0.1', () => {
        console.log(`✅ Daemon running on http://127.0.0.1:${config_1.config.port}`);
        console.log(`📁 Sandbox: ${config_1.config.sandboxRoot}`);
        console.log(`🔒 Auth: ${auth_1.auth.isEnabled() ? 'enabled' : 'disabled'}`);
    });
}
main().catch((err) => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
});
// Graceful shutdown handlers
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    await supervisor_1.supervisor.shutdown();
    audit_1.audit.shutdown();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    await supervisor_1.supervisor.shutdown();
    audit_1.audit.shutdown();
    process.exit(0);
});
