"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
// Health check endpoint - no auth required
const express_1 = require("express");
const config_1 = require("../config");
const openclaw_adapter_1 = require("../openclaw-adapter");
const router = (0, express_1.Router)();
exports.healthRouter = router;
router.get('/', (req, res) => {
    const openclaw = openclaw_adapter_1.openclawAdapter.getStatus();
    const redactedError = openclaw.lastError ? redactHealthError(openclaw.lastError) : null;
    res.json({
        status: 'ok',
        version: '0.1.0-phase0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sandbox: config_1.config.sandboxRoot,
        daemonPort: config_1.config.port,
        uiPort: config_1.config.uiPort,
        aiEngine: config_1.config.aiEngine,
        openclaw: {
            connected: openclaw.connected,
            state: openclaw.state,
            gatewayUrl: openclaw.gatewayUrl,
            lastError: redactedError,
        },
    });
});
function redactHealthError(errorMessage) {
    return errorMessage
        .replace(/(token|api[_-]?key|authorization)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]')
        .slice(0, 300);
}
