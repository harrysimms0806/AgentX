import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HelpTopic = 
  | 'agents'
  | 'tasks' 
  | 'workflows'
  | 'projects'
  | 'integrations'
  | 'memory'
  | 'logs'
  | 'analytics'
  | 'settings'
  | 'notifications'
  | 'command-palette'
  | 'keyboard-shortcuts'
  | 'quick-actions'
  | 'recent-favorites'
  | 'bulk-operations'
  | 'system-health';

export interface FeatureBadge {
  id: string;
  featureName: string;
  page: string;
  dismissedAt: number | null;
}

export interface HelpTooltip {
  id: string;
  title: string;
  description: string;
  page: string;
  elementSelector: string;
  seenAt: number | null;
}

interface HelpState {
  // Feature discovery badges
  featureBadges: FeatureBadge[];
  dismissedBadges: string[];
  
  // Help tooltips
  tooltipsSeen: string[];
  tooltipsEnabled: boolean;
  
  // Global help settings
  helpEnabled: boolean;
  showShortcutHints: boolean;
  
  // Current context
  currentPage: string;
  activeHelpTopic: HelpTopic | null;
  
  // Widget state
  isHelpWidgetOpen: boolean;
  
  // Actions
  dismissBadge: (badgeId: string) => void;
  markTooltipSeen: (tooltipId: string) => void;
  toggleTooltips: () => void;
  toggleShortcutHints: () => void;
  setCurrentPage: (page: string) => void;
  setActiveHelpTopic: (topic: HelpTopic | null) => void;
  toggleHelpWidget: () => void;
  openHelpWidget: () => void;
  closeHelpWidget: () => void;
  resetAllHelp: () => void;
}

// Feature badges configuration - features that are "new" or noteworthy
export const featureBadgeConfig: Omit<FeatureBadge, 'dismissedAt'>[] = [
  { id: 'notifications-v1', featureName: 'Notification Center', page: '/agents' },
  { id: 'quick-actions-v1', featureName: 'Quick Actions', page: '/agents' },
  { id: 'recent-favorites-v1', featureName: 'Recent & Favorites', page: '/agents' },
  { id: 'bulk-operations-v1', featureName: 'Bulk Operations', page: '/agents' },
  { id: 'command-palette-v1', featureName: 'Command Palette', page: '/agents' },
  { id: 'keyboard-shortcuts-v1', featureName: 'Keyboard Shortcuts', page: '/agents' },
  { id: 'system-health-v1', featureName: 'System Health', page: '/' },
];

// Help tooltips configuration
export const helpTooltipConfig: HelpTooltip[] = [
  {
    id: 'sidebar-collapse',
    title: 'Collapse Sidebar',
    description: 'Click to collapse the sidebar and get more workspace. Press ⌘+B to toggle anytime.',
    page: '*',
    elementSelector: '[data-help="sidebar-collapse"]',
    seenAt: null,
  },
  {
    id: 'notification-bell',
    title: 'Notifications',
    description: 'Stay updated with system events, task completions, and approval requests.',
    page: '*',
    elementSelector: '[data-help="notification-bell"]',
    seenAt: null,
  },
  {
    id: 'theme-toggle',
    title: 'Theme Toggle',
    description: 'Switch between light, dark, and system theme. Press ⌘+⇧+L for quick toggle.',
    page: '*',
    elementSelector: '[data-help="theme-toggle"]',
    seenAt: null,
  },
  {
    id: 'agent-status',
    title: 'Agent Status',
    description: 'Shows current agent state: Idle, Working, Paused, or Error. Click for details.',
    page: '/agents',
    elementSelector: '[data-help="agent-status"]',
    seenAt: null,
  },
  {
    id: 'task-priority',
    title: 'Task Priority',
    description: 'High priority tasks are processed first. Drag to reorder within priority levels.',
    page: '/tasks',
    elementSelector: '[data-help="task-priority"]',
    seenAt: null,
  },
  {
    id: 'workflow-builder',
    title: 'Visual Workflow Builder',
    description: 'Drag and drop nodes to create automated workflows. Connect nodes to pass data between steps.',
    page: '/workflows',
    elementSelector: '[data-help="workflow-builder"]',
    seenAt: null,
  },
  {
    id: 'project-lock',
    title: 'Workspace Lock',
    description: 'Locked projects prevent accidental changes. Only admins can modify locked workspaces.',
    page: '/projects',
    elementSelector: '[data-help="project-lock"]',
    seenAt: null,
  },
  {
    id: 'bulk-select',
    title: 'Bulk Operations',
    description: 'Select multiple items to perform actions on all of them at once.',
    page: '*',
    elementSelector: '[data-help="bulk-select"]',
    seenAt: null,
  },
];

