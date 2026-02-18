"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
// Health check endpoint - no auth required
const express_1 = require("express");
const config_1 = require("../config");
const router = (0, express_1.Router)();
exports.healthRouter = router;
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        version: '0.1.0-phase0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sandbox: config_1.config.sandboxRoot,
    });
});
