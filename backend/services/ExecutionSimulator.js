import { configBridge } from './ConfigBridge.js';
import { riskEngine } from './RiskScoringEngine.js';
import db from '../models/database.js';

/**
 * Execution Simulator
 * 
 * Simulates agent actions before execution to show:
 * - Files that will be changed
 * - Estimated cost
 * - Side effects
 * - Risk factors
 * 
 * This enables "preview before approve" - users see impact before approving.
 */

export class ExecutionSimulator {
  constructor() {
    this.costRates = {
      'gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
      'gpt-3.5': { input: 0.0015, output: 0.002 },
      'local': { input: 0, output: 0 }, // Free (local compute)
    };
  }

  /**
   * Simulate an action before execution
   * 
   * @param {Object} params
   * @param {string} params.agentId
   * @param {string} params.actionType
   * @param {string} params.integration
   * @param {Object} params.context
   * @param {Object} params.payload
   * @returns {Object} Simulation result
   */
  async simulate(params) {
    const { agentId, actionType, integration, context = {}, payload = {} } = params;

    const agent = configBridge.getAgent(agentId);
    if (!agent) {
      return { error: 'Agent not found' };
    }

    // Run multiple simulations in parallel
    const [
      riskAssessment,
      fileImpact,
      costEstimate,
      sideEffects,
      policyCheck,
    ] = await Promise.all([
      this._simulateRisk(agentId, actionType, integration, context),
      this._simulateFileImpact(agent, actionType, context, payload),
      this._simulateCost(agent, payload),
      this._simulateSideEffects(agent, actionType, integration, context),
      this._simulatePolicyCheck(agentId, actionType, integration, context),
    ]);

    // Build comprehensive simulation report
    const simulation = {
      summary: {
        action: `${actionType} via ${integration}`,
        agent: agent.displayName || agent.name,
        riskLevel: riskAssessment.level,
        riskScore: riskAssessment.score,
        estimatedCost: costEstimate.total,
        estimatedTime: this._estimateTime(agent, actionType),
        filesAffected: fileImpact.count,
      },
      risk: riskAssessment,
      files: fileImpact,
      cost: costEstimate,
      sideEffects,
      policy: policyCheck,
      recommendations: this._generateRecommendations(riskAssessment, fileImpact, costEstimate),
      timestamp: new Date().toISOString(),
    };

    // Store simulation for reference
    this._storeSimulation(simulation, params);

    return simulation;
  }

  /**
   * Simulate risk assessment
   */
  async _simulateRisk(agentId, actionType, integration, context) {
    return await riskEngine.calculateRisk({
      agentId,
      actionType,
      integration,
      context,
    });
  }

  /**
   * Simulate file impact analysis
   */
  async _simulateFileImpact(agent, actionType, context, payload) {
    const { files = [], folder } = context;
    
    // Analyze files that will be affected
    const fileAnalysis = files.map(file => {
      const path = file.path || file;
      const isNew = file.isNew || false;
      const isDeleted = file.isDeleted || false;
      
      // Determine change type
      let changeType = 'modified';
      if (isNew) changeType = 'created';
      if (isDeleted) changeType = 'deleted';
      
      // Estimate lines changed
      const estimatedLines = file.lines || this._estimateLinesChanged(path, actionType);
      
      // Check if critical file
      const isCritical = this._isCriticalFile(path);
      
      return {
        path,
        changeType,
        estimatedLines,
        isCritical,
        warnings: isCritical ? ['This is a critical system file'] : [],
      };
    });

    // If no specific files, infer from folder + action
    if (fileAnalysis.length === 0 && folder) {
      fileAnalysis.push({
        path: `${folder}/**/*`,
        changeType: actionType === 'write' ? 'may_modify' : 'may_read',
        estimatedLines: 'unknown',
        isCritical: this._isSensitivePath(folder),
        warnings: this._isSensitivePath(folder) ? ['Sensitive directory'] : [],
      });
    }

    return {
      count: fileAnalysis.length,
      created: fileAnalysis.filter(f => f.changeType === 'created').length,
      modified: fileAnalysis.filter(f => f.changeType === 'modified' || f.changeType === 'may_modify').length,
      deleted: fileAnalysis.filter(f => f.changeType === 'deleted').length,
      critical: fileAnalysis.filter(f => f.isCritical).length,
      files: fileAnalysis,
    };
  }

