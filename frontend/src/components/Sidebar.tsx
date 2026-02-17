import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  CheckSquare,
  Workflow,
  FolderOpen,
  Plug,
  Brain,
  ScrollText,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useAppStore } from '../stores/appStore';
import { cn } from '../utils/cn';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Bot,
  CheckSquare,
  Workflow,
  FolderOpen,
  Plug,
  Brain,
  ScrollText,
  BarChart3,
  Settings,
};

const sidebarItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/' },
  { id: 'agents', label: 'Agents', icon: 'Bot', path: '/agents' },
  { id: 'tasks', label: 'Tasks', icon: 'CheckSquare', path: '/tasks' },
  { id: 'workflows', label: 'Workflows', icon: 'Workflow', path: '/workflows' },
  { id: 'projects', label: 'Projects', icon: 'FolderOpen', path: '/projects' },
  { id: 'integrations', label: 'Integrations', icon: 'Plug', path: '/integrations' },
  { id: 'memory', label: 'Memory', icon: 'Brain', path: '/memory' },
  { id: 'logs', label: 'Logs', icon: 'ScrollText', path: '/logs' },
  { id: 'analytics', label: 'Analytics', icon: 'BarChart3', path: '/analytics' },
  { id: 'settings', label: 'Settings', icon: 'Settings', path: '/settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, activeProject } = useAppStore();
  
  // Determine active item from current path
  const currentPath = location.pathname;
  const activeItem = sidebarItems.find(item => item.path === currentPath)?.id || 'dashboard';

  const handleNewProject = () => {
    navigate('/projects');
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'fixed left-0 top-0 h-full z-50',
        'bg-glass-light/90 dark:bg-glass-dark/90 backdrop-blur-apple',
        'border-r border-glass-border dark:border-glass-border-dark',
        'flex flex-col'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-glass-border dark:border-glass-border-dark">
        <AnimatePresence mode="wait">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2"
            >
              <span className="text-xl font-bold">AgentX</span>
              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">βeta</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {sidebarItems.map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <SidebarItem
              key={item.id}
              icon={<Icon className="w-5 h-5" />}
              label={item.label}
              active={activeItem === item.id}
              collapsed={sidebarCollapsed}
              onClick={() => navigate(item.path)}
            />
          );
        })}
      </nav>

      {/* Project Context */}
      <div className="p-2 border-t border-glass-border dark:border-glass-border-dark">
        {activeProject ? (
          <div
            className={cn(
              'flex items-center gap-2 p-2 rounded-apple',
              'bg-accent/10 dark:bg-accent/20',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <div className="w-2 h-2 rounded-full bg-accent" />
            {!sidebarCollapsed && (
              <div className="truncate">
                <p className="text-sm font-medium text-accent truncate">Project Locked</p>
                <p className="text-xs text-foreground-secondary truncate">{activeProject.path}</p>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleNewProject}
            className={cn(
              'flex items-center gap-2 w-full p-2 rounded-apple',
              'text-foreground-secondary dark:text-foreground-secondary-dark',
              'hover:bg-background-secondary dark:hover:bg-background-secondary-dark',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <Plus className="w-4 h-4" />
            {!sidebarCollapsed && <span className="text-sm">New Project</span>}
          </button>
        )}
      </div>
    </motion.aside>
  );
}
