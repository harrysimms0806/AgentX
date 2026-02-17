import { Router } from 'express';
import db from '../models/database.js';

const router = Router();

const RANGE_OPTIONS = new Set([7, 30, 90]);

const toRangeDays = (value, fallback = 30) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed) || !RANGE_OPTIONS.has(parsed)) {
    return fallback;
  }
  return parsed;
};

const percentChange = (current, previous) => {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

/**
 * GET /analytics/overview
 * Overall platform analytics metrics
 */
router.get('/overview', (req, res) => {
  const rangeDays = toRangeDays(req.query.range, 30);

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
      AVG(CASE WHEN cost IS NOT NULL THEN cost END) as avg_cost
    FROM tasks
  `).get();

  const activeAgents = db.prepare(`
    SELECT COUNT(*) as count
    FROM agents
    WHERE status IN ('idle', 'working', 'success')
  `).get();

  const windowStats = db.prepare(`
    SELECT
      SUM(CASE WHEN date(created_at) >= date('now', '-${rangeDays - 1} days') THEN 1 ELSE 0 END) as current_total,
      SUM(CASE WHEN date(created_at) >= date('now', '-${(rangeDays * 2) - 1} days') AND date(created_at) < date('now', '-${rangeDays - 1} days') THEN 1 ELSE 0 END) as previous_total,
      SUM(CASE WHEN date(created_at) >= date('now', '-${rangeDays - 1} days') AND status = 'completed' THEN 1 ELSE 0 END) as current_completed,
      SUM(CASE WHEN date(created_at) >= date('now', '-${(rangeDays * 2) - 1} days') AND date(created_at) < date('now', '-${rangeDays - 1} days') AND status = 'completed' THEN 1 ELSE 0 END) as previous_completed,
      AVG(CASE WHEN date(created_at) >= date('now', '-${rangeDays - 1} days') THEN cost END) as current_avg_cost,
      AVG(CASE WHEN date(created_at) >= date('now', '-${(rangeDays * 2) - 1} days') AND date(created_at) < date('now', '-${rangeDays - 1} days') THEN cost END) as previous_avg_cost
    FROM tasks
  `).get();

  const agentWindowStats = db.prepare(`
    SELECT
      SUM(CASE WHEN date(last_active) >= date('now', '-${rangeDays - 1} days') THEN 1 ELSE 0 END) as current_active,
      SUM(CASE WHEN date(last_active) >= date('now', '-${(rangeDays * 2) - 1} days') AND date(last_active) < date('now', '-${rangeDays - 1} days') THEN 1 ELSE 0 END) as previous_active
    FROM agents
  `).get();

  const statusDistribution = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks
    GROUP BY status
    ORDER BY count DESC
  `).all();

  const totalTasks = totals?.total_tasks ?? 0;
  const completedTasks = totals?.completed_tasks ?? 0;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const currentTotal = windowStats?.current_total ?? 0;
  const previousTotal = windowStats?.previous_total ?? 0;
  const currentCompletionRate = currentTotal > 0 ? ((windowStats?.current_completed ?? 0) / currentTotal) * 100 : 0;
  const previousCompletionRate = previousTotal > 0 ? ((windowStats?.previous_completed ?? 0) / previousTotal) * 100 : 0;

  res.json({
    success: true,
    data: {
      rangeDays,
      totals: {
        totalTasks,
        completionRate: Number(completionRate.toFixed(1)),
        avgCost: Number((totals?.avg_cost ?? 0).toFixed(2)),
        activeAgents: activeAgents?.count ?? 0,
      },
      trends: {
        totalTasks: Number(percentChange(currentTotal, previousTotal).toFixed(1)),
        completionRate: Number((currentCompletionRate - previousCompletionRate).toFixed(1)),
        avgCost: Number(percentChange(windowStats?.current_avg_cost ?? 0, windowStats?.previous_avg_cost ?? 0).toFixed(1)),
        activeAgents: Number(percentChange(agentWindowStats?.current_active ?? 0, agentWindowStats?.previous_active ?? 0).toFixed(1)),
      },
      statusDistribution,
    },
  });
});

/**
 * GET /analytics/trends
 * Daily task trends for a selected time range
 */
router.get('/trends', (req, res) => {
  const rangeDays = toRangeDays(req.query.range, 30);

  const trends = db.prepare(`
    WITH RECURSIVE dates(day) AS (
      SELECT date('now', '-${rangeDays - 1} days')
      UNION ALL
      SELECT date(day, '+1 day')
      FROM dates
      WHERE day < date('now')
    ),
    created_counts AS (
      SELECT date(created_at) as day, COUNT(*) as created
      FROM tasks
      WHERE date(created_at) >= date('now', '-${rangeDays - 1} days')
      GROUP BY date(created_at)
    ),
    completed_counts AS (
      SELECT date(completed_at) as day, COUNT(*) as completed
      FROM tasks
      WHERE completed_at IS NOT NULL
        AND status = 'completed'
        AND date(completed_at) >= date('now', '-${rangeDays - 1} days')
      GROUP BY date(completed_at)
    ),
    failed_counts AS (
      SELECT date(completed_at) as day, COUNT(*) as failed
      FROM tasks
      WHERE completed_at IS NOT NULL
        AND status = 'failed'
        AND date(completed_at) >= date('now', '-${rangeDays - 1} days')
      GROUP BY date(completed_at)
    )
    SELECT
      dates.day as date,
      COALESCE(created_counts.created, 0) as created,
      COALESCE(completed_counts.completed, 0) as completed,
      COALESCE(failed_counts.failed, 0) as failed
    FROM dates
    LEFT JOIN created_counts ON created_counts.day = dates.day
    LEFT JOIN completed_counts ON completed_counts.day = dates.day
    LEFT JOIN failed_counts ON failed_counts.day = dates.day
    ORDER BY dates.day ASC
  `).all();

  res.json({
    success: true,
    data: trends.map((row) => ({
      ...row,
      completionRate: row.created > 0 ? Number(((row.completed / row.created) * 100).toFixed(1)) : 0,
    })),
  });
});

