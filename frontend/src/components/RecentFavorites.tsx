import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Star,
  X,
  Search,
  Trash2,
  History,
  Bot,
  CheckSquare,
  FolderOpen,
  Workflow,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../utils/cn';
import {
  useRecentStore,
  type RecentItem,
  type ItemType,
  typeColors,
  typeLabels,
} from '../stores/recentStore';
import { toast } from './Toast';

// Icon mapping
const iconMap: Record<ItemType, React.ElementType> = {
  agent: Bot,
  task: CheckSquare,
  project: FolderOpen,
  workflow: Workflow,
};

// Empty state component
function EmptyState({
  tab,
}: {
  tab: 'recent' | 'favorites';
}) {
  const isRecent = tab === 'recent';
  
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4 rounded-full bg-background-secondary dark:bg-background-secondary-dark p-4">
        {isRecent ? (
          <History className="w-8 h-8 text-foreground-secondary" />
        ) : (
          <Star className="w-8 h-8 text-foreground-secondary" />
        )}
      </div>
      <p className="text-foreground-secondary font-medium mb-1">
        {isRecent ? 'No recent items' : 'No favorites yet'}
      </p>
      <p className="text-sm text-foreground-secondary/70 max-w-[200px]">
        {isRecent
          ? 'Items you view will appear here for quick access'
          : 'Star items to add them to your favorites for instant access'}
      </p>
    </div>
  );
}

