import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Activity, CheckCircle2, Clock, FolderPlus, ListTodo, Plus, Zap,
  TrendingUp, TrendingDown, Bot, Calendar, ArrowRight, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AgentCard } from '../components/AgentCard';
import { TaskCard } from '../components/TaskCard';
import { TaskModal } from '../components/TaskModal';
import { ActivityFeed } from '../components/ActivityFeed';
import { SystemHealthMonitor } from '../components/SystemHealthMonitor';
import { HelpTooltip, InlineHelpIcon } from '../components/HelpTooltip';
import { FeatureDiscoveryBadge } from '../components/HelpTooltip';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  createProject,
  createTask,
  getStats,
  getAnalyticsTrends,
  getAnalyticsOverview,
  getAnalyticsAgents,
  getAnalyticsHourly,
  type AnalyticsTrendPoint,
  type AnalyticsOverview,
  type AnalyticsAgentMetric,
  type AnalyticsHourlyPoint,
} from '../utils/api';
import { useAppStore } from '../stores/appStore';
import { cn } from '../utils/cn';
import { toast } from '../components/Toast';

// Chart color constants
const COLORS = {
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
};

// Transform trend data for chart
const transformTrendData = (data: AnalyticsTrendPoint[]) => {
  return data.map(point => ({
    day: new Date(point.date).toLocaleDateString('en-US', { weekday: 'short' }),
    tasks: point.created,
    completed: point.completed,
    failed: point.failed,
  }));
};

// Transform hourly data for chart
const transformHourlyData = (data: AnalyticsHourlyPoint[]) => {
  return data.filter((_, i) => i % 2 === 0).map(point => ({
    hour: `${point.hour}:00`,
    requests: point.total,
    errors: point.failed,
  }));
};

// Transform agent performance data for chart
const transformAgentPerformance = (data: AnalyticsAgentMetric[]) => {
  return data.map(agent => ({
    name: agent.name,
    tasks: agent.totalTasks,
    success: agent.tasksCompleted,
    color: COLORS.blue,
  }));
};

// Transform status distribution for pie chart
const transformStatusData = (distribution: { status: string; count: number }[]) => {
  const colorMap: Record<string, string> = {
    completed: COLORS.green,
    pending: COLORS.amber,
    failed: COLORS.red,
    running: COLORS.blue,
    queued: COLORS.purple,
  };
  
  return distribution.map(item => ({
    name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    value: item.count,
    color: colorMap[item.status] || COLORS.blue,
  }));
};

