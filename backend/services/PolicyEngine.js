import { configBridge } from './ConfigBridge.js';

/**
 * Policy Engine
 * 
 * Enforces one-way access control for all actions.
 * Backend is the single enforcement point.
 */

// Policy check result types
export const POLICY_RESULT = {
  ALLOW: 'allow',
  DENY: 'deny',
  REQUIRES_APPROVAL: 'requires_approval',
};

// Policy reason codes
export const POLICY_REASON = {
  ALLOWED: 'POLICY_ALLOW',
  DENY_DEFAULT: 'POLICY_DENY_DEFAULT',
  DENY_EXPLICIT: 'POLICY_DENY_EXPLICIT',
  DENY_SCOPE: 'POLICY_DENY_SCOPE',
  DENY_BUDGET: 'POLICY_DENY_BUDGET',
  DENY_AGENT_OFFLINE: 'POLICY_DENY_AGENT_OFFLINE',
  DENY_INTEGRATION_DISABLED: 'POLICY_DENY_INTEGRATION_DISABLED',
  REQUIRES_APPROVAL: 'POLICY_REQUIRES_APPROVAL',
};

export class PolicyEngine {
  constructor() {
    this.auditCallback = null;
  }

  /**
   * Set audit callback for logging
   */
  setAuditCallback(callback) {
    this.auditCallback = callback;
  }

  /**
   * Check if an action is permitted
   * 
   * @param {Object} params
   * @param {string} params.agentId - Agent attempting the action
   * @param {string} params.integration - Target integration/tool
   * @param {string} params.actionType - read/write/exec/admin
   * @param {Object} params.context - Additional context (folder, repo, etc.)
   * @returns {Object} { allowed: boolean, result: string, reason: string, requiresApproval: boolean }
   */
  check(params) {
    const { agentId, integration, actionType, context = {} } = params;
    const config = configBridge.getConfig();

    if (!config) {
      return this._deny(POLICY_REASON.DENY_DEFAULT, 'Config not loaded');
    }

    // Get agent
    const agent = configBridge.getAgent(agentId);
    if (!agent) {
      return this._deny(POLICY_REASON.DENY_DEFAULT, `Agent ${agentId} not found`);
    }

    // Check if agent is online
    if (agent.status === 'offline') {
      return this._deny(POLICY_REASON.DENY_AGENT_OFFLINE, 'Agent is offline');
    }

    // Get integration
    const integ = configBridge.getIntegration(integration);
    if (!integ) {
      return this._deny(POLICY_REASON.DENY_DEFAULT, `Integration ${integration} not found`);
    }

    // Check if integration is enabled
    if (!integ.enabled) {
      return this._deny(POLICY_REASON.DENY_INTEGRATION_DISABLED, 'Integration is disabled');
    }

    // Check global default deny
    if (config.globalPolicy?.defaultDeny) {
      // Must be explicitly allowed
      const isAllowed = this._isActionAllowed(agent.policy, actionType);
      if (!isAllowed) {
        return this._deny(POLICY_REASON.DENY_DEFAULT, 'Default deny: action not explicitly allowed');
      }
    }

    // Check explicit deny
    if (agent.policy.deny.includes(actionType)) {
      return this._deny(POLICY_REASON.DENY_EXPLICIT, 'Action explicitly denied');
    }

    // Check scope restrictions
    if (context.folder || context.repo) {
      const scopeCheck = this._checkScope(agent.policy.scopes, context);
      if (!scopeCheck.allowed) {
        return this._deny(POLICY_REASON.DENY_SCOPE, scopeCheck.reason);
      }
    }

    // Check budget/concurrency
    if (actionType !== 'read') {
      const budgetCheck = this._checkBudget(agent.policy.budgets, agentId);
      if (!budgetCheck.allowed) {
        return this._deny(POLICY_REASON.DENY_BUDGET, budgetCheck.reason);
      }
    }

    // Check if approval required
    const requiresApproval = this._requiresApproval(agent.policy, actionType, config.globalPolicy);
    if (requiresApproval) {
      return this._requiresApproval();
    }

    // All checks passed
    return this._allow();
  }

  /**
   * Quick check for read permissions (used for UI display)
   */
  canRead(agentId, integration) {
    const result = this.check({
      agentId,
      integration,
      actionType: 'read',
    });
    return result.allowed;
  }

  /**
   * Quick check for write permissions
   */
  canWrite(agentId, integration, context = {}) {
    const result = this.check({
      agentId,
      integration,
      actionType: 'write',
      context,
    });
    return result.allowed;
  }

