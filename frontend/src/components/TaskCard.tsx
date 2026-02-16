import type { Task } from '../types';
import { cn } from '../utils/cn';

interface TaskCardProps {
  task: Task;
  agentName?: string;
}

export function TaskCard({ task, agentName }: TaskCardProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{task.title}</h3>
          {task.description && <p className="text-sm text-foreground-secondary mt-1">{task.description}</p>}
        </div>
        <span
          className={cn(
            'px-2 py-1 rounded-full text-xs font-medium capitalize',
            task.status === 'running' && 'bg-accent/15 text-accent',
            task.status === 'pending' && 'bg-warning/15 text-warning',
            task.status === 'completed' && 'bg-success/15 text-success',
            task.status === 'failed' && 'bg-error/15 text-error',
            !['running', 'pending', 'completed', 'failed'].includes(task.status) && 'bg-background-secondary text-foreground-secondary'
          )}
        >
          {task.status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-foreground-tertiary">
        <span>Agent: {agentName || task.agentId || 'Unassigned'}</span>
        <span className="capitalize">Priority: {task.priority}</span>
      </div>
    </div>
  );
}
