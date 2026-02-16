import db from '../models/database.js';

/**
 * Authentication Middleware
 * 
 * Simple token-based auth for now.
 * In production, this would integrate with proper auth system.
 */

// Simple in-memory token store (replace with proper auth in production)
const tokens = new Map();

export function generateToken(userId, role = 'user') {
  const token = Math.random().toString(36).substring(2);
  tokens.set(token, { userId, role, createdAt: Date.now() });
  return token;
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // For development, allow unauthenticated requests
    if (process.env.NODE_ENV === 'development') {
      req.user = { id: 'dev-user', role: 'admin' };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Access token required',
      },
    });
  }

  const user = tokens.get(token);
  
  if (!user) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid or expired token',
      },
    });
  }

  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }

  next();
}

export function requireApprovalPermission(req, res, next) {
  // Any authenticated user can approve/deny
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  next();
}
