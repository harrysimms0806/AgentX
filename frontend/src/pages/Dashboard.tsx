import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, FolderPlus, ListTodo, Plus, Zap } from 'lucide-react';
import { AgentCard } from '../components/AgentCard';
import { TaskCard } from '../components/TaskCard';
import { TaskModal } from '../components/TaskModal';
import { useWebSocket } from '../hooks/useWebSocket';
import { createProject, createTask, getAgents, getProjects, getStats, getTasks } from '../utils/api';
import { useAppStore } from '../stores/appStore';

export function Dashboard() {
  const navigate = useNavigate();
  const { connected } = useWebSocket();
  const { agents, tasks, projects, addTask, addProject } = useAppStore();
  const setAgents = useAppStore.getState().setAgents;
  const setTasks = useAppStore.getState().setTasks;
  const setProjects = useAppStore.getState().setProjects;
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ activeAgents: 0, pendingTasks: 0, runningTasks: 0, completedToday: 0 });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
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
        setStats(statsData);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-foreground-secondary">WebSocket: {connected ? 'Connected' : 'Reconnecting...'}</p>
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
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Active Agents', value: stats.activeAgents, icon: Activity },
          { label: 'Pending Tasks', value: stats.pendingTasks, icon: Clock },
          { label: 'Running Tasks', value: stats.runningTasks, icon: ListTodo },
          { label: 'Completed Today', value: stats.completedToday, icon: CheckCircle2 },
        ].map((card) => (
          <div key={card.label} className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground-secondary">{card.label}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
              <card.icon className="w-6 h-6 text-accent" />
            </div>
          </div>
        ))}
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Active Agents</h2>
          <button className="text-sm text-accent" onClick={() => navigate('/agents')}>Manage</button>
        </div>
        {loading ? (
          <div className="glass-card p-4">Loading agents...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Tasks</h2>
          <button className="text-sm text-accent" onClick={() => navigate('/tasks')}>View queue</button>
        </div>
        <div className="space-y-3">
          {recentTasks.map((task) => (
            <TaskCard key={task.id} task={task} agentName={agents.find((agent) => agent.id === task.agentId)?.name} />
          ))}
          {!recentTasks.length && <div className="glass-card p-4">No tasks yet. Create one to start the queue.</div>}
        </div>
      </section>

      <TaskModal
        open={showTaskModal}
        agents={agents}
        projects={projects}
        onClose={() => setShowTaskModal(false)}
        onSubmit={async (data) => {
          const task = await createTask(data);
          addTask(task);
        }}
      />

      <button
        className="fixed right-6 bottom-6 btn-apple flex items-center gap-2"
        onClick={async () => {
          const name = `Project ${projects.length + 1}`;
          const project = await createProject({ name, path: `/workspace/${name.replace(/\s+/g, '-')}` });
          addProject(project);
          navigate('/projects');
        }}
      >
        <Plus className="w-4 h-4" />
        Quick Project
      </button>
    </div>
  );
}
