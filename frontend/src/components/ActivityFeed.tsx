import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, CheckCircle2, Clock, Play, XCircle, 
  Plus, Trash2, RefreshCw,
  ChevronDown, ChevronUp, Bell
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useWebSocket } from '../hooks/useWebSocket';

export interface ActivityEvent {
  id: string;
  type: 'agent' | 'task' | 'workflow' | 'system' | 'project';
  action: 'created' | 'started' | 'completed' | 'failed' | 'deleted' | 'updated' | 'connected' | 'disconnected';
  title: string;
  description?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

const actionColors: Record<string, string> = {
  created: 'text-blue-500 bg-blue-500/10',
  started: 'text-amber-500 bg-amber-500/10',
  completed: 'text-green-500 bg-green-500/10',
  failed: 'text-red-500 bg-red-500/10',
  deleted: 'text-gray-500 bg-gray-500/10',
  updated: 'text-purple-500 bg-purple-500/10',
  connected: 'text-green-500 bg-green-500/10',
  disconnected: 'text-red-500 bg-red-500/10',
};

const actionIcons: Record<string, React.ElementType> = {
  created: Plus,
  started: Play,
  completed: CheckCircle2,
  failed: XCircle,
  deleted: Trash2,
  updated: RefreshCw,
  connected: Activity,
  disconnected: Clock,
};

// Generate mock activities for demo
const generateMockActivities = (): ActivityEvent[] => {
  const activities: ActivityEvent[] = [
    {
      id: '1',
      type: 'task',
      action: 'completed',
      title: 'Code review completed',
      description: 'Builder agent finished reviewing PR #234',
      timestamp: new Date(Date.now() - 1000 * 60 * 2),
    },
    {
      id: '2',
      type: 'agent',
      action: 'started',
      title: 'Coordinator agent activated',
      description: 'Assigned to workflow: New Task Handler',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
    {
      id: '3',
      type: 'workflow',
      action: 'updated',
      title: 'Workflow modified',
      description: 'Code Review Pipeline: Added test step',
      timestamp: new Date(Date.now() - 1000 * 60 * 12),
    },
    {
      id: '4',
      type: 'project',
      action: 'created',
      title: 'New project created',
      description: 'Project "AgentX V2" has been created',
      timestamp: new Date(Date.now() - 1000 * 60 * 15),
    },
    {
      id: '5',
      type: 'task',
      action: 'failed',
      title: 'Deployment failed',
      description: 'Build agent encountered an error',
      timestamp: new Date(Date.now() - 1000 * 60 * 23),
    },
    {
      id: '6',
      type: 'system',
      action: 'connected',
      title: 'WebSocket connected',
      description: 'Real-time updates enabled',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
    },
  ];
  return activities;
};

interface ActivityFeedProps {
  maxItems?: number;
  showFilters?: boolean;
  className?: string;
  compact?: boolean;
}

export function ActivityFeed({ 
  maxItems = 50, 
  showFilters = true, 
  className,
  compact = false 
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>(generateMockActivities());
  const [filter, setFilter] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { connected, lastMessage } = useWebSocket();

  // Auto-scroll to bottom when new activities arrive
  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities, isPaused]);

  // Listen for WebSocket messages to add real activities
  useEffect(() => {
    if (lastMessage && !isPaused) {
      // Convert WebSocket message to activity event
      let newActivity: ActivityEvent | null = null;
      
      switch (lastMessage.type) {
        case 'agent:status':
          newActivity = {
            id: Date.now().toString(),
            type: 'agent',
            action: lastMessage.payload.status === 'working' ? 'started' : 'updated',
            title: `Agent ${lastMessage.payload.status}`,
            description: `Agent ${lastMessage.payload.agentId} is now ${lastMessage.payload.status}`,
            timestamp: new Date(),
            metadata: { agentId: lastMessage.payload.agentId, status: lastMessage.payload.status },
          };
          break;
        case 'task:update':
        case 'task:created':
          newActivity = {
            id: Date.now().toString(),
            type: 'task',
            action: lastMessage.type === 'task:created' ? 'created' : 
                    lastMessage.payload.status === 'completed' ? 'completed' :
                    lastMessage.payload.status === 'failed' ? 'failed' : 'updated',
            title: `Task ${lastMessage.payload.title || 'updated'}`,
            description: `Status: ${lastMessage.payload.status}`,
            timestamp: new Date(),
            metadata: { taskId: lastMessage.payload.id, status: lastMessage.payload.status },
          };
          break;
      }
      
      if (newActivity) {
        setActivities(prev => [newActivity!, ...prev].slice(0, maxItems));
      }
    }
  }, [lastMessage, isPaused, maxItems]);

  // Simulate incoming activities
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      const actions: ActivityEvent['action'][] = ['created', 'started', 'completed', 'updated'];
      const types: ActivityEvent['type'][] = ['agent', 'task', 'workflow'];
      const titles = [
        'New task queued',
        'Agent status changed',
        'Workflow executed',
        'Project updated',
        'Integration synced',
      ];
      
      if (Math.random() > 0.7) {
        const newActivity: ActivityEvent = {
          id: Date.now().toString(),
          type: types[Math.floor(Math.random() * types.length)],
          action: actions[Math.floor(Math.random() * actions.length)],
          title: titles[Math.floor(Math.random() * titles.length)],
          timestamp: new Date(),
        };
        setActivities(prev => [newActivity, ...prev].slice(0, maxItems));
      }
    }, 15000); // New activity every ~15 seconds

    return () => clearInterval(interval);
  }, [isPaused, maxItems]);

  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.type === filter);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  if (compact) {
    return (
      <div className={cn("glass-card overflow-hidden", className)}>
        <div className="p-4 border-b border-glass-border dark:border-glass-border-dark">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="font-semibold">Live Activity</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full",
                connected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )} />
              <span className="text-xs text-foreground-secondary">
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          className="p-2 space-y-1 max-h-[300px] overflow-y-auto"
        >
          <AnimatePresence initial={false}>
            {filteredActivities.slice(0, 5).map((activity) => {
              const ActionIcon = actionIcons[activity.action] || Activity;
              
              return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-background-secondary/50 transition-colors"
                >
                  <div className={cn("p-1.5 rounded-lg shrink-0", actionColors[activity.action])}>
                    <ActionIcon className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    <p className="text-xs text-foreground-secondary">{formatTime(activity.timestamp)}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("glass-card overflow-hidden flex flex-col", className)}>
      {/* Header */}
      <div className="p-4 border-b border-glass-border dark:border-glass-border-dark">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/10">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Activity Feed</h3>
              <p className="text-sm text-foreground-secondary">
                {filteredActivities.length} events • {connected ? 'Live updates' : 'Reconnecting...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isPaused ? "bg-amber-500/10 text-amber-500" : "hover:bg-background-secondary"
              )}
              title={isPaused ? 'Resume updates' : 'Pause updates'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg hover:bg-background-secondary transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2">
            {(['all', 'agent', 'task', 'workflow', 'system'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm capitalize transition-colors",
                  filter === type
                    ? "bg-accent text-white"
                    : "bg-background-secondary dark:bg-background-secondary-dark hover:bg-background-tertiary"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Activity List */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div 
              ref={scrollRef}
              className="p-4 space-y-3 max-h-[400px] overflow-y-auto"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
            >
              <AnimatePresence initial={false}>
                {filteredActivities.length === 0 ? (
                  <div className="text-center py-8 text-foreground-secondary">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No activity yet</p>
                  </div>
                ) : (
                  filteredActivities.map((activity, index) => {
                    const ActionIcon = actionIcons[activity.action] || Activity;
                    
                    return (
                      <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-background-secondary/50 transition-colors group"
                      >
                        <div className={cn(
                          "p-2 rounded-xl shrink-0",
                          actionColors[activity.action]
                        )}>
                          <ActionIcon className="w-4 h-4" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{activity.title}</p>
                              {activity.description && (
                                <p className="text-sm text-foreground-secondary mt-0.5">
                                  {activity.description}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-foreground-secondary shrink-0">
                              {formatTime(activity.timestamp)}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-2">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs capitalize",
                              "bg-background-secondary dark:bg-background-secondary-dark"
                            )}>
                              {activity.type}
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs capitalize",
                              actionColors[activity.action]
                            )}>
                              {activity.action}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      {expanded && (
        <div className="px-4 py-3 border-t border-glass-border dark:border-glass-border-dark bg-background-secondary/30">
          <div className="flex items-center justify-between text-xs text-foreground-secondary">
            <span>Auto-updates {isPaused ? 'paused' : 'enabled'}</span>
            <button 
              onClick={() => setActivities([])}
              className="hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityFeed;
