import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Command, Info, Keyboard, X, XCircle } from 'lucide-react';
import { cn } from '../utils/cn';
import { type Toast, type ToastType, useToastStore } from '../stores/toastStore';

type ToastInput = Omit<Toast, 'id'> & { id?: string };

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const iconMap: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap: Record<ToastType, { accent: string; iconWrap: string; progress: string }> = {
  success: {
    accent: 'text-green-600 dark:text-green-400 border-green-400/30',
    iconWrap: 'bg-green-500/15 text-green-600 dark:text-green-400',
    progress: 'bg-green-500',
  },
  error: {
    accent: 'text-red-600 dark:text-red-400 border-red-400/30',
    iconWrap: 'bg-red-500/15 text-red-600 dark:text-red-400',
    progress: 'bg-red-500',
  },
  info: {
    accent: 'text-blue-600 dark:text-blue-400 border-blue-400/30',
    iconWrap: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    progress: 'bg-blue-500',
  },
  warning: {
    accent: 'text-amber-600 dark:text-amber-400 border-amber-400/30',
    iconWrap: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    progress: 'bg-amber-500',
  },
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = iconMap[toast.type];
  const colors = colorMap[toast.type];
  const duration = toast.duration ?? 4000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'glass-card relative w-full max-w-sm overflow-hidden p-4 shadow-xl',
        'bg-glass-light/90 dark:bg-glass-dark/90 border',
        colors.accent
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('rounded-xl p-2', colors.iconWrap)}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1 pr-2">
          <p className="text-sm font-medium text-foreground dark:text-foreground-dark">{toast.message}</p>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="mt-2 text-xs font-semibold text-accent hover:underline"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss toast"
          className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-secondary/70 dark:hover:bg-background-secondary-dark/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {Number.isFinite(duration) && duration > 0 ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-background-secondary/70 dark:bg-background-secondary-dark/70">
          <motion.div
            className={cn('h-full', colors.progress)}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: duration / 1000, ease: 'linear' }}
          />
        </div>
      ) : null}
    </motion.div>
  );
}

export function useToast() {
  const addToast = useToastStore((state) => state.addToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const clearAll = useToastStore((state) => state.clearAll);

  return useMemo(
    () => ({
      addToast,
      removeToast,
      clearAll,
      success: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
        addToast({ type: 'success', message, ...options }),
      error: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
        addToast({ type: 'error', message, ...options }),
      info: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
        addToast({ type: 'info', message, ...options }),
      warning: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
        addToast({ type: 'warning', message, ...options }),
    }),
    [addToast, clearAll, removeToast]
  );
}

export const toast = {
  addToast: (toastInput: ToastInput) => useToastStore.getState().addToast(toastInput),
  removeToast: (id: string) => useToastStore.getState().removeToast(id),
  clearAll: () => useToastStore.getState().clearAll(),
  success: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
    useToastStore.getState().addToast({ type: 'success', message, ...options }),
  error: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
    useToastStore.getState().addToast({ type: 'error', message, ...options }),
  info: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
    useToastStore.getState().addToast({ type: 'info', message, ...options }),
  warning: (message: string, options?: Omit<ToastInput, 'type' | 'message'>) =>
    useToastStore.getState().addToast({ type: 'warning', message, ...options }),
  dismiss: (id: string) => useToastStore.getState().removeToast(id),
};

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  const handleDismiss = useCallback(
    (id: string) => {
      removeToast(id);
    },
    [removeToast]
  );

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-full max-w-sm flex-col gap-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((toastItem) => (
          <div key={toastItem.id} className="pointer-events-auto">
            <ToastItem toast={toastItem} onDismiss={handleDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        setIsOpen(true);
      }

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-20 z-40 rounded-full glass-card p-3 transition-all hover:shadow-lg group"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="h-5 w-5 text-foreground-secondary transition-colors group-hover:text-accent" />
      </button>

      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[5%] z-50 max-h-[90vh] md:left-1/2 md:w-[700px] md:-translate-x-1/2 md:inset-x-auto"
            >
              <div className="glass-card flex max-h-[90vh] flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-glass-border p-4 dark:border-glass-border-dark">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-accent/10 p-2">
                      <Command className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                      <p className="text-sm text-foreground-secondary">Master AgentX with these shortcuts</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg p-2 transition-colors hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                  >
                    <X className="h-5 w-5 text-foreground-secondary" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {shortcuts.map((category) => (
                      <div key={category.name}>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-secondary">
                          {category.name}
                        </h3>
                        <div className="space-y-2">
                          {category.shortcuts.map((shortcut, index) => (
                            <div
                              key={`${category.name}-${index}`}
                              className="flex items-center justify-between border-b border-glass-border/50 py-2 last:border-0"
                            >
                              <span className="text-sm text-foreground-secondary">{shortcut.description}</span>
                              <div className="flex items-center gap-1">
                                {shortcut.keys.map((key, keyIndex) => (
                                  <kbd
                                    key={`${key}-${keyIndex}`}
                                    className="rounded border border-glass-border bg-background-secondary px-2 py-1 text-xs font-medium dark:bg-background-secondary-dark"
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

                <div className="border-t border-glass-border bg-background-secondary/50 px-6 py-4 dark:border-glass-border-dark dark:bg-background-secondary-dark/50">
                  <p className="text-center text-sm text-foreground-secondary">
                    Press <kbd className="rounded bg-background px-1.5 py-0.5">?</kbd> anytime to show this help
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
