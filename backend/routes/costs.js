import { Router } from 'express';
import { costTrackingService } from '../services/CostTrackingService.js';

const router = Router();

/**
 * GET /costs/summary
 * Get cost summary (today, month, all-time)
 */
router.get('/summary', (req, res) => {
  const summary = costTrackingService.getCostSummary();
  res.json({ success: true, data: summary });
});

/**
 * GET /costs/daily
 * Get daily cost history
 */
router.get('/daily', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const history = costTrackingService.getDailyCostHistory(days);
  res.json({ success: true, data: history });
});

/**
 * GET /costs/by-agent
 * Get cost breakdown by agent
 */
router.get('/by-agent', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const breakdown = costTrackingService.getCostByAgent(days);
  res.json({ success: true, data: breakdown });
});

/**
 * GET /costs/by-model
 * Get cost breakdown by model
 */
router.get('/by-model', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const breakdown = costTrackingService.getCostByModel(days);
  res.json({ success: true, data: breakdown });
});

/**
 * GET /costs/top-tasks
 * Get top cost tasks
 */
router.get('/top-tasks', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const days = parseInt(req.query.days) || 30;
  const tasks = costTrackingService.getTopCostTasks(limit, days);
  res.json({ success: true, data: tasks });
});

/**
 * GET /costs/task/:id
 * Get cost for a specific task
 */
router.get('/task/:id', (req, res) => {
  const cost = costTrackingService.getTaskCost(req.params.id);
  if (!cost) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No cost record for this task' },
    });
  }
  res.json({ success: true, data: cost });
});

/**
 * GET /costs/budgets
 * Get/set budget configuration
 */
router.route('/budgets')
  .get((req, res) => {
    res.json({
      success: true,
      data: {
        daily: costTrackingService.dailyBudget,
        monthly: costTrackingService.monthlyBudget,
        alertThreshold: costTrackingService.alertThreshold,
      },
    });
  })
  .post((req, res) => {
    const { daily, monthly, alertThreshold } = req.body;
    const budgets = costTrackingService.setBudgets({ daily, monthly, alertThreshold });
    res.json({ success: true, data: budgets });
  });

/**
 * GET /costs/export
 * Export cost data
 */
router.get('/export', (req, res) => {
  const format = req.query.format || 'json';
  const days = parseInt(req.query.days) || 30;
  
  const data = costTrackingService.exportCostData(format, days);
  
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=costs-${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(data);
  }
  
  res.json({ success: true, data });
});

/**
 * GET /costs/status
 * Get service status
 */
router.get('/status', (req, res) => {
  const status = costTrackingService.getStatus();
  res.json({ success: true, data: status });
});

export default router;
