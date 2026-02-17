import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  CheckSquare,
  Bot,
  FolderOpen,
  Workflow,
} from 'lucide-react';
import { cn } from '../utils/cn';

interface QuickAction {
  id: string;
  label: string;
  icon: typeof Plus;
  path: string;
  color: string;
}

const quickActions: QuickAction[] = [
  {
    id: 'task',
    label: 'New Task',
    icon: CheckSquare,
    path: '/tasks',
    color: 'bg-green-500 hover:bg-green-600',
  },
  {
    id: 'agent',
    label: 'New Agent',
    icon: Bot,
    path: '/agents',
    color: 'bg-purple-500 hover:bg-purple-600',
  },
  {
    id: 'project',
    label: 'New Project',
    icon: FolderOpen,
    path: '/projects',
    color: 'bg-amber-500 hover:bg-amber-600',
  },
  {
    id: 'workflow',
    label: 'New Workflow',
    icon: Workflow,
    path: '/workflows',
    color: 'bg-blue-500 hover:bg-blue-600',
  },
];

export function QuickActions() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleActionClick = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/10 dark:bg-black/20 backdrop-blur-sm -z-10"
              style={{ margin: '-100vmax', padding: '100vmax' }}
            />

            {/* Action Buttons */}
            <div className="absolute bottom-16 right-0 flex flex-col-reverse gap-3 items-end">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.05,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                    className="flex items-center gap-3"
                  >
                    {/* Label */}
                    <motion.span
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: index * 0.05 + 0.1 }}
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium rounded-lg',
                        'bg-glass-light dark:bg-glass-dark',
                        'border border-glass-border dark:border-glass-border-dark',
                        'shadow-lg whitespace-nowrap'
                      )}
                    >
                      {action.label}
                    </motion.span>

                    {/* Button */}
                    <button
                      onClick={() => handleActionClick(action.path)}
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        'text-white shadow-lg transition-all duration-200',
                        'hover:scale-110 active:scale-95',
                        action.color
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Main FAB */}
      <motion.button
        onClick={toggleOpen}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ rotate: isOpen ? 45 : 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'w-14 h-14 rounded-full flex items-center justify-center',
          'bg-accent hover:bg-accent/90 text-white',
          'shadow-xl shadow-accent/30',
          'transition-colors duration-200',
          isOpen && 'bg-red-500 hover:bg-red-600 shadow-red-500/30'
        )}
      >
        <Plus className="w-6 h-6" />
      </motion.button>
    </div>
  );
}