  /**
   * Quick check for exec permissions
   */
  canExecute(agentId, integration, context = {}) {
    const result = this.check({
      agentId,
      integration,
      actionType: 'exec',
      context,
    });
    return {
      allowed: result.allowed,
      requiresApproval: result.requiresApproval,
      reason: result.reason,
    };
  }

  /**
   * Check if action is in allowed list
   */
  _isActionAllowed(policy, actionType) {
    return policy.allow.includes(actionType);
  }

  /**
   * Check scope restrictions
   */
  _checkScope(scopes, context) {
    // If no scopes defined, allow all
    if (!scopes.folders?.length && !scopes.repos?.length) {
      return { allowed: true };
    }

    // Check folder scope
    if (context.folder && scopes.folders?.length > 0) {
      const allowed = scopes.folders.some(folder => 
        context.folder.startsWith(folder) || folder.startsWith(context.folder)
      );
      if (!allowed) {
        return { 
          allowed: false, 
          reason: `Folder ${context.folder} not in allowed scopes: ${scopes.folders.join(', ')}` 
        };
      }
    }

    // Check repo scope
    if (context.repo && scopes.repos?.length > 0) {
      const allowed = scopes.repos.includes(context.repo);
      if (!allowed) {
        return { 
          allowed: false, 
          reason: `Repo ${context.repo} not in allowed scopes: ${scopes.repos.join(', ')}` 
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check budget constraints
   */
  _checkBudget(budgets, agentId) {
    // This would integrate with actual tracking
    // For now, just check max concurrent
    if (budgets.maxConcurrent) {
      // Would check current running tasks
      // Simplified: assume we have capacity
    }

    return { allowed: true };
  }

  /**
   * Check if action requires approval
   */
  _requiresApproval(policy, actionType, globalPolicy) {
    // Check agent-specific approval requirements
    if (policy.requiresApproval?.includes(actionType)) {
      return true;
    }

    // Check global approval requirements
    if (globalPolicy?.requireApprovalFor?.includes(actionType)) {
      return true;
    }

    return false;
  }

  /**
   * Build allow response
   */
  _allow() {
    return {
      allowed: true,
      result: POLICY_RESULT.ALLOW,
      reason: POLICY_REASON.ALLOWED,
      requiresApproval: false,
    };
  }

  /**
   * Build deny response
   */
  _deny(reasonCode, message) {
    return {
      allowed: false,
      result: POLICY_RESULT.DENY,
      reason: reasonCode,
      message,
      requiresApproval: false,
    };
  }

  /**
   * Build requires approval response
   */
  _requiresApproval() {
    return {
      allowed: false,
      result: POLICY_RESULT.REQUIRES_APPROVAL,
      reason: POLICY_REASON.REQUIRES_APPROVAL,
      requiresApproval: true,
      message: 'Action requires approval before execution',
    };
  }

  /**
   * Get agent capabilities for UI display
   */
  getAgentCapabilities(agentId) {
    const agent = configBridge.getAgent(agentId);
    if (!agent) return null;

    const config = configBridge.getConfig();
    
    return {
      id: agent.id,
      name: agent.name,
      permissions: {
        read: this._isActionAllowed(agent.policy, 'read'),
        write: this._isActionAllowed(agent.policy, 'write'),
        exec: this._isActionAllowed(agent.policy, 'exec'),
        admin: this._isActionAllowed(agent.policy, 'admin'),
      },
      requiresApprovalFor: [
        ...(agent.policy.requiresApproval || []),
        ...(config.globalPolicy?.requireApprovalFor || []),
      ],
      scopes: agent.policy.scopes,
      budgets: agent.policy.budgets,
    };
  }

  /**
   * Validate action before execution (comprehensive check)
   */
  validateAction(request) {
    const { agentId, integration, actionType, payload, context } = request;

    // Run policy check
    const policyResult = this.check({
      agentId,
      integration,
      actionType,
      context,
    });

    // Build validation result
    const validation = {
      valid: policyResult.allowed || policyResult.requiresApproval,
      policy: policyResult,
      constraints: {
        maxPayloadSize: 10 * 1024 * 1024, // 10MB
        allowedIntegrations: configBridge.getConfig()?.integrations.map(i => i.id) || [],
      },
    };

    // Check payload size
    if (payload) {
      const payloadSize = JSON.stringify(payload).length;
      if (payloadSize > validation.constraints.maxPayloadSize) {
        validation.valid = false;
        validation.error = {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Payload size ${payloadSize} exceeds max ${validation.constraints.maxPayloadSize}`,
        };
      }
    }

    return validation;
  }
}

// Singleton instance
export const policyEngine = new PolicyEngine();
