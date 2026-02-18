// Authentication endpoints
import { Router } from 'express';
import { auth } from '../auth';

const router = Router();

// POST /auth/session - Create new session
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

// POST /auth/revoke - Revoke session
router.post('/revoke', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const revoked = auth.revokeSession(token);
  
  if (revoked) {
    res.json({ status: 'revoked' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

export { router as authRouter };
