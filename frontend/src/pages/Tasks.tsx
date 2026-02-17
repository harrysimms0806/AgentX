import { useEffect, useMemo, useState } from 'react';
import { 
  CheckSquare, Plus, Filter, Search, Trash2, RefreshCw, 
  CheckCircle2, Clock, Play, XCircle, Calendar,
  ArrowUpDown
} from 'lucide-react';
import { TaskModal } from '../components/TaskModal';
import { useAppStore } from '../stores/appStore';
import { 
  getTasks, getAgents, getProjects, createTask, 
  deleteTask
} from '../utils/api';
import { cn } from '../utils/cn';

type TaskStatus = 'all' | 'pending' | 'running' | 'completed' | 'failed';
type SortField = 'createdAt' | 'priority' | 'status';
type SortOrder = 'asc' | 'desc';

const statusConfig: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  pending: { color: 'text-amber-500', bg: 'bg-amber-500/10', icon: Clock, label: 'Pending' },
  queued: { color: 'text-amber-500', bg: 'bg-amber-500/10', icon: Clock, label: 'Queued' },
  running: { color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Play, label: 'Running' },
  paused: { color: 'text-gray-500', bg: 'bg-gray-500/10', icon: Clock, label: 'Paused' },
  completed: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2, label: 'Completed' },
  failed: { color: 'text-red-500', bg: 'bg-red-500/10', icon: XCircle, label: 'Failed' },
  cancelled: { color: 'text-gray-500', bg: 'bg-gray-500/10', icon: XCircle, label: 'Cancelled' },
};

