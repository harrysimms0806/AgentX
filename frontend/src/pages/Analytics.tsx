import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getAnalyticsAgents,
  getAnalyticsCosts,
  getAnalyticsHourly,
  getAnalyticsOverview,
  getAnalyticsTrends,
  type AnalyticsAgentMetric,
  type AnalyticsCostPoint,
  type AnalyticsHourlyPoint,
  type AnalyticsOverview,
  type AnalyticsTrendPoint,
} from '../utils/api';
import { cn } from '../utils/cn';

type RangeOption = 7 | 30 | 90;

const rangeOptions: RangeOption[] = [7, 30, 90];

const statusColors: Record<string, string> = {
  completed: '#22c55e',
  running: '#3b82f6',
  failed: '#ef4444',
  pending: '#f59e0b',
  queued: '#a855f7',
  paused: '#14b8a6',
  cancelled: '#6b7280',
};

const metricCards = [
  { key: 'totalTasks', label: 'Total Tasks', valuePrefix: '', valueSuffix: '', decimals: 0 },
  { key: 'completionRate', label: 'Completion Rate', valuePrefix: '', valueSuffix: '%', decimals: 1 },
  { key: 'avgCost', label: 'Avg Cost / Task', valuePrefix: '$', valueSuffix: '', decimals: 2 },
  { key: 'activeAgents', label: 'Active Agents', valuePrefix: '', valueSuffix: '', decimals: 0 },
] as const;

const dayLabel = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const hourLabel = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

const HeatCell = (props: {
  cx?: number;
  cy?: number;
  payload?: { intensity?: number };
}) => {
  const intensity = props.payload?.intensity ?? 0;
  const alpha = 0.1 + intensity * 0.85;
  return (
    <rect
      x={(props.cx ?? 0) - 10}
      y={(props.cy ?? 0) - 10}
      width={20}
      height={20}
      rx={4}
      fill={`rgba(59, 130, 246, ${alpha})`}
      stroke="rgba(148, 163, 184, 0.2)"
    />
  );
};

const chartTooltipStyle = {
  backgroundColor: 'var(--background)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
};

