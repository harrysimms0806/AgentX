import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HelpCircle, 
  X, 
  BookOpen, 
  Keyboard, 
  MessageCircle, 
  Lightbulb,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useHelpStore, pageHelpTopics } from '../stores/helpStore';
import { useLocation } from 'react-router-dom';

interface HelpArticle {
  id: string;
  title: string;
  category: 'getting-started' | 'features' | 'shortcuts' | 'troubleshooting';
  content: string;
  icon: React.ReactNode;
}

const helpArticles: HelpArticle[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    category: 'getting-started',
    content: 'AgentX is your universal AI agent management platform. Start by creating your first agent or exploring the dashboard.',
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    category: 'shortcuts',
    content: 'Press ⌘+K for the command palette, ⌘+⇧+L to toggle theme, G then letter to navigate pages. Press ? for full list.',
    icon: <Keyboard className="w-4 h-4" />,
  },
  {
    id: 'creating-agents',
    title: 'Creating Agents',
    category: 'features',
    content: 'Agents are AI workers. Click the + button or press ⌘+⇧+N to create one. Configure their capabilities and permissions.',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  {
    id: 'workflows',
    title: 'Building Workflows',
    category: 'features',
    content: 'Use the visual workflow builder to create automated processes. Drag nodes, connect them, and set triggers.',
    icon: <Lightbulb className="w-4 h-4" />,
  },
  {
    id: 'troubleshooting',
    title: 'Common Issues',
    category: 'troubleshooting',
    content: 'If an agent shows "Error" status, check the logs. Use System Health monitor to verify all services are running.',
    icon: <AlertCircle className="w-4 h-4" />,
  },
];

