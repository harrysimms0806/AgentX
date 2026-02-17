import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, CheckCircle, AlertCircle, Info, AlertTriangle,
  Command, Keyboard
} from 'lucide-react';
import { cn } from '../utils/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const iconMap: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap: Record<ToastType, string> = {
  success: 'text-green-500 bg-green-500/10 border-green-500/20',
  error: 'text-red-500 bg-red-500/10 border-red-500/20',
  info: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = iconMap[toast.type];
  const colors = colorMap[toast.type];

  useEffect(() => {
    if (toast.duration !== Infinity) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      className={cn(
        'w-full max-w-sm p-4 rounded-xl border shadow-lg backdrop-blur-xl',
        'bg-glass-light/95 dark:bg-glass-dark/95',
        'border-glass-border dark:border-glass-border-dark',
        colors
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', colors)}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground dark:text-foreground-dark">
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-sm text-foreground-secondary mt-1">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="text-sm font-medium mt-2 hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        <button
          onClick={() => onDismiss(toast.id)}
          className="p-1 rounded hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors"
        >
          <X className="w-4 h-4 text-foreground-secondary" />
        </button>
      </div>
    </motion.div>
  );
}

// Global toast state
let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...toasts]));
};

export const toast = {
  success: (title: string, description?: string, options?: Partial<Omit<Toast, 'id' | 'title' | 'description' | 'type'>>) => {
    const id = Math.random().toString(36).substring(2, 9);
    toasts = [...toasts, { id, title, description, type: 'success', ...options }];
    notifyListeners();
    return id;
  },
  error: (title: string, description?: string, options?: Partial<Omit<Toast, 'id' | 'title' | 'description' | 'type'>>) => {
    const id = Math.random().toString(36).substring(2, 9);
    toasts = [...toasts, { id, title, description, type: 'error', ...options }];
    notifyListeners();
    return id;
  },
  info: (title: string, description?: string, options?: Partial<Omit<Toast, 'id' | 'title' | 'description' | 'type'>>) => {
    const id = Math.random().toString(36).substring(2, 9);
    toasts = [...toasts, { id, title, description, type: 'info', ...options }];
    notifyListeners();
    return id;
  },
  warning: (title: string, description?: string, options?: Partial<Omit<Toast, 'id' | 'title' | 'description' | 'type'>>) => {
    const id = Math.random().toString(36).substring(2, 9);
    toasts = [...toasts, { id, title, description, type: 'warning', ...options }];
    notifyListeners();
    return id;
  },
  dismiss: (id: string) => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  },
};

export function ToastContainer() {
  const [localToasts, setLocalToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setLocalToasts(newToasts);
    toastListeners.push(listener);
    setLocalToasts([...toasts]);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  const handleDismiss = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {localToasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={handleDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Keyboard Shortcuts Help Panel
interface ShortcutCategory {
  name: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const shortcuts: ShortcutCategory[] = [
  {
    name: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close modal/palette' },
      { keys: ['⌘', '⇧', 'L'], description: 'Toggle dark mode' },
    ],
  },
  {
    name: 'Navigation',
    shortcuts: [
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'A'], description: 'Go to Agents' },
      { keys: ['G', 'T'], description: 'Go to Tasks' },
      { keys: ['G', 'W'], description: 'Go to Workflows' },
      { keys: ['G', 'P'], description: 'Go to Projects' },
      { keys: ['G', 'I'], description: 'Go to Integrations' },
      { keys: ['G', 'M'], description: 'Go to Memory' },
      { keys: ['G', 'L'], description: 'Go to Logs' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
  {
    name: 'Actions',
    shortcuts: [
      { keys: ['⌘', '⇧', 'A'], description: 'Create new agent' },
      { keys: ['⌘', '⇧', 'T'], description: 'Create new task' },
      { keys: ['⌘', '⇧', 'P'], description: 'Create new project' },
      { keys: ['⌘', '⇧', 'W'], description: 'Create new workflow' },
      { keys: ['⌘', 'R'], description: 'Refresh data' },
    ],
  },
  {
    name: 'Command Palette',
    shortcuts: [
      { keys: ['↑', '↓'], description: 'Navigate results' },
      { keys: ['Enter'], description: 'Select command' },
      { keys: ['Esc'], description: 'Close palette' },
    ],
  },
];

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? key to open help (not in input)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setIsOpen(true);
      }
      
      // Close on escape
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {/* Help button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-20 z-40 p-3 rounded-full glass-card hover:shadow-lg transition-all group"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="w-5 h-5 text-foreground-secondary group-hover:text-accent transition-colors" />
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
              className="fixed inset-x-4 top-[5%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[700px] max-h-[90vh] z-50"
            >
              <div className="glass-card overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-glass-border dark:border-glass-border-dark">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <Command className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                      <p className="text-sm text-foreground-secondary">Master AgentX with these shortcuts</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors"
                  >
                    <X className="w-5 h-5 text-foreground-secondary" />
                  </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {shortcuts.map((category) => (
                      <div key={category.name}>
                        <h3 className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
                          {category.name}
                        </h3>
                        <div className="space-y-2">
                          {category.shortcuts.map((shortcut, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between py-2 border-b border-glass-border/50 last:border-0"
                            >
                              <span className="text-sm text-foreground-secondary">
                                {shortcut.description}
                              </span>
                              <div className="flex items-center gap-1">
                                {shortcut.keys.map((key, keyIdx) => (
                                  <kbd
                                    key={keyIdx}
                                    className="px-2 py-1 text-xs font-medium rounded bg-background-secondary dark:bg-background-secondary-dark border border-glass-border"
                                  >
                                    {key}
                                  </kbd>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-glass-border dark:border-glass-border-dark bg-background-secondary/50 dark:bg-background-secondary-dark/50">
                  <p className="text-sm text-foreground-secondary text-center">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-background">?</kbd> anytime to show this help
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