export function Tasks() {
  const { tasks, agents, projects, setTasks, setAgents, setProjects, addTask, removeTask } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksData, agentsData, projectsData] = await Promise.all([
        getTasks(),
        getAgents(),
        getProjects(),
      ]);
      setTasks(tasksData);
      setAgents(agentsData);
      setProjects(projectsData);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Filter by status tab
    if (activeTab !== 'all') {
      result = result.filter((task) => task.status === activeTab);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((task) =>
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        agents.find((a) => a.id === task.agentId)?.name.toLowerCase().includes(query)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'priority':
          const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1, critical: 4 };
          comparison = (priorityOrder[a.priority || 'medium'] || 2) - (priorityOrder[b.priority || 'medium'] || 2);
          break;
        case 'status':
          const statusOrder: Record<string, number> = { 
            queued: 0, pending: 1, running: 2, paused: 3, completed: 4, failed: 5, cancelled: 6 
          };
          comparison = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tasks, activeTab, searchQuery, sortField, sortOrder, agents]);

  const taskStats = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length, pending: 0, running: 0, completed: 0, failed: 0 };
    tasks.forEach((t) => {
      if (t.status === 'pending' || t.status === 'queued') counts.pending++;
      else if (t.status === 'running' || t.status === 'paused') counts.running++;
      else if (t.status === 'completed') counts.completed++;
      else if (t.status === 'failed' || t.status === 'cancelled') counts.failed++;
    });
    return counts;
  }, [tasks]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask(id);
      removeTask(id);
    } catch (err) {
      alert('Failed to delete task: ' + (err as Error).message);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedTasks.size} selected tasks?`)) return;
    const ids = Array.from(selectedTasks);
    for (const id of ids) {
      try {
        await deleteTask(id);
        removeTask(id);
      } catch (err) {
        console.error('Failed to delete task:', err);
      }
    }
    setSelectedTasks(new Set());
  };

  const toggleTaskSelection = (id: string) => {
    const newSet = new Set(selectedTasks);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTasks(newSet);
  };

  const selectAll = () => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const getAgentName = (agentId?: string) => {
    return agents.find((a) => a.id === agentId)?.name || 'Unassigned';
  };

  const tabs: { id: TaskStatus; label: string; count: number }[] = [
    { id: 'all', label: 'All Tasks', count: taskStats.all },
    { id: 'pending', label: 'Pending', count: taskStats.pending },
    { id: 'running', label: 'Running', count: taskStats.running },
    { id: 'completed', label: 'Completed', count: taskStats.completed },
    { id: 'failed', label: 'Failed', count: taskStats.failed },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Task Queue</h1>
          <p className="text-foreground-secondary mt-1">
            Manage and monitor agent tasks
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            className="btn-apple-secondary flex items-center gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            Refresh
          </button>
          <button 
            className="btn-apple flex items-center gap-2"
            onClick={() => setShowModal(true)}
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Pending', value: taskStats.pending, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'Running', value: taskStats.running, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Completed', value: taskStats.completed, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Failed', value: taskStats.failed, color: 'text-red-500', bg: 'bg-red-500/10' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-3">
            <p className="text-sm text-foreground-secondary">{stat.label}</p>
            <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-glass-border dark:border-glass-border-dark pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-accent text-white'
                : 'hover:bg-background-secondary dark:hover:bg-background-secondary-dark text-foreground-secondary'
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className={cn(
              'ml-2 px-1.5 py-0.5 rounded text-xs',
              activeTab === tab.id ? 'bg-white/20' : 'bg-background-secondary dark:bg-background-secondary-dark'
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[250px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary" />
            <input
              type="text"
              className="input-apple w-full pl-9"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-foreground-secondary" />
          <select
            className="input-apple text-sm"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="createdAt">Sort by Date</option>
            <option value="priority">Sort by Priority</option>
            <option value="status">Sort by Status</option>
          </select>
          <button
            className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <ArrowUpDown className={cn('w-4 h-4', sortOrder === 'desc' && 'rotate-180')} />
          </button>
        </div>

        {selectedTasks.size > 0 && (
          <button
            className="btn-apple-secondary text-red-500 hover:bg-red-500/10 flex items-center gap-2"
            onClick={handleBulkDelete}
          >
            <Trash2 className="w-4 h-4" />
            Delete {selectedTasks.size}
          </button>
        )}
      </div>

      {/* Task List */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto text-foreground-secondary animate-spin mb-2" />
          <p className="text-foreground-secondary">Loading tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CheckSquare className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
          <p className="text-foreground-secondary text-lg font-medium">
            {searchQuery ? 'No tasks match your search' : 'No tasks yet'}
          </p>
          <p className="text-sm text-foreground-secondary mt-1">
            {searchQuery 
              ? 'Try adjusting your filters or search query' 
              : 'Create your first task to get started'}
          </p>
          {!searchQuery && (
            <button 
              className="btn-apple mt-4"
              onClick={() => setShowModal(true)}
            >
              Create Task
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select All Header */}
          <div className="flex items-center gap-3 px-4 py-2 text-sm text-foreground-secondary">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent"
              checked={selectedTasks.size === filteredTasks.length && filteredTasks.length > 0}
              onChange={selectAll}
            />
            <span>Select All ({filteredTasks.length})</span>
          </div>

          {filteredTasks.map((task) => {
            const status = statusConfig[task.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const isSelected = selectedTasks.has(task.id);

            return (
              <div
                key={task.id}
                className={cn(
                  'glass-card p-4 transition-all hover:ring-1 hover:ring-accent/50',
                  isSelected && 'ring-2 ring-accent'
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent mt-1"
                    checked={isSelected}
                    onChange={() => toggleTaskSelection(task.id)}
                  />

                  <div className={cn('p-2 rounded-lg', status.bg)}>
                    <StatusIcon className={cn('w-4 h-4', status.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{task.title || 'Untitled Task'}</h3>
                      {task.priority && (
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          task.priority === 'high' ? 'bg-red-500/10 text-red-500' :
                          task.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                          task.priority === 'critical' ? 'bg-purple-500/10 text-purple-500' :
                          'bg-blue-500/10 text-blue-500'
                        )}>
                          {task.priority}
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-sm text-foreground-secondary mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-sm text-foreground-secondary">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                      <span>Agent: {getAgentName(task.agentId)}</span>
                      {task.projectId && (
                        <span>Project: {projects.find((p) => p.id === task.projectId)?.name || 'Unknown'}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      className="p-2 rounded-lg hover:bg-red-500/10 text-foreground-secondary hover:text-red-500 transition-colors"
                      onClick={() => handleDelete(task.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Task Modal */}
      <TaskModal
        open={showModal}
        agents={agents}
        projects={projects}
        onClose={() => setShowModal(false)}
        onSubmit={async (data) => {
          const task = await createTask(data);
          addTask(task);
        }}
      />
    </div>
  );
}