export function Analytics() {
  const [range, setRange] = useState<RangeOption>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrendPoint[]>([]);
  const [agents, setAgents] = useState<AnalyticsAgentMetric[]>([]);
  const [hourly, setHourly] = useState<AnalyticsHourlyPoint[]>([]);
  const [costs, setCosts] = useState<AnalyticsCostPoint[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [overviewData, trendData, agentData, hourlyData, costData] = await Promise.all([
          getAnalyticsOverview(range),
          getAnalyticsTrends(range),
          getAnalyticsAgents(range),
          getAnalyticsHourly(range),
          getAnalyticsCosts(range),
        ]);

        setOverview(overviewData);
        setTrends(trendData);
        setAgents(agentData);
        setHourly(hourlyData);
        setCosts(costData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load analytics');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [range]);

  const pieData = useMemo(() => {
    if (!overview) return [];
    return overview.statusDistribution.map((item) => ({
      name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
      value: item.count,
      color: statusColors[item.status] || '#94a3b8',
    }));
  }, [overview]);

  const trendData = useMemo(
    () => trends.map((point) => ({ ...point, label: dayLabel(point.date) })),
    [trends]
  );

  const costData = useMemo(
    () => costs.map((point) => ({ ...point, label: dayLabel(point.date) })),
    [costs]
  );

  const hourlyHeat = useMemo(() => {
    const maxTotal = Math.max(...hourly.map((h) => h.total), 1);
    return hourly.map((item) => ({
      x: item.hour,
      y: 1,
      value: item.total,
      label: hourLabel(item.hour),
      intensity: item.total / maxTotal,
    }));
  }, [hourly]);

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark p-6">
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8 flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-sm text-foreground-secondary mt-1">Performance, throughput, cost, and activity intelligence</p>
        </div>

        <div className="flex items-center gap-2 glass-card p-1">
          {rangeOptions.map((option) => (
            <button
              key={option}
              onClick={() => setRange(option)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                range === option
                  ? 'bg-accent text-white'
                  : 'hover:bg-background-secondary dark:hover:bg-background-secondary-dark'
              )}
            >
              {option}d
            </button>
          ))}
        </div>
      </motion.header>

      {error && (
        <div className="glass-card p-4 mb-6 border-red-300/50 dark:border-red-500/40">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className={cn('space-y-6', loading && 'opacity-70 pointer-events-none')}>
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {overview &&
            metricCards.map((card) => {
              const value = overview.totals[card.key];
              const trend = overview.trends[card.key];
              const isUp = trend >= 0;
              const formatted =
                card.decimals > 0 ? value.toFixed(card.decimals) : Math.round(value).toLocaleString('en-US');
              const trendText = `${isUp ? '+' : ''}${trend.toFixed(1)}${card.key === 'completionRate' ? ' pts' : '%'}`;

              return (
                <motion.div
                  key={card.key}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="glass-card p-5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-foreground-secondary">{card.label}</p>
                      <p className="text-3xl font-bold mt-1">
                        {card.valuePrefix}
                        {formatted}
                        {card.valueSuffix ?? ''}
                      </p>
                      <div
                        className={cn(
                          'text-xs mt-2 flex items-center gap-1',
                          isUp ? 'text-green-500' : 'text-red-500'
                        )}
                      >
                        {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span>{trendText} vs prior range</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card p-6">
            <h2 className="text-lg font-semibold">Task Completion Trends</h2>
            <p className="text-sm text-foreground-secondary mb-4">Daily created, completed, and completion-rate trajectory</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="label" stroke="currentColor" opacity={0.5} tickLine={false} fontSize={12} minTickGap={16} />
                  <YAxis yAxisId="left" stroke="currentColor" opacity={0.5} tickLine={false} fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="currentColor" opacity={0.5} tickFormatter={(v) => `${v}%`} fontSize={12} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="created" name="Created" stroke="#64748b" strokeWidth={2} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="completionRate" name="Completion Rate" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold">Task Status Distribution</h2>
            <p className="text-sm text-foreground-secondary mb-4">Current status breakdown across all tasks</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={92} paddingAngle={3}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold">Agent Performance</h2>
            <p className="text-sm text-foreground-secondary mb-4">Completed tasks and success rate by agent</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agents}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="name" stroke="currentColor" opacity={0.6} tickLine={false} fontSize={12} />
                  <YAxis yAxisId="left" stroke="currentColor" opacity={0.5} fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="currentColor" opacity={0.5} tickFormatter={(v) => `${v}%`} fontSize={12} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="tasksCompleted" name="Tasks Completed" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="right" dataKey="successRate" name="Success Rate" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold">Cost Tracking</h2>
            <p className="text-sm text-foreground-secondary mb-4">Daily cost and cumulative spend trend</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={costData}>
                  <defs>
                    <linearGradient id="dailyCostGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="label" stroke="currentColor" opacity={0.5} tickLine={false} fontSize={12} minTickGap={16} />
                  <YAxis yAxisId="left" stroke="currentColor" opacity={0.5} fontSize={12} tickFormatter={(v) => `$${v}`} />
                  <YAxis yAxisId="right" orientation="right" stroke="currentColor" opacity={0.5} fontSize={12} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => `$${Number(value).toFixed(2)}`} />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="dailyCost" name="Daily Cost" stroke="#0ea5e9" fill="url(#dailyCostGradient)" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="cumulativeCost" name="Cumulative Cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-lg font-semibold">Hourly Activity Heatmap</h2>
          <p className="text-sm text-foreground-secondary mb-4">Task volume by hour of day ({range}d)</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 12, right: 12, top: 16, bottom: 16 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="currentColor" opacity={0.07} vertical={false} />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 23]}
                  tickCount={12}
                  tickFormatter={(tick) => `${String(tick).padStart(2, '0')}`}
                  stroke="currentColor"
                  opacity={0.5}
                  fontSize={11}
                />
                <YAxis type="number" dataKey="y" domain={[0, 2]} hide />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => [`${value} tasks`, 'Volume']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? 'Hour'}
                />
                <Scatter data={hourlyHeat} shape={<HeatCell />}>
                  {hourlyHeat.map((point) => (
                    <Cell key={point.label} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground-secondary mt-2">
            <span>Low</span>
            <div className="h-2 w-24 rounded bg-gradient-to-r from-blue-500/20 to-blue-500/90" />
            <span>High</span>
          </div>
        </section>
      </div>
    </div>
  );
}
