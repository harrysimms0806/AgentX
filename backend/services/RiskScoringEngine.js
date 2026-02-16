import { configBridge } from './ConfigBridge.js';
import db from '../models/database.js';

/**
 * Risk Scoring Engine
 * 
 * Automatically calculates risk level for agent actions.
 * Enables intelligent approvals: auto-approve low risk, escalate high risk.
 * 
 * Risk factors:
 * - Action type (read < write < exec < admin)
 * - Scope (production vs dev)
 * - Agent history (error rate, cost)
 * - Time of day (business hours vs night)
 * - File sensitivity (config vs documentation)
 * - Agent capability (local vs cloud)
 */

export const RISK_LEVELS = {
  NONE: { name: 'none', score: 0, autoApprove: true },
  LOW: { name: 'low', score: 25, autoApprove: true },
  MEDIUM: { name: 'medium', score: 50, autoApprove: false },
  HIGH: { name: 'high', score: 75, autoApprove: false },
  CRITICAL: { name: 'critical', score: 100, autoApprove: false },
};

export class RiskScoringEngine {
  constructor() {
    this.weights = {
      actionType: 0.25,
      scope: 0.20,
      agentHistory: 0.20,
      timeOfDay: 0.15,
      fileSensitivity: 0.10,
      agentCapability: 0.10,
    };
  }

  /**
   * Calculate risk score for an action
   * 
   * @param {Object} params
   * @param {string} params.agentId
   * @param {string} params.actionType - read/write/exec/admin
   * @param {string} params.integration
   * @param {Object} params.context - folder, repo, files, etc.
   * @returns {Object} Risk assessment
   */
  async calculateRisk(params) {
    const { agentId, actionType, integration, context = {} } = params;

    const agent = configBridge.getAgent(agentId);
    if (!agent) {
      return this._createRiskResult('CRITICAL', 100, ['Agent not found'], {});
    }

    // Calculate individual risk factors
    const factors = {
      actionType: this._scoreActionType(actionType),
      scope: this._scoreScope(context),
      agentHistory: await this._scoreAgentHistory(agentId),
      timeOfDay: this._scoreTimeOfDay(),
      fileSensitivity: this._scoreFileSensitivity(context),
      agentCapability: this._scoreAgentCapability(agent),
    };

    // Calculate weighted total score
    let totalScore = 0;
    for (const [factor, score] of Object.entries(factors)) {
      totalScore += score * this.weights[factor];
    }

    // Determine risk level
    const level = this._getRiskLevel(totalScore);

    // Build explanation
    const explanation = this._buildExplanation(factors, totalScore);

    // Determine recommendation
    const recommendation = this._getRecommendation(level, agent, actionType);

    return this._createRiskResult(level, totalScore, explanation, factors, recommendation);
  }

  /**
   * Score based on action type
   */
  _scoreActionType(actionType) {
    const scores = {
      read: 10,
      write: 40,
      exec: 70,
      admin: 95,
    };
    return scores[actionType] || 50;
  }

  /**
   * Score based on scope (production vs dev)
   */
  _scoreScope(context) {
    const { folder, repo } = context;
    let score = 30; // Default: medium

    // Production indicators
    const prodIndicators = [
      'production', 'prod', 'main', 'master',
      'live', 'deploy', 'release'
    ];

    // Dev indicators  
    const devIndicators = [
      'development', 'dev', 'test', 'staging',
      'experiment', 'draft', 'wip'
    ];

    const path = `${folder || ''} ${repo || ''}`.toLowerCase();

    if (prodIndicators.some(ind => path.includes(ind))) {
      score = 70; // Higher risk for production
    } else if (devIndicators.some(ind => path.includes(ind))) {
      score = 15; // Lower risk for dev
    }

    // Check for sensitive paths
    const sensitivePaths = [
      '.env', 'config', 'secrets', 'keys',
      'database', 'db', 'auth', 'security'
    ];

    if (sensitivePaths.some(sp => path.includes(sp))) {
      score += 20;
    }

    return Math.min(score, 100);
  }

  /**
   * Score based on agent's historical performance
   */
  async _scoreAgentHistory(agentId) {
    try {
      // Get agent's recent execution history
      const recentExecutions = db.prepare(`
        SELECT status, error, started_at, completed_at
        FROM agent_executions
        WHERE agent_id = ?
        AND started_at > datetime('now', '-7 days')
        ORDER BY started_at DESC
        LIMIT 50
      `).all(agentId);

      if (recentExecutions.length === 0) {
        return 50; // Unknown agent - medium risk
      }

      const total = recentExecutions.length;
      const errors = recentExecutions.filter(e => e.error).length;
      const errorRate = errors / total;

      // Calculate score based on error rate
      let score = 30; // Base score

      if (errorRate > 0.2) {
        score += 40; // High error rate
      } else if (errorRate > 0.1) {
        score += 20; // Medium error rate
      } else if (errorRate > 0.05) {
        score += 10; // Low error rate
      }

      // Check for recent failures
      const recentFailures = recentExecutions
        .slice(0, 5)
        .filter(e => e.error).length;

      if (recentFailures >= 3) {
        score += 25; // Recent pattern of failures
      }

      return Math.min(score, 100);

    } catch (error) {
      console.error('Error calculating agent history score:', error);
      return 50; // Default on error
    }
  }

