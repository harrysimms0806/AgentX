import { motion } from 'framer-motion';
import { cn } from '../utils/cn';
import type { Agent } from '../types';

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
  compact?: boolean;
}

const statusConfig = {
  idle: { label: 'Idle', class: 'agent-status-idle', animation: '' },
  working: { label: 'Working', class: 'agent-status-working', animation: '' },
  success: { label: 'Success', class: 'agent-status-success', animation: '' },
  error: { label: 'Error', class: 'agent-status-error', animation: '' },
  offline: { label: 'Offline', class: 'agent-status-offline', animation: '' },
};

/**
 * Get avatar display content based on avatar mode
 */
function getAvatarContent(agent: Agent): string {
  const { avatar } = agent;
  
  if (!avatar) return '🤖';
  
  switch (avatar.mode) {
    case 'emoji':
      return avatar.emoji || '🤖';
    case 'initials':
      return avatar.initials || agent.name.substring(0, 2).toUpperCase();
    case 'image':
      // For image mode, we'd return a placeholder or actual image URL
      return avatar.imageUrl ? ' ' : '🤖';
    default:
      return avatar.emoji || '🤖';
  }
}

export function AgentCard({ agent, onClick, compact }: AgentCardProps) {
  const status = statusConfig[agent.status];
  const avatarContent = getAvatarContent(agent);
  const displayName = agent.displayName || agent.name;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'glass-card p-4 cursor-pointer transition-all duration-200',
        'hover:shadow-apple-lg hover:border-accent/20',
        agent.status === 'working' && 'ring-2 ring-accent/20'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className={cn(
            'relative flex items-center justify-center rounded-apple-lg text-2xl',
            'w-12 h-12 bg-background-secondary dark:bg-background-secondary-dark',
            status.animation
          )}
          style={agent.avatar?.backgroundColor ? { backgroundColor: agent.avatar.backgroundColor } : undefined}
        >
          {agent.avatar?.mode === 'image' && agent.avatar.imageUrl ? (
            <img 
              src={agent.avatar.imageUrl} 
              alt={displayName}
              className="w-full h-full rounded-apple-lg object-cover"
            />
          ) : (
            <span>{avatarContent}</span>
          )}
          
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2',
              'border-background dark:border-background-dark',
              agent.status === 'working' && 'bg-accent',
              agent.status === 'idle' && 'bg-agent-idle',
              agent.status === 'success' && 'bg-success',
              agent.status === 'error' && 'bg-error',
              agent.status === 'offline' && 'bg-agent-offline'
            )}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold truncate">{displayName}</h3>
            <span className={cn('agent-status', status.class)}>
              {status.label}
            </span>
          </div>

          {!compact && (
            <>
              <p className="text-sm text-foreground-secondary dark:text-foreground-secondary-dark mt-0.5">
                {agent.provider}
                {agent.model && <span className="text-foreground-tertiary"> · {agent.model}</span>}
              </p>

              {agent.metadata?.description && (
                <p className="text-xs text-foreground-tertiary mt-1 truncate">
                  {agent.metadata.description}
                </p>
              )}

              {agent.currentTask && (
                <div className="mt-3 p-2 rounded bg-background-secondary/50 dark:bg-background-secondary-dark/50">
                  <p className="text-xs font-medium text-foreground-secondary">Current Task</p>
                  <p className="text-sm truncate">{agent.currentTask.title}</p>
                </div>
              )}

              <div className="mt-3 flex items-center gap-4 text-xs text-foreground-tertiary">
                <span>{agent.stats.tasksCompleted} tasks</span>
                <span>£{agent.stats.totalCost.toFixed(2)} cost</span>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
