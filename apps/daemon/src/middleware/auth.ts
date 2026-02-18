// Authentication middleware
import { Request, Response, NextFunction } from 'express';
import { auth } from '../auth';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
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
  const session = auth.validateToken(token);

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Attach session to request for downstream use
  (req as any).session = session;
  next();
}
