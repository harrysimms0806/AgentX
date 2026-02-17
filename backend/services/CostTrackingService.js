import db from '../models/database.js';
import { broadcast } from '../server.js';

/**
 * Cost Tracking Service (P3)
 * 
 * Tracks API costs from agent executions with detailed breakdowns.
 * Provides cost analytics, budgets, and alerts.
 * 
 * Features:
 * - Real-time cost tracking per task/agent
 * - Daily/weekly/monthly cost aggregation
 * - Budget alerts and warnings
 * - Cost breakdown by agent, model, task type
 * - Historical cost analytics
 */

export class CostTrackingService {
  constructor() {
    this.sessionCosts = new Map(); // sessionKey -> cost data
    this.dailyBudget = 10.0; // $10/day default
    this.monthlyBudget = 100.0; // $100/month default
    this.alertThreshold = 0.8; // Alert at 80% of budget
  }

  /**
   * Initialize cost tracking
   */
  async initialize() {
    console.log('💰 CostTrackingService: Initializing...');
    
    // Initialize cost tracking tables
    this.initCostTables();
    
    console.log('✅ CostTrackingService: Ready');
    console.log(`   Daily budget: $${this.dailyBudget}`);
    console.log(`   Monthly budget: $${this.monthlyBudget}`);
  }