  /**
   * Simulate cost estimation
   */
  async _simulateCost(agent, payload) {
    const model = agent.model || 'gpt-3.5';
    
    // Estimate token usage
    const estimatedInputTokens = this._estimateTokens(payload);
    const estimatedOutputTokens = Math.floor(estimatedInputTokens * 0.5); // Rough estimate
    
    // Get cost rates
    const rates = this._getCostRates(model);
    
    const inputCost = (estimatedInputTokens / 1000) * rates.input;
    const outputCost = (estimatedOutputTokens / 1000) * rates.output;
    const total = inputCost + outputCost;

    return {
      model,
      estimatedInputTokens,
      estimatedOutputTokens,
      rates,
      breakdown: {
        input: inputCost,
        output: outputCost,
      },
      total: Math.round(total * 1000) / 1000, // Round to 3 decimal places
      currency: 'USD',
    };
  }

  /**
   * Simulate side effects
   */
  async _simulateSideEffects(agent, actionType, integration, context) {
    const effects = [];

    // Git side effects
    if (integration === 'git' || context.repo) {
      effects.push({
        type: 'git',
        description: 'Will create new commit',
        details: 'Commit will be created but not pushed',
      });
      
      if (actionType === 'write') {
        effects.push({
          type: 'git',
          description: 'May cause merge conflicts',
          severity: 'warning',
        });
      }
    }

    // Database side effects
    if (integration === 'database' || context.database) {
      effects.push({
        type: 'database',
        description: 'Database will be modified',
        severity: 'high',
        details: 'Ensure backup exists before proceeding',
      });
    }

    // API side effects
    if (integration === 'api' || context.api) {
      effects.push({
        type: 'api',
        description: 'External API calls will be made',
        details: `Rate limits may apply for ${context.api || 'target API'}`,
      });
    }

    // Notification side effects
    if (actionType === 'admin') {
      effects.push({
        type: 'notification',
        description: 'Team members may be notified',
        details: 'Admin actions trigger audit notifications',
      });
    }

    // File system side effects
    if (integration === 'filesystem' && actionType === 'write') {
      effects.push({
        type: 'filesystem',
        description: 'File changes are irreversible',
        severity: 'info',
        details: 'Use git to track changes for rollback',
      });
    }

    return {
      count: effects.length,
      high: effects.filter(e => e.severity === 'high').length,
      warning: effects.filter(e => e.severity === 'warning').length,
      info: effects.filter(e => !e.severity || e.severity === 'info').length,
      effects,
    };
  }

  /**
   * Simulate policy check
   */
  async _simulatePolicyCheck(agentId, actionType, integration, context) {
    const { policyEngine } = await import('./PolicyEngine.js');
    
    const check = policyEngine.check({
      agentId,
      actionType,
      integration,
      context,
    });

    return {
      allowed: check.allowed,
      requiresApproval: check.requiresApproval,
      reason: check.reason,
      canAutoApprove: check.allowed && !check.requiresApproval,
    };
  }

