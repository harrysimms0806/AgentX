import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';
import { createHash, randomBytes } from 'crypto';

/**
 * RBAC (Role-Based Access Control) System
 * 
 * Adds user/role/permission layer on top of default-deny agent policies.
 * 
 * Hierarchy:
 * - Users → Roles → Permissions → Resources
 * - Example: Harry → Admin → agents:*:execute → Codex
 * 
 * Roles:
 * - super_admin: Full system access
 * - admin: Manage agents, view audit, approve actions
 * - operator: Execute actions, view dashboard
 * - viewer: Read-only access
 * - auditor: View audit logs only
 */

export const ROLES = {
  SUPER_ADMIN: {
    id: 'super_admin',
    name: 'Super Admin',
    level: 100,
    permissions: ['*:*:*'], // All resources, all actions, all scopes
  },
  ADMIN: {
    id: 'admin',
    name: 'Admin',
    level: 80,
    permissions: [
      'agents:*:read', 'agents:*:write', 'agents:*:exec',
      'tasks:*:*',
      'approvals:*:*',
      'audit:*:read',
      'config:*:read', 'config:reload:exec',
      'users:*:read',
    ],
  },
  OPERATOR: {
    id: 'operator',
    name: 'Operator',
    level: 60,
    permissions: [
      'agents:*:read', 'agents:*:exec',
      'tasks:*:read', 'tasks:*:write',
      'approvals:propose:write', 'approvals:own:read',
      'audit:self:read',
      'config:read:read',
    ],
  },
  VIEWER: {
    id: 'viewer',
    name: 'Viewer',
    level: 40,
    permissions: [
      'agents:*:read',
      'tasks:*:read',
      'config:read:read',
    ],
  },
  AUDITOR: {
    id: 'auditor',
    name: 'Auditor',
    level: 20,
    permissions: [
      'audit:*:read',
      'agents:*:read',
    ],
  },
};

export class RBACSystem {
  constructor() {
    this.sessionTimeoutMinutes = 60;
  }

  /**
   * Create a new user
   */
  async createUser(params) {
    const { email, name, role = 'viewer', createdBy } = params;

    if (!email || !name) {
      throw new Error('Email and name are required');
    }

    // Check if email already exists
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const id = uuidv4();
    const apiKey = this._generateApiKey();
    const apiKeyHash = this._hashApiKey(apiKey);

    db.prepare(`
      INSERT INTO users (id, email, name, role, api_key_hash, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      email,
      name,
      role,
      apiKeyHash,
      createdBy || 'system',
      new Date().toISOString()
    );

    console.log(`👤 User created: ${email} with role ${role}`);

    // Return user info with API key (only shown once)
    return {
      id,
      email,
      name,
      role,
      apiKey, // Only returned on creation - store it safely!
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Authenticate user by API key
   */
  async authenticate(apiKey) {
    if (!apiKey) return null;

    const apiKeyHash = this._hashApiKey(apiKey);
    
    const user = db.prepare(`
      SELECT * FROM users 
      WHERE api_key_hash = ? AND active = 1
    `).get(apiKeyHash);

    if (!user) return null;

    // Update last login
    db.prepare(`
      UPDATE users SET last_login = ? WHERE id = ?
    `).run(new Date().toISOString(), user.id);

    return this._formatUser(user);
  }

  /**
   * Check if user has permission
   * 
   * Permission format: resource:action:scope
   * Examples:
   * - agents:codex:execute
   * - tasks:*:read (any task)
   * - audit:*:read (any audit)
   */
  hasPermission(user, requiredPermission) {
    if (!user || !user.role) return false;

    const role = ROLES[user.role.toUpperCase()];
    if (!role) return false;

    // Super admin bypass
    if (role.id === 'super_admin') return true;

    // Check each permission
    for (const permission of role.permissions) {
      if (this._matchPermission(permission, requiredPermission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match permission patterns
   */
  _matchPermission(granted, required) {
    const grantedParts = granted.split(':');
    const requiredParts = required.split(':');

    if (grantedParts.length !== 3 || requiredParts.length !== 3) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      // * is wildcard
      if (grantedParts[i] === '*') continue;
      
      // Exact match required
      if (grantedParts[i] !== requiredParts[i]) {
        return false;
      }
    }

    return true;
  }
  /**
   * Get user's permissions
   */
  getUserPermissions(user) {
    if (!user || !user.role) return [];

    const role = ROLES[user.role.toUpperCase()];
    if (!role) return [];

    return role.permissions;
  }

  /**
   * Update user role
   */
  async updateRole(userId, newRole, updatedBy) {
    if (!ROLES[newRole.toUpperCase()]) {
      throw new Error(`Invalid role: ${newRole}`);
    }

    const user = this._getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent removing last super admin
    if (user.role === 'super_admin' && newRole !== 'super_admin') {
      const superAdminCount = db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND active = 1
      `).get().count;
      
      if (superAdminCount <= 1) {
        throw new Error('Cannot remove last super admin');
      }
    }

