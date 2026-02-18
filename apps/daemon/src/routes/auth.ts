// Authentication endpoints
import { Router } from 'express';
import { auth } from '../auth';
import { audit } from '../audit';

const router = Router();

// POST /auth/session - Create new session (PUBLIC - no auth required)
router.post('/session', (req, res) => {
  const { clientId } = req.body;

  if (!clientId || typeof clientId !== 'string') {
    res.status(400).json({ error: 'clientId required' });
    return;
  }

  const session = auth.createSession(clientId);

  // Audit: session created (redacted token)
  audit.log('system', 'system', 'AUTH_SESSION_CREATE', { clientId, tokenPrefix: session.token.slice(0, 8) + '...' }, 'daemon');

  res.json({
    token: session.token,
    expiresAt: null, // Sessions don't expire in Phase 0
  });
});

export { router as authPublicRouter };

// Protected auth routes (require valid Bearer token)
const protectedRouter = Router();

// POST /auth/revoke - Revoke session (PROTECTED - requires auth)
protectedRouter.post('/revoke', (req, res) => {
  // Token already validated by authMiddleware, get it from session
  const token = (req as any).session?.token;
  const clientId = (req as any).session?.clientId;

  if (!token) {
    res.status(401).json({ error: 'Token not found in session' });
    return;
  }

  const revoked = auth.revokeSession(token);

  if (revoked) {
    // Audit: session revoked
    audit.log('system', 'user', 'AUTH_SESSION_REVOKE', { clientId, tokenPrefix: token.slice(0, 8) + '...' }, clientId);
    res.json({ status: 'revoked' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

export { protectedRouter as authProtectedRouter };
