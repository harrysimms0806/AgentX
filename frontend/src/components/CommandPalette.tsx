import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, X, Command, Home, Bot, ListTodo, Workflow as WorkflowIcon, Folder, 
  Plug, Brain, ScrollText, Settings, FileText, Plus, Moon, RefreshCw,
  ArrowRight, Keyboard
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useAppStore } from '../stores/appStore';
import { toast } from './Toast';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  category: string;
  keywords: string[];
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  
  const { agents, tasks, projects } = useAppStore();

  // Build command list
  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      subtitle: 'View system overview and stats',
      icon: Home,
      shortcut: 'G D',
      action: () => { navigate('/'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['home', 'main', 'overview', 'stats'],
    },
    {
      id: 'nav-agents',
      title: 'Go to Agents',
      subtitle: 'Manage AI agents',
      icon: Bot,
      shortcut: 'G A',
      action: () => { navigate('/agents'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['agents', 'bots', 'ai'],
    },
    {
      id: 'nav-tasks',
      title: 'Go to Tasks',
      subtitle: 'View task queue',
      icon: ListTodo,
      shortcut: 'G T',
      action: () => { navigate('/tasks'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['tasks', 'queue', 'jobs'],
    },
    {
      id: 'nav-workflows',
      title: 'Go to Workflows',
      subtitle: 'Manage automation workflows',
      icon: WorkflowIcon,
      shortcut: 'G W',
      action: () => { navigate('/workflows'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['workflows', 'automation', 'flows'],
    },
    {
      id: 'nav-projects',
      title: 'Go to Projects',
      subtitle: 'View all projects',
      icon: Folder,
      shortcut: 'G P',
      action: () => { navigate('/projects'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['projects', 'folders', 'workspaces'],
    },
    {
      id: 'nav-integrations',
      title: 'Go to Integrations',
      subtitle: 'Manage connected services',
      icon: Plug,
      shortcut: 'G I',
      action: () => { navigate('/integrations'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['integrations', 'services', 'apis', 'connections'],
    },
    {
      id: 'nav-memory',
      title: 'Go to Memory',
      subtitle: 'View conversation history',
      icon: Brain,
      shortcut: 'G M',
      action: () => { navigate('/memory'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['memory', 'history', 'conversations'],
    },
    {
      id: 'nav-logs',
      title: 'Go to Logs',
      subtitle: 'View system logs',
      icon: ScrollText,
      shortcut: 'G L',
      action: () => { navigate('/logs'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['logs', 'audit', 'history'],
    },
    {
      id: 'nav-settings',
      title: 'Go to Settings',
      subtitle: 'Configure AgentX',
      icon: Settings,
      shortcut: 'G S',
      action: () => { navigate('/settings'); setIsOpen(false); },
      category: 'Navigation',
      keywords: ['settings', 'config', 'preferences'],
    },
    
    // Actions
    {
      id: 'action-new-agent',
      title: 'Create New Agent',
      subtitle: 'Add a new AI agent',
      icon: Bot,
      shortcut: '⌘ ⇧ A',
      action: () => { navigate('/agents'); setIsOpen(false); },
      category: 'Actions',
      keywords: ['create', 'new', 'agent', 'bot', 'add'],
    },
    {
      id: 'action-new-task',
      title: 'Create New Task',
      subtitle: 'Add a task to the queue',
      icon: Plus,
      shortcut: '⌘ ⇧ T',
      action: () => { navigate('/tasks'); setIsOpen(false); },
      category: 'Actions',
      keywords: ['create', 'new', 'task', 'job', 'add'],
    },
    {
      id: 'action-new-project',
      title: 'Create New Project',
      subtitle: 'Create a new workspace',
      icon: Folder,
      shortcut: '⌘ ⇧ P',
      action: () => { navigate('/projects'); setIsOpen(false); },
      category: 'Actions',
      keywords: ['create', 'new', 'project', 'workspace', 'add'],
    },
    {
      id: 'action-new-workflow',
      title: 'Create New Workflow',
      subtitle: 'Build automation',
      icon: WorkflowIcon,
      shortcut: '⌘ ⇧ W',
      action: () => { navigate('/workflows'); setIsOpen(false); },
      category: 'Actions',
      keywords: ['create', 'new', 'workflow', 'automation', 'add'],
    },
    
    // Quick Actions
    {
      id: 'quick-toggle-theme',
      title: 'Toggle Dark Mode',
      subtitle: 'Switch between light and dark theme',
      icon: Moon,
      shortcut: '⌘ ⇧ L',
      action: () => {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');
        if (isDark) {
          html.classList.remove('dark');
          toast.info('Theme changed: Light mode enabled');
        } else {
          html.classList.add('dark');
          toast.info('Theme changed: Dark mode enabled');
        }
        setIsOpen(false);
      },
      category: 'Quick Actions',
      keywords: ['theme', 'dark', 'light', 'mode', 'toggle', 'night'],
    },
    {
      id: 'quick-refresh',
      title: 'Refresh Data',
      subtitle: 'Reload all dashboard data',
      icon: RefreshCw,
      shortcut: '⌘ R',
      action: () => {
        toast.info('Refreshing dashboard data...');
        window.location.reload();
      },
      category: 'Quick Actions',
      keywords: ['refresh', 'reload', 'update', 'sync'],
    },
    {
      id: 'quick-keyboard-help',
      title: 'Keyboard Shortcuts',
      subtitle: 'View all available shortcuts',
      icon: Keyboard,
      shortcut: '?',
      action: () => {
        setIsOpen(false);
        // The KeyboardShortcutsHelp component listens for ? key
        // We'll simulate that
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      },
      category: 'Quick Actions',
      keywords: ['keyboard', 'shortcuts', 'help', 'hotkeys', 'commands'],
    },
  ];

  // Add dynamic commands from store
  const dynamicCommands: CommandItem[] = [
    ...agents.slice(0, 5).map((agent) => ({
      id: `agent-${agent.id}`,
      title: agent.name,
      subtitle: `Agent • ${agent.provider}`,
      icon: Bot,
      action: () => { navigate('/agents'); setIsOpen(false); },
      category: 'Agents',
      keywords: ['agent', agent.name.toLowerCase(), agent.provider.toLowerCase()],
    })),
    
    ...tasks.slice(0, 5).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      subtitle: `Task • ${task.status}`,
      icon: FileText,
      action: () => { navigate('/tasks'); setIsOpen(false); },
      category: 'Tasks',
      keywords: ['task', task.title.toLowerCase(), task.status.toLowerCase()],
    })),
    
    ...projects.slice(0, 5).map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: 'Project',
      icon: Folder,
      action: () => { navigate('/projects'); setIsOpen(false); },
      category: 'Projects',
      keywords: ['project', project.name.toLowerCase()],
    })),
  ];

  const allCommands = [...commands, ...dynamicCommands];

  // Filter commands based on query
  const filteredCommands = query.trim() === '' 
    ? allCommands
    : allCommands.filter(cmd => {
        const searchTerms = query.toLowerCase().split(' ');
        const searchString = `${cmd.title} ${cmd.subtitle || ''} ${cmd.keywords.join(' ')}`.toLowerCase();
        return searchTerms.every(term => searchString.includes(term));
      });

  // Group by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  const categories = Object.keys(groupedCommands);
  const flatCommands = categories.flatMap(cat => groupedCommands[cat]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      
      // Escape to close
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
      
      // Navigation shortcuts when open
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % flatCommands.length);
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + flatCommands.length) % flatCommands.length);
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const selected = flatCommands[selectedIndex];
          if (selected) {
            selected.action();
          }
        }
      }
      
      // Quick navigation: G + letter
      if (!isOpen && e.key.toLowerCase() === 'g') {
        const navKeys: Record<string, string> = {
          'd': '/',
          'a': '/agents',
          't': '/tasks',
          'w': '/workflows',
          'p': '/projects',
          'i': '/integrations',
          'm': '/memory',
          'l': '/logs',
          's': '/settings',
        };
        
        const handler = (ev: KeyboardEvent) => {
          const path = navKeys[ev.key.toLowerCase()];
          if (path) {
            ev.preventDefault();
            navigate(path);
          }
          window.removeEventListener('keydown', handler);
        };
        
        window.addEventListener('keydown', handler, { once: true });
        setTimeout(() => window.removeEventListener('keydown', handler), 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatCommands, selectedIndex, navigate]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Render shortcut keys
  const renderShortcut = (shortcut?: string) => {
    if (!shortcut) return null;
    return (
      <div className="flex items-center gap-1">
        {shortcut.split(' ').map((key, i) => (
          <kbd key={i} className="px-1.5 py-0.5 text-xs rounded bg-background-secondary dark:bg-background-secondary-dark border border-glass-border">
            {key}
          </kbd>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Command button in header or floating */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-40 p-3 rounded-full glass-card hover:shadow-lg transition-all group"
        title="Command Palette (⌘K)"
      >
        <Command className="w-5 h-5 text-foreground-secondary group-hover:text-accent transition-colors" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[600px] max-h-[80vh] z-50"
            >
              <div className="glass-card overflow-hidden flex flex-col max-h-[80vh]">
                {/* Search input */}
                <div className="flex items-center gap-3 p-4 border-b border-glass-border dark:border-glass-border-dark">
                  <Search className="w-5 h-5 text-foreground-secondary" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search commands, agents, tasks..."
                    className="flex-1 bg-transparent border-none outline-none text-lg placeholder:text-foreground-secondary"
                  />
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                  >
                    <X className="w-4 h-4 text-foreground-secondary" />
                  </button>
                </div>

                {/* Results */}
                <div className="overflow-y-auto flex-1 p-2">
                  {flatCommands.length === 0 ? (
                    <div className="p-8 text-center text-foreground-secondary">
                      <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No results found for "{query}"</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {categories.map((category) => (
                        <div key={category}>
                          <h3 className="px-3 py-2 text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
                            {category}
                          </h3>
                          <div className="space-y-1">
                            {groupedCommands[category].map((cmd) => {
                              const globalIndex = flatCommands.findIndex(c => c.id === cmd.id);
                              const isSelected = globalIndex === selectedIndex;
                              const Icon = cmd.icon;
                              
                              return (
                                <button
                                  key={cmd.id}
                                  onClick={() => {
                                    cmd.action();
                                    setIsOpen(false);
                                  }}
                                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                                    isSelected 
                                      ? "bg-accent text-white" 
                                      : "hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                                  )}
                                >
                                  <div className={cn(
                                    "p-2 rounded-lg",
                                    isSelected ? "bg-white/20" : "bg-background-secondary dark:bg-background-secondary-dark"
                                  )}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{cmd.title}</p>
                                    {cmd.subtitle && (
                                      <p className={cn(
                                        "text-sm truncate",
                                        isSelected ? "text-white/70" : "text-foreground-secondary"
                                      )}>
                                        {cmd.subtitle}
                                      </p>
                                    )}
                                  </div>
                                  
                                  {isSelected ? (
                                    <ArrowRight className="w-4 h-4" />
                                  ) : cmd.shortcut ? (
                                    renderShortcut(cmd.shortcut)
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-glass-border dark:border-glass-border-dark text-xs text-foreground-secondary">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-background-secondary">↑↓</kbd>
                      to navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-background-secondary">↵</kbd>
                      to select
                    </span>
                  </div>
                  <span>{flatCommands.length} results</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