export function Dashboard() {
  const navigate = useNavigate();
  const { connected } = useWebSocket();
  const { agents, tasks, projects, addTask, addProject } = useAppStore();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [stats, setStats] = useState({
    activeAgents: 0,
    pendingTasks: 0,
    runningTasks: 0,
    completedToday: 0,
  });
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(7);
  const [isLoading, setIsLoading] = useState(true);

  // Real chart data states
  const [activityData, setActivityData] = useState<ReturnType<typeof transformTrendData>>([]);
  const [hourlyData, setHourlyData] = useState<ReturnType<typeof transformHourlyData>>([]);
  const [agentPerformanceData, setAgentPerformanceData] = useState<ReturnType<typeof transformAgentPerformance>>([]);
  const [taskStatusData, setTaskStatusData] = useState<ReturnType<typeof transformStatusData>>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);

  // Load dashboard-specific stats (agents/tasks/projects already loaded by App.tsx)
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const statsData = await getStats();
        setStats(prev => ({ ...prev, ...statsData }));
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  // Load analytics data when range changes
  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const [trends, overviewData, agents, hourly] = await Promise.all([
          getAnalyticsTrends(timeRange),
          getAnalyticsOverview(timeRange),
          getAnalyticsAgents(timeRange),
          getAnalyticsHourly(timeRange),
        ]);

        setActivityData(transformTrendData(trends));
        setOverview(overviewData);
        setTaskStatusData(transformStatusData(overviewData.statusDistribution));
        setAgentPerformanceData(transformAgentPerformance(agents));
        setHourlyData(transformHourlyData(hourly));
      } catch (err) {
        console.error('Failed to load analytics:', err);
        // Don't show toast here - it's background data
      }
    };

    loadAnalytics();
  }, [timeRange]);

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);
  const workingAgents = useMemo(() => agents.filter(a => a.status === 'working'), [agents]);

  // Calculate trends from overview data
  const trends = useMemo(() => {
    if (!overview) {
      return {
        agents: { value: 0, positive: true },
        tasks: { value: 0, positive: true },
        completed: { value: 0, positive: true },
        cost: { value: 0, positive: true },
      };
    }

    return {
      agents: { 
        value: Math.abs(overview.trends.activeAgents), 
        positive: overview.trends.activeAgents >= 0 
      },
      tasks: { 
        value: Math.abs(overview.trends.totalTasks), 
        positive: overview.trends.totalTasks >= 0 
      },
      completed: { 
        value: Math.abs(overview.trends.completionRate), 
        positive: overview.trends.completionRate >= 0 
      },
      cost: { 
        value: Math.abs(overview.trends.avgCost), 
        positive: overview.trends.avgCost <= 0 // Negative cost trend is good
      },
    };
  }, [overview]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background dark:bg-background-dark flex items-center justify-center">
        <div className="flex items-center gap-3 text-foreground-secondary">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark p-6">
      {/* Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <HelpTooltip
            id="dashboard-overview"
            title="Dashboard Overview"
            description="View real-time stats, agent status, recent tasks, and system health. Use this page to monitor all activity at a glance."
            placement="right"
          />
        </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "w-2 h-2 rounded-full",
              connected ? "bg-green-500" : "bg-red-500"
            )} />
            <p className="text-sm text-foreground-secondary">
              {connected ? 'System Online' : 'Reconnecting...'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-apple-secondary flex items-center gap-2" onClick={() => navigate('/projects')}>
            <FolderPlus className="w-4 h-4" />
            New Project
          </button>
          <button className="btn-apple flex items-center gap-2" onClick={() => setShowTaskModal(true)}>
            <Zap className="w-4 h-4" />
            New Task
          </button>
        </div>
      </motion.header>

      {/* Stats Cards */}
      <motion.div 
        data-tour="dashboard-stats"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {[
          { 
            label: 'Active Agents', 
            value: stats.activeAgents, 
            icon: Activity, 
            trend: trends.agents,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10'
          },
          { 
            label: 'Pending Tasks', 
            value: stats.pendingTasks, 
            icon: Clock, 
            trend: trends.tasks,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
          },
          { 
            label: 'Running Tasks', 
            value: stats.runningTasks, 
            icon: ListTodo, 
            trend: null,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10'
          },
          { 
            label: 'Completed Today', 
            value: stats.completedToday, 
            icon: CheckCircle2, 
            trend: trends.completed,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10'
          },
        ].map((card) => (
          <motion.div 
            key={card.label} 
            variants={itemVariants}
            className="glass-card p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-sm text-foreground-secondary">{card.label}</p>
                  {card.label === 'Active Agents' && (
                    <InlineHelpIcon 
                      title="Active Agents"
                      description="Agents currently running and available to process tasks. Click to view all agents."
                    />
                  )}
                </div>
                <p className="text-3xl font-bold mt-1">{card.value}</p>
                {card.trend && (
                  <div className={cn(
                    "flex items-center gap-1 mt-2 text-xs",
                    card.trend.positive ? "text-green-500" : "text-red-500"
                  )}>
                    {card.trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{card.trend.value}% from last {timeRange}d</span>
                  </div>
                )}
              </div>
              <div className={cn("p-3 rounded-xl", card.bgColor, card.color)}>
                <card.icon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Section */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
      >
        {/* Activity Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-lg">Activity Overview</h3>
              <p className="text-sm text-foreground-secondary">Tasks and completions over time</p>
            </div>
            <div className="flex items-center gap-2">
              {[7, 30, 90].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range as 7 | 30 | 90)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-sm transition-colors",
                    timeRange === range
                      ? "bg-accent text-white"
                      : "hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                  )}
                >
                  {range}d
                </button>
              ))}
            </div>
          </div>
          
          <div className="h-64">
            {activityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <defs>
                    <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis 
                    dataKey="day" 
                    stroke="currentColor" 
                    opacity={0.5}
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="currentColor" 
                    opacity={0.5}
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--background)', 
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px'
                    }}
                  />
                  
                  <Area 
                    type="monotone" 
                    dataKey="tasks" 
                    name="Created"
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorTasks)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="completed" 
                    name="Completed"
                    stroke="#22c55e" 
                    fillOpacity={1} 
                    fill="url(#colorCompleted)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-foreground-secondary">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading chart data...
              </div>
            )}
          </div>
        </motion.div>

        {/* Task Status Distribution */}
        <motion.div variants={itemVariants} className="glass-card p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Task Status</h3>
            <p className="text-sm text-foreground-secondary">Current distribution</p>
          </div>
          
          <div className="h-48">
            {taskStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={taskStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {taskStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-foreground-secondary">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-4">
            {taskStatusData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-foreground-secondary">{item.name}</span>
                <span className="text-sm font-medium ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Agent Performance & Hourly Stats */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
      >
        {/* Agent Performance */}
        <motion.div variants={itemVariants} className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-lg">Agent Performance</h3>
              <p className="text-sm text-foreground-secondary">Tasks completed by agent type</p>
            </div>
            <button 
              onClick={() => navigate('/agents')}
              className="text-sm text-accent hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="h-48">
            {agentPerformanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentPerformanceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} horizontal={false} />
                  <XAxis type="number" stroke="currentColor" opacity={0.5} fontSize={12} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="currentColor" 
                    opacity={0.5}
                    fontSize={12}
                    width={80}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--background)', 
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="tasks" name="Total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="success" name="Success" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-foreground-secondary">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading agent data...
              </div>
            )}
          </div>
        </motion.div>

        {/* Hourly Activity */}
        <motion.div variants={itemVariants} className="glass-card p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Hourly Activity</h3>
            <p className="text-sm text-foreground-secondary">Requests and errors over 24h</p>
          </div>
          
          <div className="h-48">
            {hourlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis 
                    dataKey="hour" 
                    stroke="currentColor" 
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis 
                    stroke="currentColor" 
                    opacity={0.5}
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--background)', 
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="requests" 
                    name="Requests"
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="errors" 
                    name="Errors"
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-foreground-secondary">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading hourly data...
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Working Agents & Recent Tasks */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Working Agents */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="xl:col-span-1"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold">Working Now</h2>
            </div>
            <span className="text-sm text-foreground-secondary">{workingAgents.length} active</span>
          </div>
          
          <div className="space-y-3">
            {workingAgents.length === 0 ? (
              <div className="glass-card p-6 text-center">
                <Bot className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
                <p className="text-foreground-secondary">No agents working</p>
                <button
                  onClick={() => navigate('/agents')}
                  className="text-accent text-sm hover:underline mt-2"
                >
                  View all agents
                </button>
              </div>
            ) : (
              workingAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))
            )}
          </div>
        </motion.section>

        {/* Recent Tasks */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="xl:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold">Recent Tasks</h2>
            </div>
            <button 
              className="text-sm text-accent hover:underline"
              onClick={() => navigate('/tasks')}
            >
              View all
            </button>
          </div>
          
          <div className="space-y-3">
            {recentTasks.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <ListTodo className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
                <p className="text-foreground-secondary">No tasks yet. Create one to get started.</p>
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="btn-apple mt-4"
                >
                  Create Task
                </button>
              </div>
            ) : (
              recentTasks.map((task) => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  agentName={agents.find((agent) => agent.id === task.agentId)?.name} 
                />
              ))
            )}
          </div>
        </motion.section>
      </div>

      {/* Activity Feed & System Health */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-8">
        {/* System Health Monitor */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="xl:col-span-1"
        >
          <div className="flex items-center gap-2 mb-2">
            <FeatureDiscoveryBadge 
              featureId="system-health-v1" 
              featureName="System Health Monitor" 
            />
          </div>
          <SystemHealthMonitor />
        </motion.section>

        {/* Activity Feed */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="xl:col-span-2"
        >
          <ActivityFeed />
        </motion.section>
      </div>

      {/* Quick Actions FAB */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed right-6 bottom-6 btn-apple flex items-center gap-2 shadow-2xl"
        onClick={async () => {
          try {
            const name = `Project ${projects.length + 1}`;
            const project = await createProject({ name, path: `/workspace/${name.replace(/\s+/g, '-')}` });
            addProject(project);
            toast.success(`${project.name} has been created successfully`, {
              action: {
                label: 'View project',
                onClick: () => navigate('/projects'),
              },
            });
            navigate('/projects');
          } catch (err) {
            toast.error('Failed to create project');
          }
        }}
      >
        <Plus className="w-4 h-4" />
        Quick Project
      </motion.button>

      <TaskModal
        open={showTaskModal}
        agents={agents}
        projects={projects}
        onClose={() => setShowTaskModal(false)}
        onSubmit={async (data) => {
          try {
            const task = await createTask(data);
            addTask(task);
            toast.success(`${task.title} has been added to the queue`);
            setShowTaskModal(false);
          } catch (err) {
            toast.error('Failed to create task');
          }
        }}
      />
    </div>
  );
}

export default Dashboard;