// Page-specific help topics
export const pageHelpTopics: Record<string, { title: string; content: string; tips: string[] }> = {
  '/': {
    title: 'Dashboard Overview',
    content: 'The dashboard gives you a real-time overview of your agents, tasks, and system health.',
    tips: [
      'Use ⌘+K to quickly jump to any page',
      'Click on any stat card to see detailed information',
      'System health shows the status of all connected services',
    ],
  },
  '/agents': {
    title: 'Managing Agents',
    content: 'Agents are AI workers that perform tasks. Create, configure, and monitor all your agents here.',
    tips: [
      'Click the + button or press ⌘+⇧+N to create a new agent',
      'Use filters to find agents by status or type',
      'Click on an agent card to view details and edit settings',
    ],
  },
  '/tasks': {
    title: 'Task Management',
    content: 'Tasks represent units of work assigned to agents. Track progress, priorities, and completions.',
    tips: [
      'Drag and drop to reorder tasks by priority',
      'Use bulk select to perform actions on multiple tasks',
      'Click the clock icon to see recently viewed tasks',
    ],
  },
  '/workflows': {
    title: 'Workflow Builder',
    content: 'Create automated workflows by connecting nodes. Workflows can trigger agents, send notifications, and more.',
    tips: [
      'Start with a Trigger node (schedule, webhook, or manual)',
      'Connect nodes by dragging from output to input',
      'Test workflows before activating them',
    ],
  },
  '/projects': {
    title: 'Project Workspaces',
    content: 'Projects isolate work into separate workspaces. Each project has its own agents, tasks, and settings.',
    tips: [
      'Lock a project to prevent accidental changes',
      'Switch projects using the dropdown in the sidebar',
      'Each project maintains separate audit logs',
    ],
  },
  '/integrations': {
    title: 'Integrations',
    content: 'Connect AgentX to external services like Slack, GitHub, Trello, and more.',
    tips: [
      'Each integration requires its own API key or OAuth',
      'Test connections before using in workflows',
      'Monitor integration health in the status panel',
    ],
  },
  '/memory': {
    title: 'Memory & Context',
    content: 'Manage long-term memory and context that agents can access across sessions.',
    tips: [
      'Important facts are stored in long-term memory',
      'Session context is temporary and clears on restart',
      'Use tags to organize memory entries',
    ],
  },
  '/logs': {
    title: 'Audit Logs',
    content: 'Complete audit trail of all actions performed in AgentX. Required for compliance.',
    tips: [
      'Logs are immutable and cannot be deleted',
      'Filter by date range, user, or action type',
      'Export logs for external audit review',
    ],
  },
  '/analytics': {
    title: 'Analytics & Insights',
    content: 'Track agent performance, task completion rates, and system utilization.',
    tips: [
      'Compare metrics across different time periods',
      'Identify bottlenecks in your workflows',
      'Export reports for stakeholder updates',
    ],
  },
  '/settings': {
    title: 'Settings & Configuration',
    content: 'Configure AgentX preferences, security settings, and system options.',
    tips: [
      'Enable 2FA for additional security',
      'Configure backup schedules for critical data',
      'Set up notification preferences per channel',
    ],
  },
};

export const useHelpStore = create<HelpState>()(
  persist(
    (set) => ({
      featureBadges: featureBadgeConfig.map(badge => ({ ...badge, dismissedAt: null })),
      dismissedBadges: [],
      tooltipsSeen: [],
      tooltipsEnabled: true,
      helpEnabled: true,
      showShortcutHints: true,
      currentPage: '/',
      activeHelpTopic: null,
      isHelpWidgetOpen: false,

      dismissBadge: (badgeId: string) => {
        set((state) => ({
          dismissedBadges: [...state.dismissedBadges, badgeId],
          featureBadges: state.featureBadges.map(badge =>
            badge.id === badgeId ? { ...badge, dismissedAt: Date.now() } : badge
          ),
        }));
      },

      markTooltipSeen: (tooltipId: string) => {
        set((state) => ({
          tooltipsSeen: [...state.tooltipsSeen, tooltipId],
        }));
      },

      toggleTooltips: () => {
        set((state) => ({ tooltipsEnabled: !state.tooltipsEnabled }));
      },

      toggleShortcutHints: () => {
        set((state) => ({ showShortcutHints: !state.showShortcutHints }));
      },

      setCurrentPage: (page: string) => {
        set({ currentPage: page });
      },

      setActiveHelpTopic: (topic: HelpTopic | null) => {
        set({ activeHelpTopic: topic });
      },

      toggleHelpWidget: () => {
        set((state) => ({ isHelpWidgetOpen: !state.isHelpWidgetOpen }));
      },

      openHelpWidget: () => {
        set({ isHelpWidgetOpen: true });
      },

      closeHelpWidget: () => {
        set({ isHelpWidgetOpen: false });
      },

      resetAllHelp: () => {
        set({
          dismissedBadges: [],
          tooltipsSeen: [],
          featureBadges: featureBadgeConfig.map(badge => ({ ...badge, dismissedAt: null })),
        });
      },
    }),
    {
      name: 'agentx-help-storage',
      partialize: (state) => ({
        dismissedBadges: state.dismissedBadges,
        tooltipsSeen: state.tooltipsSeen,
        tooltipsEnabled: state.tooltipsEnabled,
        helpEnabled: state.helpEnabled,
        showShortcutHints: state.showShortcutHints,
      }),
    }
  )
);

// Helper hook to get active badges for current page
export function useActiveBadgesForPage(page: string): FeatureBadge[] {
  const { featureBadges, dismissedBadges } = useHelpStore();
  return featureBadges.filter(
    badge => badge.page === page && !dismissedBadges.includes(badge.id)
  );
}

// Helper hook to check if tooltip should be shown
export function useShouldShowTooltip(tooltipId: string): boolean {
  const { tooltipsEnabled, tooltipsSeen } = useHelpStore();
  return tooltipsEnabled && !tooltipsSeen.includes(tooltipId);
}