  /**
   * Score based on time of day
   */
  _scoreTimeOfDay() {
    const hour = new Date().getHours();
    const day = new Date().getDay(); // 0 = Sunday

    // Business hours (9am-6pm, Mon-Fri) = lower risk
    const isBusinessHours = (
      hour >= 9 && hour < 18 &&
      day >= 1 && day <= 5
    );

    if (isBusinessHours) {
      return 20;
    }

    // Night time (11pm-6am) = higher risk
    if (hour >= 23 || hour < 6) {
      return 60;
    }

    // Evening/weekend = medium risk
    return 40;
  }

  /**
   * Score based on file sensitivity
   */
  _scoreFileSensitivity(context) {
    const { files = [] } = context;
    
    if (files.length === 0) {
      return 30;
    }

    const sensitivePatterns = [
      /\.env/i,
      /config\./i,
      /secret/i,
      /password/i,
      /key/i,
      /token/i,
      /\.git/i,
      /database/i,
      /schema/i,
      /migration/i,
    ];

    let maxSensitivity = 0;

    for (const file of files) {
      const sensitivity = sensitivePatterns.reduce((score, pattern) => {
        return score + (pattern.test(file) ? 20 : 0);
      }, 0);
      
      maxSensitivity = Math.max(maxSensitivity, sensitivity);
    }

    return Math.min(maxSensitivity, 100);
  }

  /**
   * Score based on agent capability
   */
  _scoreAgentCapability(agent) {
    // Local agents = lower risk (no external API calls)
    if (agent.type === 'local') {
      return 20;
    }

    // Cloud agents with powerful models = higher risk
    if (agent.model?.includes('gpt-4') || agent.model?.includes('claude')) {
      return 50;
    }

    // Standard cloud agents = medium risk
    return 35;
  }

  /**
   * Get risk level from score
   */
  _getRiskLevel(score) {
    if (score < 15) return 'NONE';
    if (score < 35) return 'LOW';
    if (score < 60) return 'MEDIUM';
    if (score < 85) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * Build human-readable explanation
   */
  _buildExplanation(factors, totalScore) {
    const explanations = [];

    if (factors.actionType >= 70) {
      explanations.push(`High-risk action type (${factors.actionType}/100)`);
    }

    if (factors.scope >= 60) {
      explanations.push('Production or sensitive environment detected');
    }

    if (factors.agentHistory >= 60) {
      explanations.push('Agent has elevated error rate');
    }

    if (factors.timeOfDay >= 50) {
      explanations.push('Outside business hours');
    }

    if (factors.fileSensitivity >= 40) {
      explanations.push('Sensitive files may be affected');
    }

    if (explanations.length === 0) {
      explanations.push('Standard risk profile');
    }

    return explanations;
  }

  /**
   * Get approval recommendation
   */
  _getRecommendation(level, agent, actionType) {
    const levelConfig = RISK_LEVELS[level];

    if (levelConfig.autoApprove) {
      return {
        action: 'auto_approve',
        reason: `Risk level ${levelConfig.name} is below auto-approval threshold`,
      };
    }

    // Check if agent has explicit approval requirements
    if (agent.policy?.requiresApproval?.includes(actionType)) {
      return {
        action: 'require_approval',
        reason: `Agent policy requires approval for ${actionType} actions`,
      };
    }

    return {
      action: 'require_approval',
      reason: `Risk level ${levelConfig.name} requires human review`,
    };
  }

  /**
   * Create risk result object
   */
  _createRiskResult(level, score, explanation, factors, recommendation = null) {
    return {
      level,
      score: Math.round(score),
      explanation,
      factors,
      recommendation: recommendation || {
        action: 'require_approval',
        reason: 'Default approval required',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Quick check - should this be auto-approved?
   */
  async shouldAutoApprove(params) {
    const risk = await this.calculateRisk(params);
    return risk.recommendation.action === 'auto_approve';
  }

  /**
   * Get risk trend for agent
   */
  async getAgentRiskTrend(agentId, days = 7) {
    const executions = db.prepare(`
      SELECT 
        date(started_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as errors
      FROM agent_executions
      WHERE agent_id = ?
      AND started_at > datetime('now', '-${days} days')
      GROUP BY date(started_at)
      ORDER BY date
    `).all(agentId);

    return executions.map(e => ({
      date: e.date,
      total: e.total,
      errors: e.errors,
      errorRate: e.total > 0 ? e.errors / e.total : 0,
    }));
  }
}

// Create risk assessment table
export function initRiskTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      integration TEXT NOT NULL,
      level TEXT NOT NULL,
      score INTEGER NOT NULL,
      explanation TEXT,
      factors TEXT,
      recommendation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_agent ON risk_assessments(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_level ON risk_assessments(level)`);

  console.log('✅ Risk assessment tables initialized');
}

// Singleton
export const riskEngine = new RiskScoringEngine();