    db.prepare(`
      UPDATE users SET role = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(
      newRole,
      new Date().toISOString(),
      updatedBy,
      userId
    );

    console.log(`🔄 Role updated: ${user.email} → ${newRole}`);

    return this._getUserById(userId);
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId, deactivatedBy) {
    const user = this._getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent deactivating last super admin
    if (user.role === 'super_admin') {
      const superAdminCount = db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND active = 1
      `).get().count;
      
      if (superAdminCount <= 1) {
        throw new Error('Cannot deactivate last super admin');
      }
    }

    db.prepare(`
      UPDATE users SET active = 0, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      deactivatedBy,
      userId
    );

    console.log(`🚫 User deactivated: ${user.email}`);
  }

  /**
   * Regenerate API key
   */
  async regenerateApiKey(userId) {
    const user = this._getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const newApiKey = this._generateApiKey();
    const newApiKeyHash = this._hashApiKey(newApiKey);

    db.prepare(`
      UPDATE users SET api_key_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newApiKeyHash,
      new Date().toISOString(),
      userId
    );

    console.log(`🔑 API key regenerated for: ${user.email}`);

    return { apiKey: newApiKey };
  }

  /**
   * List users with filters
   */
  listUsers(filters = {}) {
    const { role, active = true, limit = 50, offset = 0 } = filters;

    let query = 'SELECT * FROM users WHERE active = ?';
    const params = [active ? 1 : 0];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);
    return rows.map(row => this._formatUser(row));
  }

  /**
   * Get user by ID
   */
  _getUserById(id) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this._formatUser(row) : null;
  }

  /**
   * Format user object (exclude sensitive fields)
   */
  _formatUser(row) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      active: row.active === 1,
      createdAt: row.created_at,
      lastLogin: row.last_login,
      permissions: this.getUserPermissions({ role: row.role }),
    };
  }

  /**
   * Generate secure API key
   */
  _generateApiKey() {
    return `ax_${randomBytes(32).toString('hex')}`;
  }

  /**
   * Hash API key for storage
   */
  _hashApiKey(apiKey) {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Check if user can approve/deny approvals
   */
  canApprove(user, approval) {
    if (!user) return false;

    // Own approvals (can withdraw)
    if (approval.requestedBy === user.id) return true;

    // Role-based approval permissions
    return this.hasPermission(user, 'approvals:any:approve');
  }

  /**
   * Get accessible agents for user
   */
  getAccessibleAgents(user, agents) {
    if (!user) return [];

    // Super admin sees all
    if (user.role === 'super_admin') return agents;

    // Filter by permissions
    return agents.filter(agent => {
      return this.hasPermission(user, `agents:${agent.id}:read`);
    });
  }

  /**
   * Log access attempt
   */
  logAccess(userId, resource, action, result, ip) {
    db.prepare(`
      INSERT INTO access_logs (user_id, resource, action, result, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      resource,
      action,
      result ? 'success' : 'denied',
      ip || null,
      new Date().toISOString()
    );
  }
}

// Create RBAC tables
export function initRBACTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'viewer',
      api_key_hash TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      updated_by TEXT,
      last_login DATETIME
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp)`);

  console.log('✅ RBAC tables initialized');

  // Create default super admin if none exists
  createDefaultSuperAdmin();
}

/**
 * Create default super admin on first run
 */
function createDefaultSuperAdmin() {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  
  if (count === 0) {
    console.log('🆕 Creating default super admin user...');
    
    const apiKey = `ax_${randomBytes(32).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    db.prepare(`
      INSERT INTO users (id, email, name, role, api_key_hash, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      'admin@agentx.local',
      'System Administrator',
      'super_admin',
      apiKeyHash,
      'system'
    );

    console.log('========================================');
    console.log('🚨 DEFAULT SUPER ADMIN CREATED');
    console.log('========================================');
    console.log('Email: admin@agentx.local');
    console.log(`API Key: ${apiKey}`);
    console.log('');
    console.log('⚠️  SAVE THIS API KEY - IT WILL NOT BE SHOWN AGAIN');
    console.log('========================================');
  }
}

export const rbac = new RBACSystem();