  /**
   * Generate recommendations based on simulation
   */
  _generateRecommendations(risk, files, cost) {
    const recommendations = [];

    // Risk-based recommendations
    if (risk.level === 'CRITICAL' || risk.level === 'HIGH') {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: `High risk action (${risk.level}) - careful review recommended`,
        explanation: risk.explanation.join(', '),
      });
    }

    // File-based recommendations
    if (files.critical > 0) {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: `${files.critical} critical files will be affected`,
        explanation: 'Critical system files are being modified',
      });
    }

    // Cost-based recommendations
    if (cost.total > 1.0) {
      recommendations.push({
        type: 'info',
        priority: 'medium',
        message: `Estimated cost $${cost.total} - consider using local agent for cheaper execution`,
        explanation: 'Local agents run at zero API cost',
      });
    }

    // Safety recommendations
    if (files.count > 10) {
      recommendations.push({
        type: 'info',
        priority: 'low',
        message: `Many files (${files.count}) will be changed - consider breaking into smaller tasks`,
      });
    }

    return recommendations;
  }

  /**
   * Estimate tokens from payload
   */
  _estimateTokens(payload) {
    if (!payload) return 500;
    
    const str = JSON.stringify(payload);
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(str.length / 4);
  }

  /**
   * Get cost rates for model
   */
  _getCostRates(model) {
    if (model.includes('gpt-4')) return this.costRates['gpt-4'];
    if (model.includes('gpt-3.5')) return this.costRates['gpt-3.5'];
    return this.costRates['local'];
  }

  /**
   * Estimate time for action
   */
  _estimateTime(agent, actionType) {
    const baseTimes = {
      read: 5,
      write: 30,
      exec: 60,
      admin: 45,
    };

    let time = baseTimes[actionType] || 30;

    // Cloud agents take longer (API latency)
    if (agent.type === 'cloud') time *= 1.5;
    
    // Local agents are faster
    if (agent.type === 'local') time *= 0.5;

    return `${Math.round(time)}s`;
  }

  /**
   * Estimate lines changed
   */
  _estimateLinesChanged(path, actionType) {
    if (actionType === 'write') return '10-50';
    if (actionType === 'exec') return 'N/A';
    return '0';
  }

  /**
   * Check if file is critical
   */
  _isCriticalFile(path) {
    const criticalPatterns = [
      /package\.json$/,
      /requirements\.txt$/,
      /Dockerfile$/,
      /\.env/,
      /config\./,
      /database\./,
      /migration/,
      /schema\./,
      /\.gitignore$/,
      /\.github\/workflows/,
    ];

    return criticalPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Check if path is sensitive
   */
  _isSensitivePath(path) {
    const sensitive = ['config', 'secrets', 'auth', 'database', 'db', 'security'];
    return sensitive.some(s => path.toLowerCase().includes(s));
  }

  /**
   * Store simulation for audit
   */
  _storeSimulation(simulation, params) {
    try {
      db.prepare(`
        INSERT INTO simulations (
          agent_id, action_type, integration, context, result, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        params.agentId,
        params.actionType,
        params.integration,
        JSON.stringify(params.context),
        JSON.stringify({
          riskLevel: simulation.summary.riskLevel,
          riskScore: simulation.summary.riskScore,
          estimatedCost: simulation.summary.estimatedCost,
          filesAffected: simulation.summary.filesAffected,
        }),
        new Date().toISOString()
      );
    } catch (error) {
      console.error('Failed to store simulation:', error);
    }
  }

  /**
   * Compare multiple simulation scenarios
   */
  compareScenarios(scenarios) {
    return scenarios.map((scenario, index) => ({
      index,
      ...scenario.summary,
      riskFactors: scenario.risk.factors,
      tradeoffs: this._analyzeTradeoffs(scenario),
    }));
  }

  /**
   * Analyze tradeoffs for a scenario
   */
  _analyzeTradeoffs(simulation) {
    const tradeoffs = [];

    if (simulation.summary.riskScore > 50 && simulation.summary.estimatedCost < 0.1) {
      tradeoffs.push({
        type: 'risk_vs_cost',
        message: 'High risk but low cost - consider breaking into smaller tasks',
      });
    }

    if (simulation.files.critical > 0 && simulation.policy.canAutoApprove) {
      tradeoffs.push({
        type: 'critical_auto_approve',
        message: 'Critical files but auto-approve allowed - policy may need review',
      });
    }

    return tradeoffs;
  }
}

// Create simulations table
export function initSimulationTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS simulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      integration TEXT NOT NULL,
      context TEXT,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sim_agent ON simulations(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sim_created ON simulations(created_at)`);

  console.log('✅ Simulation tables initialized');
}

export const executionSimulator = new ExecutionSimulator();
