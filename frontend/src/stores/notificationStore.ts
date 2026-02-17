import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType = 'system' | 'approval' | 'task' | 'agent';
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
  priority: NotificationPriority;
}

interface NotificationState {
  notifications: Notification[];
  isOpen: boolean;
  filter: 'all' | NotificationType;
}

interface NotificationActions {
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setFilter: (filter: NotificationState['filter']) => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const sampleNotifications: Omit<Notification, 'id' | 'timestamp' | 'read'>[] = [
  {
    type: 'system',
    title: 'Welcome to AgentX',
    message: 'Your AI agent management platform is ready to use. Take a tour to get started!',
    priority: 'normal',
    actionUrl: '/settings',
  },
  {
    type: 'agent',
    title: 'Builder Agent Online',
    message: 'Builder agent has completed initialization and is ready for tasks.',
    priority: 'low',
    actionUrl: '/agents',
  },
  {
    type: 'task',
    title: 'Task Completed',
    message: 'Workflow "Daily Report" completed successfully in 2.3s.',
    priority: 'normal',
    actionUrl: '/tasks',
  },
  {
    type: 'approval',
    title: 'Approval Required',
    message: 'Codex agent is requesting write access to /projects/surveyx.',
    priority: 'high',
    actionUrl: '/tasks',
  },
];

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  persist(
    (set) => ({
      notifications: [],
      isOpen: false,
      filter: 'all',

      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: generateId(),
          timestamp: Date.now(),
          read: false,
        };

        set((state) => {
          const updated = [newNotification, ...state.notifications].slice(0, 50);
          return { notifications: updated };
        });
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      clearNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearAll: () => {
        set({ notifications: [] });
      },

      togglePanel: () => {
        set((state) => ({ isOpen: !state.isOpen }));
      },

      openPanel: () => {
        set({ isOpen: true });
      },

      closePanel: () => {
        set({ isOpen: false });
      },

      setFilter: (filter) => {
        set({ filter });
      },
    }),
    {
      name: 'agentx-notifications',
      partialize: (state) => ({ notifications: state.notifications }),
      onRehydrateStorage: () => (state) => {
        if (state && state.notifications.length === 0) {
          // Seed sample notifications synchronously (single state update)
          const now = Date.now();
          const seeded: Notification[] = sampleNotifications.map((n, i) => ({
            ...n,
            id: `seed-${i}-${now}`,
            timestamp: now - i * 60_000,
            read: false,
          }));
          useNotificationStore.setState({ notifications: seeded });
        }
      },
    }
  )
);

// Selector for unread count
export const useUnreadCount = () =>
  useNotificationStore((state) => state.notifications.filter((n) => !n.read).length);

// Selector for filtered notifications
export const useFilteredNotifications = () => {
  const { notifications, filter } = useNotificationStore();
  if (filter === 'all') return notifications;
  return notifications.filter((n) => n.type === filter);
};