  /**
   * Initialize database tables for cost tracking
   */
  initCostTables() {
    // Cost tracking table for detailed records
    db.exec(`
      CREATE TABLE IF NOT EXISTS cost_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_key TEXT,
        model TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        input_cost REAL DEFAULT 0,
        output_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        duration_ms INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    // Daily cost aggregation
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_costs (
        date TEXT PRIMARY KEY,
        total_cost REAL DEFAULT 0,
        task_count INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('   Cost tables initialized');
  }

  /**
   * Record cost for a completed task
   */
  recordCost({
    taskId,
    agentId,
    sessionKey,
    model,
    inputTokens = 0,
    outputTokens = 0,
    inputCost = 0,
    outputCost = 0,
    durationMs = 0,
  }) {
    const totalCost = inputCost + outputCost;
    
    // Insert detailed record
    db.prepare(`
      INSERT INTO cost_records 
      (task_id, agent_id, session_key, model, input_tokens, output_tokens, input_cost, output_cost, total_cost, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      agentId,
      sessionKey,
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost,
      durationMs
    );

    // Update daily aggregation
    this.updateDailyCost(totalCost, inputTokens, outputTokens);

    // Store in session costs
    if (sessionKey) {
      this.sessionCosts.set(sessionKey, {
        taskId,
        agentId,
        model,
        inputTokens,
        outputTokens,
        inputCost,
        outputCost,
        totalCost,
        durationMs,
        timestamp: Date.now(),
      });
    }

    // Broadcast cost update
    broadcast({
      type: 'cost:update',
      payload: {
        taskId,
        agentId,
        model,
        cost: totalCost,
        tokens: inputTokens + outputTokens,
        timestamp: Date.now(),
      }
    });

    // Check budget alerts
    this.checkBudgetAlerts();

    return { totalCost, inputCost, outputCost };
  }

  /**
   * Update daily cost aggregation
   */
  updateDailyCost(cost, inputTokens, outputTokens) {
    const today = new Date().toISOString().split('T')[0];
    
    // Try to update existing record
    const result = db.prepare(`
      UPDATE daily_costs 
      SET total_cost = total_cost + ?,
          task_count = task_count + 1,
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE date = ?
    `).run(cost, inputTokens, outputTokens, today);

    // If no record exists, insert one
    if (result.changes === 0) {
      db.prepare(`
        INSERT INTO daily_costs (date, total_cost, task_count, input_tokens, output_tokens)
        VALUES (?, ?, 1, ?, ?)
      `).run(today, cost, inputTokens, outputTokens);
    }
  }

  /**
   * Check budget thresholds and emit alerts
   */
  checkBudgetAlerts() {
    const today = new Date().toISOString().split('T')[0];
    const dailyCost = this.getDailyCost(today);
    const monthlyCost = this.getMonthlyCost();

    // Check daily budget
    const dailyRatio = dailyCost / this.dailyBudget;
    if (dailyRatio >= this.alertThreshold && dailyRatio < 1) {
      broadcast({
        type: 'cost:alert',
        payload: {
          type: 'daily_budget_warning',
          message: `Daily budget at ${Math.round(dailyRatio * 100)}%`,
          current: dailyCost,
          budget: this.dailyBudget,
          severity: 'warning',
        }
      });
    } else if (dailyRatio >= 1) {
      broadcast({
        type: 'cost:alert',
        payload: {
          type: 'daily_budget_exceeded',
          message: `Daily budget exceeded! $${dailyCost.toFixed(2)} / $${this.dailyBudget}`,
          current: dailyCost,
          budget: this.dailyBudget,
          severity: 'critical',
        }
      });
    }

    // Check monthly budget
    const monthlyRatio = monthlyCost / this.monthlyBudget;
    if (monthlyRatio >= this.alertThreshold && monthlyRatio < 1) {
      broadcast({
        type: 'cost:alert',
        payload: {
          type: 'monthly_budget_warning',
          message: `Monthly budget at ${Math.round(monthlyRatio * 100)}%`,
          current: monthlyCost,
          budget: this.monthlyBudget,
          severity: 'warning',
        }
      });
    }
  }

  /**
   * Get cost for a specific day
   */
  getDailyCost(date) {
    const record = db.prepare('SELECT total_cost FROM daily_costs WHERE date = ?').get(date);
    return record?.total_cost || 0;
  }

  /**
   * Get monthly cost
   */
  getMonthlyCost() {
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const records = db.prepare(`
      SELECT total_cost FROM daily_costs WHERE date LIKE ?
    `).all(`${monthPrefix}%`);
    
    return records.reduce((sum, r) => sum + r.total_cost, 0);
  }

  /**
   * Get cost breakdown by agent
   */
  getCostByAgent(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return db.prepare(`
      SELECT 
        agent_id,
        COUNT(*) as task_count,
        SUM(total_cost) as total_cost,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        AVG(total_cost) as avg_cost
      FROM cost_records
      WHERE timestamp >= ?
      GROUP BY agent_id
      ORDER BY total_cost DESC
    `).get(cutoff.toISOString());
  }

  /**
   * Get cost breakdown by model
   */
  getCostByModel(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return db.prepare(`
      SELECT 
        model,
        COUNT(*) as task_count,
        SUM(total_cost) as total_cost,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens
      FROM cost_records
      WHERE timestamp >= ?
      GROUP BY model
      ORDER BY total_cost DESC
    `).all(cutoff.toISOString());
  }

  /**
   * Get daily cost history
   */
  getDailyCostHistory(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return db.prepare(`
      SELECT 
        date,
        total_cost,
        task_count,
        input_tokens,
        output_tokens
      FROM daily_costs
      WHERE date >= ?
      ORDER BY date ASC
    `).all(cutoff.toISOString().split('T')[0]);
  }

  /**
   * Get cost for a specific task
   */
  getTaskCost(taskId) {
    return db.prepare(`
      SELECT * FROM cost_records WHERE task_id = ?
    `).get(taskId);
  }

  /**
   * Get session cost
   */
  getSessionCost(sessionKey) {
    return this.sessionCosts.get(sessionKey) || null;
  }

  /**
   * Get total cost summary
   */
  getCostSummary() {
    const today = new Date().toISOString().split('T')[0];
    const monthPrefix = new Date().toISOString().slice(0, 7);
    
    const todayCost = this.getDailyCost(today);
    const monthlyCost = this.getMonthlyCost();
    
    const allTime = db.prepare(`
      SELECT 
        SUM(total_cost) as total,
        COUNT(*) as tasks,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens
      FROM cost_records
    `).get();

    return {
      today: {
        cost: todayCost,
        budget: this.dailyBudget,
        remaining: Math.max(0, this.dailyBudget - todayCost),
        percentage: Math.min(100, (todayCost / this.dailyBudget) * 100),
      },
      month: {
        cost: monthlyCost,
        budget: this.monthlyBudget,
        remaining: Math.max(0, this.monthlyBudget - monthlyCost),
        percentage: Math.min(100, (monthlyCost / this.monthlyBudget) * 100),
      },
      allTime: {
        cost: allTime?.total || 0,
        tasks: allTime?.tasks || 0,
        inputTokens: allTime?.input_tokens || 0,
        outputTokens: allTime?.output_tokens || 0,
      },
    };
  }

  /**
   * Set budget limits
   */
  setBudgets({ daily, monthly, alertThreshold }) {
    if (daily !== undefined) this.dailyBudget = daily;
    if (monthly !== undefined) this.monthlyBudget = monthly;
    if (alertThreshold !== undefined) this.alertThreshold = alertThreshold;
    
    return {
      daily: this.dailyBudget,
      monthly: this.monthlyBudget,
      alertThreshold: this.alertThreshold,
    };
  }

  /**
   * Get top cost tasks
   */
  getTopCostTasks(limit = 10, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return db.prepare(`
      SELECT 
        cr.task_id,
        cr.agent_id,
        cr.model,
        cr.total_cost,
        cr.input_tokens,
        cr.output_tokens,
        cr.duration_ms,
        cr.timestamp,
        t.title as task_title
      FROM cost_records cr
      JOIN tasks t ON cr.task_id = t.id
      WHERE cr.timestamp >= ?
      ORDER BY cr.total_cost DESC
      LIMIT ?
    `).all(cutoff.toISOString(), limit);
  }

  /**
   * Export cost data
   */
  exportCostData(format = 'json', days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const records = db.prepare(`
      SELECT * FROM cost_records
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
    `).all(cutoff.toISOString());

    if (format === 'csv') {
      const headers = 'task_id,agent_id,model,input_tokens,output_tokens,total_cost,timestamp';
      const rows = records.map(r => 
        `${r.task_id},${r.agent_id},${r.model},${r.input_tokens},${r.output_tokens},${r.total_cost},${r.timestamp}`
      );
      return [headers, ...rows].join('\n');
    }

    return records;
  }

  /**
   * Get service status
   */
  getStatus() {
    const summary = this.getCostSummary();
    return {
      initialized: true,
      sessionCosts: this.sessionCosts.size,
      budgets: {
        daily: this.dailyBudget,
        monthly: this.monthlyBudget,
        alertThreshold: this.alertThreshold,
      },
      summary,
    };
  }
}

// Export singleton
export const costTrackingService = new CostTrackingService();
export default costTrackingService;