/**
 * GET /analytics/agents
 * Agent performance metrics for selected range
 */
router.get('/agents', (req, res) => {
  const rangeDays = toRangeDays(req.query.range, 30);

  const agentMetrics = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.status,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as tasks_completed,
      SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as tasks_failed,
      AVG(
        CASE
          WHEN t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
          THEN (julianday(t.completed_at) - julianday(t.started_at)) * 86400
          ELSE NULL
        END
      ) as observed_response_time,
      a.stats_avg_response_time as fallback_response_time,
      AVG(CASE WHEN t.cost IS NOT NULL THEN t.cost END) as avg_cost
    FROM agents a
    LEFT JOIN tasks t
      ON t.agent_id = a.id
      AND date(t.created_at) >= date('now', '-${rangeDays - 1} days')
    GROUP BY a.id, a.name, a.status, a.stats_avg_response_time
    ORDER BY tasks_completed DESC, total_tasks DESC, a.name ASC
  `).all();

  res.json({
    success: true,
    data: agentMetrics.map((row) => {
      const totalTasks = row.total_tasks ?? 0;
      const tasksCompleted = row.tasks_completed ?? 0;
      const successRate = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0;
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        totalTasks,
        tasksCompleted,
        tasksFailed: row.tasks_failed ?? 0,
        successRate: Number(successRate.toFixed(1)),
        avgResponseTime: Number((row.observed_response_time ?? row.fallback_response_time ?? 0).toFixed(0)),
        avgCost: Number((row.avg_cost ?? 0).toFixed(2)),
      };
    }),
  });
});

/**
 * GET /analytics/hourly
 * Activity distribution by hour of day
 */
router.get('/hourly', (req, res) => {
  const rangeDays = toRangeDays(req.query.range, 30);

  const hourly = db.prepare(`
    WITH RECURSIVE hours(hour) AS (
      SELECT 0
      UNION ALL
      SELECT hour + 1
      FROM hours
      WHERE hour < 23
    )
    SELECT
      hours.hour,
      COALESCE(COUNT(t.id), 0) as total,
      COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
      COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0) as failed
    FROM hours
    LEFT JOIN tasks t
      ON CAST(strftime('%H', t.created_at) AS INTEGER) = hours.hour
      AND date(t.created_at) >= date('now', '-${rangeDays - 1} days')
    GROUP BY hours.hour
    ORDER BY hours.hour ASC
  `).all();

  res.json({ success: true, data: hourly });
});

/**
 * GET /analytics/costs
 * Daily and cumulative cost analysis
 */
router.get('/costs', (req, res) => {
  const rangeDays = toRangeDays(req.query.range, 30);

  const costs = db.prepare(`
    WITH RECURSIVE dates(day) AS (
      SELECT date('now', '-${rangeDays - 1} days')
      UNION ALL
      SELECT date(day, '+1 day')
      FROM dates
      WHERE day < date('now')
    ),
    daily_costs AS (
      SELECT
        date(COALESCE(completed_at, created_at)) as day,
        SUM(COALESCE(cost, 0)) as daily_cost,
        AVG(COALESCE(cost, 0)) as avg_cost,
        COUNT(*) as tasks_count
      FROM tasks
      WHERE date(COALESCE(completed_at, created_at)) >= date('now', '-${rangeDays - 1} days')
      GROUP BY date(COALESCE(completed_at, created_at))
    )
    SELECT
      dates.day as date,
      COALESCE(daily_costs.daily_cost, 0) as dailyCost,
      COALESCE(daily_costs.avg_cost, 0) as avgCost,
      COALESCE(daily_costs.tasks_count, 0) as tasksCount,
      SUM(COALESCE(daily_costs.daily_cost, 0)) OVER (ORDER BY dates.day ASC) as cumulativeCost
    FROM dates
    LEFT JOIN daily_costs ON daily_costs.day = dates.day
    ORDER BY dates.day ASC
  `).all();

  res.json({
    success: true,
    data: costs.map((row) => ({
      ...row,
      dailyCost: Number(row.dailyCost.toFixed(2)),
      avgCost: Number(row.avgCost.toFixed(2)),
      cumulativeCost: Number(row.cumulativeCost.toFixed(2)),
    })),
  });
});

export default router;
