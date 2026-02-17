import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Activity, CheckCircle2, Clock, FolderPlus, ListTodo, Plus, Zap,
  TrendingUp, TrendingDown, Bot, Calendar, ArrowRight
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
import { useWebSocket } from '../hooks/useWebSocket';
import { createProject, createTask, getAgents, getProjects, getStats, getTasks } from '../utils/api';
import { useAppStore } from '../stores/appStore';
import { cn } from '../utils/cn';
import { toast } from '../components/Toast';

// Generate sample chart data
const generateActivityData = () => {
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      tasks: Math.floor(Math.random() * 20) + 5,
      completed: Math.floor(Math.random() * 15) + 3,
      agents: Math.floor(Math.random() * 8) + 2,
    });
  }
  return data;
};

const generateHourlyData = () => {
  const data = [];
  for (let i = 0; i < 24; i += 2) {
    data.push({
      hour: `${i}:00`,
      requests: Math.floor(Math.random() * 50) + 10,
      errors: Math.floor(Math.random() * 5),
    });
  }
  return data;
};

const generateAgentPerformanceData = () => [
  { name: 'Builder', tasks: 45, success: 42, color: '#3b82f6' },
  { name: 'Reviewer', tasks: 32, success: 30, color: '#22c55e' },
  { name: 'Coordinator', tasks: 28, success: 28, color: '#a855f7' },
  { name: 'Researcher', tasks: 18, success: 16, color: '#f59e0b' },
];

const generateTaskStatusData = () => [
  { name: 'Completed', value: 156, color: '#22c55e' },
  { name: 'Pending', value: 23, color: '#f59e0b' },
  { name: 'Failed', value: 8, color: '#ef4444' },
  { name: 'Running', value: 12, color: '#3b82f6' },
];

export function Dashboard() {
  const navigate = useNavigate();
  const { connected } = useWebSocket();
  const { agents, tasks, projects, addTask, addProject } = useAppStore();
  const setAgents = useAppStore.getState().setAgents;
  const setTasks = useAppStore.getState().setTasks;
  const setProjects = useAppStore.getState().setProjects;
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [stats, setStats] = useState({ 
    activeAgents: 0, 
    pendingTasks: 0, 
    runningTasks: 0, 
    completedToday: 0,
    totalCost: 0,
    avgResponseTime: 0,
  });
  const [timeRange, setTimeRange] = useState('7d');

  // Chart data
  const [activityData] = useState(generateActivityData());
  const [hourlyData] = useState(generateHourlyData());
  const [agentPerformanceData] = useState(generateAgentPerformanceData());
  const [taskStatusData] = useState(generateTaskStatusData());

  useEffect(() => {
    const load = async () => {
      try {
        const [agentsData, tasksData, projectsData, statsData] = await Promise.all([
          getAgents(),
          getTasks(),
          getProjects(),
          getStats(),
        ]);

        setAgents(agentsData);
        setTasks(tasksData);
        setProjects(projectsData);
        setStats(prev => ({ ...prev, ...statsData }));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);
  const workingAgents = useMemo(() => agents.filter(a => a.status === 'working'), [agents]);

  // Calculate trends (mock calculations)
  const trends = {
    agents: { value: 12, positive: true },
    tasks: { value: 8, positive: true },
    completed: { value: 24, positive: true },
    cost: { value: -5, positive: true },
  };

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

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark p-6">
      {/* Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
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
                <p className="text-sm text-foreground-secondary">{card.label}</p>
                <p className="text-3xl font-bold mt-1">{card.value}</p>
                {card.trend && (
                  <div className={cn(
                    "flex items-center gap-1 mt-2 text-xs",
                    card.trend.positive ? "text-green-500" : "text-red-500"
                  )}>
                    {card.trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{card.trend.value}% from last week</span>
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
              {['24h', '7d', '30d'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-sm transition-colors",
                    timeRange === range
                      ? "bg-accent text-white"
                      : "hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          
          <div className="h-64">
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
          </div>
        </motion.div>

        {/* Task Status Distribution */}
        <motion.div variants={itemVariants} className="glass-card p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Task Status</h3>
            <p className="text-sm text-foreground-secondary">Current distribution</p>
          </div>
          
          <div className="h-48">
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
          </div>
        </motion.div>

        {/* Hourly Activity */}
        <motion.div variants={itemVariants} className="glass-card p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-lg">Hourly Activity</h3>
            <p className="text-sm text-foreground-secondary">Requests and errors over 24h</p>
          </div>
          
          <div className="h-48">
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