export function ContextualHelpWidget() {
  const location = useLocation();
  const { 
    isHelpWidgetOpen, 
    toggleHelpWidget, 
    closeHelpWidget,
    setCurrentPage,
    showShortcutHints,
    toggleShortcutHints,
    tooltipsEnabled,
    toggleTooltips,
    resetAllHelp,
  } = useHelpStore();
  
  const [activeTab, setActiveTab] = useState<'current' | 'articles' | 'shortcuts'>('current');
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Update current page in store
  useEffect(() => {
    setCurrentPage(location.pathname);
  }, [location.pathname, setCurrentPage]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        widgetRef.current &&
        !widgetRef.current.contains(event.target as Node)
      ) {
        closeHelpWidget();
      }
    };

    if (isHelpWidgetOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHelpWidgetOpen, closeHelpWidget]);

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? key to toggle help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        toggleHelpWidget();
      }
      
      // Escape to close
      if (e.key === 'Escape' && isHelpWidgetOpen) {
        closeHelpWidget();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isHelpWidgetOpen, toggleHelpWidget, closeHelpWidget]);

  const currentPageHelp = pageHelpTopics[location.pathname];

  const getPageIcon = (path: string) => {
    switch (path) {
      case '/agents': return '🤖';
      case '/tasks': return '✅';
      case '/workflows': return '⚡';
      case '/projects': return '📁';
      case '/integrations': return '🔗';
      case '/memory': return '🧠';
      case '/logs': return '📋';
      case '/analytics': return '📊';
      case '/settings': return '⚙️';
      default: return '🏠';
    }
  };

  const renderCurrentPageHelp = () => {
    if (!currentPageHelp) {
      return (
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-muted dark:bg-muted-dark flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6 text-muted-foreground dark:text-muted-foreground-dark" />
          </div>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-dark">
            No specific help available for this page.
          </p>
          <button
            onClick={() => setActiveTab('articles')}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Browse help articles
          </button>
        </div>
      );
    }

    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{getPageIcon(location.pathname)}</span>
          <div>
            <h3 className="font-semibold text-foreground dark:text-foreground-dark">
              {currentPageHelp.title}
            </h3>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-dark">
              Current Page
            </p>
          </div>
        </div>
        
        <p className="text-sm text-foreground dark:text-foreground-dark mb-4 leading-relaxed">
          {currentPageHelp.content}
        </p>
        
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-dark uppercase tracking-wider">
            Quick Tips
          </h4>
          {currentPageHelp.tips.map((tip, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Lightbulb className="w-2.5 h-2.5 text-primary" />
              </div>
              <p className="text-xs text-foreground dark:text-foreground-dark">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderArticles = () => {
    if (selectedArticle) {
      return (
        <div className="p-4">
          <button
            onClick={() => setSelectedArticle(null)}
            className="flex items-center gap-1 text-xs text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark transition-colors mb-4"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to articles
          </button>
          
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {selectedArticle.icon}
            </div>
            <h3 className="font-semibold text-foreground dark:text-foreground-dark">
              {selectedArticle.title}
            </h3>
          </div>
          
          <p className="text-sm text-foreground dark:text-foreground-dark leading-relaxed">
            {selectedArticle.content}
          </p>
        </div>
      );
    }

    const categories = ['getting-started', 'features', 'shortcuts', 'troubleshooting'] as const;
    const categoryLabels: Record<typeof categories[number], string> = {
      'getting-started': 'Getting Started',
      'features': 'Features',
      'shortcuts': 'Shortcuts',
      'troubleshooting': 'Troubleshooting',
    };

    return (
      <div className="p-2">
        {categories.map((category) => {
          const categoryArticles = helpArticles.filter(a => a.category === category);
          if (categoryArticles.length === 0) return null;

          return (
            <div key={category} className="mb-3">
              <h4 className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-dark uppercase tracking-wider px-2 mb-1">
                {categoryLabels[category]}
              </h4>
              <div className="space-y-0.5">
                {categoryArticles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted dark:hover:bg-muted-dark transition-colors text-left group"
                  >
                    <span className="text-muted-foreground dark:text-muted-foreground-dark group-hover:text-foreground dark:group-hover:text-foreground-dark transition-colors">
                      {article.icon}
                    </span>
                    <span className="text-sm text-foreground dark:text-foreground-dark flex-1">
                      {article.title}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderShortcuts = () => (
    <div className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground dark:text-foreground-dark">Show Shortcut Hints</span>
          <button
            onClick={toggleShortcutHints}
            className={cn(
              'relative w-10 h-5 rounded-full transition-colors',
              showShortcutHints ? 'bg-primary' : 'bg-muted dark:bg-muted-dark'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                showShortcutHints ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground dark:text-foreground-dark">Enable Help Tooltips</span>
          <button
            onClick={toggleTooltips}
            className={cn(
              'relative w-10 h-5 rounded-full transition-colors',
              tooltipsEnabled ? 'bg-primary' : 'bg-muted dark:bg-muted-dark'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                tooltipsEnabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>
      
      <hr className="my-4 border-border/50 dark:border-border-dark/50" />
      
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-dark uppercase tracking-wider">
          Common Shortcuts
        </h4>
        
        {[
          { keys: '⌘+K', action: 'Command Palette' },
          { keys: '⌘+⇧+L', action: 'Toggle Theme' },
          { keys: '⌘+⇧+N', action: 'Notifications' },
          { keys: '⌘+⇧+R', action: 'Recent & Favorites' },
          { keys: 'G then D', action: 'Go to Dashboard' },
          { keys: 'G then A', action: 'Go to Agents' },
          { keys: '?', action: 'Toggle Help' },
        ].map((shortcut, index) => (
          <div key={index} className="flex items-center justify-between py-1">
            <kbd className="px-2 py-0.5 rounded bg-muted dark:bg-muted-dark text-xs font-mono">
              {shortcut.keys}
            </kbd>
            <span className="text-xs text-muted-foreground dark:text-muted-foreground-dark">
              {shortcut.action}
            </span>
          </div>
        ))}
      </div>
      
      <hr className="my-4 border-border/50 dark:border-border-dark/50" />
      
      
      <button
        onClick={resetAllHelp}
        className="w-full py-2 text-xs text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark transition-colors"
      >
        Reset all help (show tooltips again)
      </button>
    </div>
  );

  return (
    <>
      {/* Floating Help Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleHelpWidget}
        className={cn(
          'fixed bottom-24 right-6 z-40',
          'w-12 h-12 rounded-full',
          'bg-gradient-to-br from-primary to-accent',
          'text-white shadow-lg shadow-primary/30',
          'flex items-center justify-center',
          'transition-shadow hover:shadow-xl hover:shadow-primary/40',
          isHelpWidgetOpen && 'ring-2 ring-white/50'
        )}
        aria-label="Toggle Help"
      >
        <AnimatePresence mode="wait">
          {isHelpWidgetOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-5 h-5" />
            </motion.div>
          ) : (
            <motion.div
              key="help"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HelpCircle className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Help Widget Panel */}
      <AnimatePresence>
        {isHelpWidgetOpen && (
          <motion.div
            ref={widgetRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
              'fixed bottom-40 right-6 z-40',
              'w-80 max-h-[70vh]',
              'bg-card dark:bg-card-dark',
              'rounded-2xl',
              'border border-border/50 dark:border-border-dark/50',
              'shadow-2xl',
              'overflow-hidden',
              'flex flex-col'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 dark:border-border-dark/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-foreground dark:text-foreground-dark">Help</span>
              </div>
              <button
                onClick={closeHelpWidget}
                className="p-1.5 rounded-lg hover:bg-muted dark:hover:bg-muted-dark transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground dark:text-muted-foreground-dark" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/50 dark:border-border-dark/50">
              {[
                { id: 'current', label: 'Current Page', icon: BookOpen },
                { id: 'articles', label: 'Articles', icon: MessageCircle },
                { id: 'shortcuts', label: 'Settings', icon: Keyboard },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as typeof activeTab);
                    setSelectedArticle(null);
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'current' && renderCurrentPageHelp()}
              {activeTab === 'articles' && renderArticles()}
              {activeTab === 'shortcuts' && renderShortcuts()}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border/50 dark:border-border-dark/50 bg-muted/30 dark:bg-muted-dark/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground dark:text-muted-foreground-dark">
                <span>Press ? to toggle</span>
                <a
                  href="#"
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    // Open full documentation
                  }}
                >
                  Full docs
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
