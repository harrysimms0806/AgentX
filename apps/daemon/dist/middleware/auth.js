"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const auth_1 = require("../auth");
function authMiddleware(req, res, next) {
    // Allow health checks without auth
    if (req.path === '/health') {
        next();
        return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: 'Authorization header required' });
        return;
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
        return;
    }
    const token = parts[1];
    const session = auth_1.auth.validateToken(token);
    if (!session) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    // Attach session to request for downstream use
    req.session = session;
    next();
}
