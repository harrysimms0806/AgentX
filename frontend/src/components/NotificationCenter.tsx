import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Settings,
  Info,
  AlertCircle,
  CheckSquare,
  Bot,
  Trash2,
  Clock,
} from 'lucide-react';
import {
  useNotificationStore,
  useUnreadCount,
  useFilteredNotifications,
  type NotificationType,
  type Notification,
} from '../stores/notificationStore';
import { cn } from '../utils/cn';
import { useNavigate } from 'react-router-dom';

const typeIcons: Record<NotificationType, typeof Info> = {
  system: Info,
  approval: AlertCircle,
  task: CheckSquare,
  agent: Bot,
};

const typeColors: Record<NotificationType, string> = {
  system: 'text-blue-500 bg-blue-500/10',
  approval: 'text-amber-500 bg-amber-500/10',
  task: 'text-green-500 bg-green-500/10',
  agent: 'text-purple-500 bg-purple-500/10',
};

const priorityIndicators: Record<Notification['priority'], string> = {
  low: 'border-l-2 border-l-border/30',
  normal: 'border-l-2 border-l-border/60',
  high: 'border-l-2 border-l-red-500',
};

const filters: { key: 'all' | NotificationType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'system', label: 'System' },
  { key: 'approval', label: 'Approvals' },
  { key: 'task', label: 'Tasks' },
  { key: 'agent', label: 'Agents' },
];

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onClear: (id: string) => void;
  onClick: (notification: Notification) => void;
}

function NotificationItem({ notification, onMarkAsRead, onClear, onClick }: NotificationItemProps) {
  const Icon = typeIcons[notification.type];
  const colorClass = typeColors[notification.type];
  const priorityClass = priorityIndicators[notification.priority];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        'relative group p-3 rounded-xl cursor-pointer transition-all duration-200',
        'hover:bg-background-secondary dark:hover:bg-background-secondary-dark',
        !notification.read && 'bg-accent/5 dark:bg-accent/10',
        priorityClass
      )}
      onClick={() => onClick(notification)}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={cn('flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center', colorClass)}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm font-medium truncate', !notification.read && 'text-accent')}>
              {notification.title}
            </p>
            <span className="text-xs text-foreground-secondary whitespace-nowrap flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimestamp(notification.timestamp)}
            </span>
          </div>
          <p className="text-sm text-foreground-secondary line-clamp-2 mt-0.5">
            {notification.message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead(notification.id);
              }}
              className="p-1.5 rounded-lg hover:bg-background-tertiary dark:hover:bg-background-tertiary-dark transition-colors"
              title="Mark as read"
            >
              <Check className="w-3.5 h-3.5 text-foreground-secondary" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear(notification.id);
            }}
            className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Unread indicator */}
      {!notification.read && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent" />
      )}
    </motion.div>
  );
}

export function NotificationBell() {
  const unreadCount = useUnreadCount();
  const { togglePanel, isOpen } = useNotificationStore();

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'relative p-2 rounded-xl transition-all duration-200',
        'hover:bg-background-secondary dark:hover:bg-background-secondary-dark',
        isOpen && 'bg-accent/10 text-accent'
      )}
      title="Notifications"
    >
      <Bell className="w-5 h-5" />
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1',
              'flex items-center justify-center',
              'bg-red-500 text-white text-[10px] font-bold rounded-full',
              'border-2 border-glass-light dark:border-glass-dark'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const { isOpen, closePanel, filter, setFilter, markAsRead, markAllAsRead, clearNotification, clearAll } =
    useNotificationStore();
  const notifications = useFilteredNotifications();
  const unreadCount = useUnreadCount();

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        closePanel();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, closePanel]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closePanel();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, closePanel]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      closePanel();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/40"
            onClick={closePanel}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              'fixed z-[70] top-16 left-4',
              'w-[400px] max-h-[600px]',
              'bg-glass-light/95 dark:bg-glass-dark/95 backdrop-blur-apple',
              'border border-glass-border dark:border-glass-border-dark',
              'rounded-2xl shadow-2xl',
              'flex flex-col overflow-hidden'
            )}
            style={{ marginLeft: 72 }} // Align with collapsed sidebar width
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-glass-border dark:border-glass-border-dark">
              <div>
                <h3 className="text-lg font-semibold">Notifications</h3>
                <p className="text-xs text-foreground-secondary">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4 text-foreground-secondary" />
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={closePanel}
                  className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 p-2 border-b border-glass-border dark:border-glass-border-dark overflow-x-auto">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all',
                    filter === f.key
                      ? 'bg-accent text-white'
                      : 'text-foreground-secondary hover:bg-background-secondary dark:hover:bg-background-secondary-dark'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[400px]">
              <AnimatePresence mode="popLayout">
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={markAsRead}
                      onClear={clearNotification}
                      onClick={handleNotificationClick}
                    />
                  ))
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center justify-center py-12 text-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-background-secondary dark:bg-background-secondary-dark flex items-center justify-center mb-4">
                      <Bell className="w-8 h-8 text-foreground-secondary" />
                    </div>
                    <p className="text-foreground-secondary">No notifications</p>
                    <p className="text-xs text-foreground-secondary/60 mt-1">
                      {filter === 'all'
                        ? "You're all caught up!"
                        : `No ${filter} notifications`}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-glass-border dark:border-glass-border-dark">
              <button
                onClick={() => {
                  navigate('/settings');
                  closePanel();
                }}
                className="flex items-center justify-center gap-2 w-full py-2 text-sm text-foreground-secondary hover:text-accent transition-colors"
              >
                <Settings className="w-4 h-4" />
                Notification Settings
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
