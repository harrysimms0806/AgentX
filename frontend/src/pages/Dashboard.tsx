import { motion } from 'framer-motion';
import { Activity, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';
import { AgentCard } from '../components/AgentCard';
import { useAppStore } from '../stores/appStore';
import { cn } from '../utils/cn';
import type { Agent } from '@types/index';

// Mock data for now - will come from API
const mockAgents: Agent[] = [
  {
    id: 'bud',
    name: 'Bud',
    displayName: 'Bud (Coordinator)',
    type: 'coordinator',
    status: 'working',
    avatar: { mode: 'emoji', emoji: '🌱' },
    provider: 'OpenClaw',
    capabilities: ['planning', 'coordination', 'documentation'],
    policy: { allow: ['read'], deny: [], requiresApproval: [], scopes: { folders: [], repos: [] }, budgets: { maxConcurrent: 5 } },
    routing: { priority: 0, autoAssign: false },
    metadata: { description: 'Your coordinator agent', category: 'Core' },
    stats: {
      tasksCompleted: 156,
      tasksFailed: 3,
      avgResponseTime: 1200,
      totalCost: 0,
      uptime: 99.9,
    },
    lastActive: new Date(),
    config: {
      maxConcurrentTasks: 5,
      timeout: 30000,
      retryAttempts: 3,
    },
    currentTask: {
      id: 'task-1',
      title: 'Building AgentX Dashboard',
      description: 'Creating the agent management platform',
      status: 'running',
      priority: 'high',
      agentId: 'bud',
      projectId: 'agentx',
      workspacePath: '/projects/AgentX',
      context: {
        files: [],
        prompt: 'Build the dashboard',
      },
      createdAt: new Date(),
      logs: [],
    } as any,
  },
  {
    id: 'codex',
    name: 'Codex',
    displayName: 'Codex (Cloud)',
    type: 'builder',
    status: 'idle',
    avatar: { mode: 'emoji', emoji: '🤖' },
    provider: 'OpenAI',
    model: 'gpt-5.3-codex',
    capabilities: ['code-generation', 'refactoring', 'debugging'],
    policy: { allow: ['read', 'write'], deny: [], requiresApproval: ['write'], scopes: { folders: [], repos: [] }, budgets: { maxConcurrent: 2 } },
    routing: { priority: 0, autoAssign: false },
    metadata: { description: 'OpenAI Codex for complex code generation', category: 'Builders' },
    stats: {
      tasksCompleted: 89,
      tasksFailed: 7,
      avgResponseTime: 4500,
      totalCost: 127.5,
      uptime: 98.5,
    },
    lastActive: new Date(Date.now() - 1000 * 60 * 30),
    config: {
      maxConcurrentTasks: 2,
      timeout: 120000,
      retryAttempts: 2,
    },
  },
  {
    id: 'local',
    name: 'Local',
    displayName: 'Local (Ollama)',
    type: 'local',
    status: 'offline',
    avatar: { mode: 'emoji', emoji: '💻' },
    provider: 'Ollama',
    model: 'qwen2.5-coder:14b',
    capabilities: ['quick-edits', 'css', 'simple-fixes'],
    policy: { allow: ['read', 'write'], deny: [], requiresApproval: [], scopes: { folders: [], repos: [] }, budgets: { maxConcurrent: 1 } },
    routing: { priority: 0, autoAssign: false },
    metadata: { description: 'Local Ollama instance for quick edits', category: 'Builders' },
    stats: {
      tasksCompleted: 45,
      tasksFailed: 2,
      avgResponseTime: 800,
      totalCost: 0,
      uptime: 85.0,
    },
    lastActive: new Date(Date.now() - 1000 * 60 * 60 * 2),
    config: {
      maxConcurrentTasks: 1,
      timeout: 60000,
      retryAttempts: 1,
    },
  },
];

const statsCards = [
  { label: 'Active Tasks', value: '3', icon: Activity, color: 'text-accent' },
  { label: 'Completed Today', value: '12', icon: CheckCircle2, color: 'text-success' },
  { label: 'Failed', value: '1', icon: AlertCircle, color: 'text-error' },
  { label: 'Queued', value: '5', icon: Clock, color: 'text-warning' },
];

export function Dashboard() {
  const { sidebarCollapsed } = useAppStore();

  return (
    <div
      className={cn(
        'min-h-screen bg-background dark:bg-background-dark',
        'transition-all duration-300',
        sidebarCollapsed ? 'pl-[72px]' : 'pl-[240px]'
      )}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 px-6 py-4 bg-glass-light/80 dark:bg-glass-dark/80 backdrop-blur-apple border-b border-glass-border dark:border-glass-border-dark">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-foreground-secondary dark:text-foreground-secondary-dark">
              Monitor and control your AI workforce
            </p>
          </div>
          
          <button className="btn-apple flex items-center gap-2">
            <Zap className="w-4 h-4" />
            New Task
          </button>
        </div>
      </header>

      <main className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-card p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-secondary dark:text-foreground-secondary-dark">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={cn('w-8 h-8', stat.color)} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Agents Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Agents</h2>
            <button className="text-sm text-accent hover:underline">View All</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockAgents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + index * 0.1 }}
              >
                <AgentCard agent={agent} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          
          <div className="glass-card p-4">
            <div className="space-y-3">
              {[
                { time: '2 min ago', message: 'Bud completed task: Build sidebar component', type: 'success' },
                { time: '5 min ago', message: 'Codex assigned to: JB RUBBER migration', type: 'info' },
                { time: '12 min ago', message: 'Local agent disconnected', type: 'warning' },
                { time: '1 hour ago', message: 'New project created: AgentX', type: 'info' },
              ].map((activity, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-glass-border dark:border-glass-border-dark last:border-0">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full mt-1.5',
                      activity.type === 'success' && 'bg-success',
                      activity.type === 'info' && 'bg-accent',
                      activity.type === 'warning' && 'bg-warning'
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm">{activity.message}</p>
                    <p className="text-xs text-foreground-tertiary">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
