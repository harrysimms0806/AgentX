import { Router } from 'express';
import { rbac, ROLES } from '../services/RBACSystem.js';
import { requireAdmin, authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * GET /rbac/roles
 * List all available roles
 */
router.get('/roles', (req, res) => {
  const roles = Object.values(ROLES).map(role => ({
    id: role.id,
    name: role.name,
    level: role.level,
    permissions: role.permissions,
  }));

  res.json({
    success: true,
    data: roles,
  });
});

/**
 * GET /rbac/users
 * List users (admin only)
 */
router.get('/users', requireAdmin, (req, res) => {
  try {
    const { role, active, limit, offset } = req.query;

    const users = rbac.listUsers({
      role,
      active: active !== 'false',
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });

    res.json({
      success: true,
      data: users,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'LIST_FAILED', message: error.message },
    });
  }
});

/**
 * POST /rbac/users
 * Create new user (admin only)
 */
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { email, name, role = 'viewer' } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Email and name are required' },
      });
    }

    if (!ROLES[role.toUpperCase()]) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROLE', message: `Invalid role: ${role}` },
      });
    }

    const user = await rbac.createUser({
      email,
      name,
      role,
      createdBy: req.user?.id || 'system',
    });

    res.status(201).json({
      success: true,
      data: user,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: error.message },
    });
  }
});

/**
 * PATCH /rbac/users/:id/role
 * Update user role (admin only)
 */
router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !ROLES[role.toUpperCase()]) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROLE', message: 'Valid role is required' },
      });
    }

    const user = await rbac.updateRole(
      req.params.id,
      role,
      req.user?.id
    );

    res.json({
      success: true,
      data: user,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: error.message },
    });
  }
});

/**
 * POST /rbac/users/:id/deactivate
 * Deactivate user (admin only)
 */
router.post('/users/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    await rbac.deactivateUser(req.params.id, req.user?.id);

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'DEACTIVATE_FAILED', message: error.message },
    });
  }
});

/**
 * POST /rbac/users/:id/regenerate-key
 * Regenerate API key (admin or self)
 */
router.post('/users/:id/regenerate-key', async (req, res) => {
  try {
    // Check if user is admin or owns this account
    if (req.user?.role !== 'super_admin' && req.user?.id !== req.params.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Can only regenerate own key' },
      });
    }

    const result = await rbac.regenerateApiKey(req.params.id);

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: { code: 'REGENERATE_FAILED', message: error.message },
    });
  }
});

/**
 * GET /rbac/permissions
 * Get current user's permissions
 */
router.get('/permissions', authenticateToken, (req, res) => {
  const permissions = rbac.getUserPermissions(req.user);

  res.json({
    success: true,
    data: {
      user: req.user,
      permissions,
    },
  });
});

/**
 * POST /rbac/check
 * Check if current user has specific permission
 */
router.post('/check', authenticateToken, (req, res) => {
  const { permission } = req.body;

  if (!permission) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PERMISSION', message: 'Permission is required' },
    });
  }

  const hasPermission = rbac.hasPermission(req.user, permission);

  res.json({
    success: true,
    data: {
      permission,
      granted: hasPermission,
    },
  });
});

export default router;
