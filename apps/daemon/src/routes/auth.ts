// Authentication endpoints
import { Router } from 'express';
import { auth } from '../auth';

const router = Router();

// POST /auth/session - Create new session (PUBLIC - no auth required)
router.post('/session', (req, res) => {
  const { clientId } = req.body;
  
  if (!clientId || typeof clientId !== 'string') {
    res.status(400).json({ error: 'clientId required' });
    return;
  }

  const session = auth.createSession(clientId);
  
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
  
  if (!token) {
    res.status(401).json({ error: 'Token not found in session' });
    return;
  }

  const revoked = auth.revokeSession(token);
  
  if (revoked) {
    res.json({ status: 'revoked' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

export { protectedRouter as authProtectedRouter };