// Individual item row
function ItemRow({
  item,
  onNavigate,
  onToggleFavorite,
  onRemove,
  showRemove = false,
}: {
  item: RecentItem;
  onNavigate: (path: string) => void;
  onToggleFavorite: (item: RecentItem) => void;
  onRemove?: (id: string) => void;
  showRemove?: boolean;
}) {
  const Icon = iconMap[item.type];
  const colors = typeColors[item.type];
  
  // Format relative time
  const getRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group"
    >
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer',
          'hover:bg-background-secondary dark:hover:bg-background-secondary-dark',
          'border border-transparent hover:border-glass-border'
        )}
        onClick={() => onNavigate(item.path)}
      >
        {/* Icon */}
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            colors.bg
          )}
        >
          {item.icon ? (
            <span className="text-lg">{item.icon}</span>
          ) : (
            <Icon className={cn('w-5 h-5', colors.text)} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-foreground dark:text-foreground-dark">
            {item.title}
          </p>
          <div className="flex items-center gap-2 text-xs text-foreground-secondary">
            <span className={cn('px-1.5 py-0.5 rounded-full', colors.bg, colors.text)}>
              {typeLabels[item.type]}
            </span>
            {item.subtitle && (
              <span className="truncate">{item.subtitle}</span>
            )}
          </div>
        </div>

        {/* Time */}
        <div className="text-xs text-foreground-secondary shrink-0 hidden sm:block">
          {getRelativeTime(item.timestamp)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item);
            }}
            className={cn(
              'p-2 rounded-lg transition-colors',
              item.isFavorite
                ? 'text-amber-500 hover:bg-amber-500/10'
                : 'text-foreground-secondary hover:text-amber-500 hover:bg-amber-500/10'
            )}
            title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              className={cn('w-4 h-4', item.isFavorite && 'fill-current')}
            />
          </button>
          
          {showRemove && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="p-2 rounded-lg text-foreground-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Remove from history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Arrow indicator */}
        <ChevronRight className="w-4 h-4 text-foreground-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}

// Main component
export function RecentFavorites() {
  const navigate = useNavigate();
  const {
    recentItems,
    favorites,
    isPanelOpen,
    activeTab,
    togglePanel,
    closePanel,
    setActiveTab,
    toggleFavorite,
    removeRecentItem,
    clearRecentItems,
    getFilteredItems,
  } = useRecentStore();

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter items based on query
  const filtered = query.trim()
    ? getFilteredItems(query)
    : { recent: recentItems, favorites };

  // Keyboard shortcut to open panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+R to toggle panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        togglePanel();
      }
      
      // Escape to close
      if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, togglePanel, closePanel]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isPanelOpen]);

  const handleNavigate = (path: string) => {
    navigate(path);
    closePanel();
  };

  const handleClearAll = () => {
    if (confirm('Clear all recent items?')) {
      clearRecentItems();
      toast.success('Recent items cleared');
    }
  };

  const hasRecent = filtered.recent.length > 0;
  const hasFavorites = filtered.favorites.length > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={togglePanel}
        className="fixed bottom-6 left-[152px] z-40 p-3 rounded-full glass-card hover:shadow-lg transition-all group"
        title="Recent & Favorites (⌘+Shift+R)"
      >
        <Clock className="w-5 h-5 text-foreground-secondary group-hover:text-accent transition-colors" />
        {favorites.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-medium">
            {favorites.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isPanelOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[650px] max-h-[80vh] z-50"
            >
              <div className="glass-card overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-glass-border dark:border-glass-border-dark">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <History className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Recent & Favorites</h2>
                      <p className="text-sm text-foreground-secondary">
                        Quick access to your work
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closePanel}
                    className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors"
                  >
                    <X className="w-5 h-5 text-foreground-secondary" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-glass-border dark:border-glass-border-dark">
                  <button
                    onClick={() => setActiveTab('recent')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative',
                      activeTab === 'recent'
                        ? 'text-accent'
                        : 'text-foreground-secondary hover:text-foreground'
                    )}
                  >
                    <History className="w-4 h-4" />
                    Recent
                    {recentItems.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-background-secondary dark:bg-background-secondary-dark">
                        {recentItems.length}
                      </span>
                    )}
                    {activeTab === 'recent' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                      />
                    )}
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('favorites')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative',
                      activeTab === 'favorites'
                        ? 'text-accent'
                        : 'text-foreground-secondary hover:text-foreground'
                    )}
                  >
                    <Star className="w-4 h-4" />
                    Favorites
                    {favorites.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                        {favorites.length}
                      </span>
                    )}
                    {activeTab === 'favorites' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                      />
                    )}
                  </button>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-glass-border dark:border-glass-border-dark">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search recent and favorites..."
                      className="w-full pl-10 pr-4 py-2 bg-background-secondary dark:bg-background-secondary-dark rounded-lg border border-glass-border dark:border-glass-border-dark focus:outline-none focus:border-accent transition-colors"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-glass-border/50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2">
                  {activeTab === 'recent' ? (
                    <>
                      {hasRecent ? (
                        <div className="space-y-1">
                          <AnimatePresence mode="popLayout">
                            {filtered.recent.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                onNavigate={handleNavigate}
                                onToggleFavorite={toggleFavorite}
                                onRemove={removeRecentItem}
                                showRemove
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <EmptyState tab="recent" />
                      )}
                    </>
                  ) : (
                    <>
                      {hasFavorites ? (
                        <div className="space-y-1">
                          <AnimatePresence mode="popLayout">
                            {filtered.favorites.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                onNavigate={handleNavigate}
                                onToggleFavorite={toggleFavorite}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <EmptyState tab="favorites" />
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-glass-border dark:border-glass-border-dark text-xs text-foreground-secondary">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-background-secondary">⌘⇧R</kbd>
                      toggle
                    </span>
                    <span className="flex items-center gap-1"
                    >
                      <kbd className="px-1.5 py-0.5 rounded bg-background-secondary">Esc</kbd>
                      close
                    </span>
                  </div>
                  
                  {activeTab === 'recent' && recentItems.length > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Compact favorites bar for sidebar (optional)
export function FavoritesBar() {
  const { favorites } = useRecentStore();
  const navigate = useNavigate();

  if (favorites.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {favorites.slice(0, 5).map((item) => {
          const Icon = iconMap[item.type];
          const colors = typeColors[item.type];
          
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
                'bg-background-secondary dark:bg-background-secondary-dark',
                'hover:bg-accent/10 hover:text-accent transition-colors'
              )}
              title={item.title}
            >
              <Icon className={cn('w-3 h-3', colors.text)} />
              <span className="max-w-[100px] truncate">{item.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RecentFavorites;
