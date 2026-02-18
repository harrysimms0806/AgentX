"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authProtectedRouter = exports.authPublicRouter = void 0;
// Authentication endpoints
const express_1 = require("express");
const auth_1 = require("../auth");
const router = (0, express_1.Router)();
exports.authPublicRouter = router;
// POST /auth/session - Create new session (PUBLIC - no auth required)
router.post('/session', (req, res) => {
    const { clientId } = req.body;
    if (!clientId || typeof clientId !== 'string') {
        res.status(400).json({ error: 'clientId required' });
        return;
    }
    const session = auth_1.auth.createSession(clientId);
    res.json({
        token: session.token,
        expiresAt: null, // Sessions don't expire in Phase 0
    });
});
// Protected auth routes (require valid Bearer token)
const protectedRouter = (0, express_1.Router)();
exports.authProtectedRouter = protectedRouter;
// POST /auth/revoke - Revoke session (PROTECTED - requires auth)
protectedRouter.post('/revoke', (req, res) => {
    // Token already validated by authMiddleware, get it from session
    const token = req.session?.token;
    if (!token) {
        res.status(401).json({ error: 'Token not found in session' });
        return;
    }
    const revoked = auth_1.auth.revokeSession(token);
    if (revoked) {
        res.json({ status: 'revoked' });
    }
    else {
        res.status(404).json({ error: 'Session not found' });
    }
});
