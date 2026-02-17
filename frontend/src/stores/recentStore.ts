import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ItemType = 'agent' | 'task' | 'project' | 'workflow';

export interface RecentItem {
  id: string;
  type: ItemType;
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  path: string;
  timestamp: number;
  isFavorite?: boolean;
}

interface RecentState {
  // Recent items (max 20)
  recentItems: RecentItem[];
  // Favorites (no limit)
  favorites: RecentItem[];
  // UI state
  isPanelOpen: boolean;
  activeTab: 'recent' | 'favorites';
}

interface RecentActions {
  // Recent items
  addRecentItem: (item: Omit<RecentItem, 'timestamp'>) => void;
  removeRecentItem: (id: string) => void;
  clearRecentItems: () => void;
  
  // Favorites
  addToFavorites: (item: RecentItem) => void;
  removeFromFavorites: (id: string) => void;
  toggleFavorite: (item: RecentItem) => void;
  isFavorite: (id: string) => boolean;
  
  // UI
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveTab: (tab: 'recent' | 'favorites') => void;
  
  // Getters
  getRecentByType: (type: ItemType) => RecentItem[];
  getFilteredItems: (query: string) => { recent: RecentItem[]; favorites: RecentItem[] };
}

const MAX_RECENT_ITEMS = 20;

export const useRecentStore = create<RecentState & RecentActions>()(
  persist(
    (set, get) => ({
      // State
      recentItems: [],
      favorites: [],
      isPanelOpen: false,
      activeTab: 'recent',

      // Add recent item (moves to top if exists)
      addRecentItem: (item) => {
        set((state) => {
          // Remove if already exists (to move to top)
          const filtered = state.recentItems.filter((ri) => ri.id !== item.id);
          
          // Add new item at beginning
          const newItem: RecentItem = {
            ...item,
            timestamp: Date.now(),
            isFavorite: state.favorites.some((f) => f.id === item.id),
          };
          
          // Keep only max items
          const newRecent = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
          
          return { recentItems: newRecent };
        });
      },

      // Remove single recent item
      removeRecentItem: (id) => {
        set((state) => ({
          recentItems: state.recentItems.filter((ri) => ri.id !== id),
        }));
      },

      // Clear all recent items
      clearRecentItems: () => {
        set({ recentItems: [] });
      },

      // Add to favorites
      addToFavorites: (item) => {
        set((state) => {
          // Don't add duplicates
          if (state.favorites.some((f) => f.id === item.id)) {
            return state;
          }
          
          const favoriteItem: RecentItem = {
            ...item,
            timestamp: Date.now(),
            isFavorite: true,
          };
          
          return {
            favorites: [favoriteItem, ...state.favorites],
            // Also update recent items to mark as favorite
            recentItems: state.recentItems.map((ri) =>
              ri.id === item.id ? { ...ri, isFavorite: true } : ri
            ),
          };
        });
      },

      // Remove from favorites
      removeFromFavorites: (id) => {
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
          // Also update recent items to unmark
          recentItems: state.recentItems.map((ri) =>
            ri.id === id ? { ...ri, isFavorite: false } : ri
          ),
        }));
      },

      // Toggle favorite status
      toggleFavorite: (item) => {
        const { isFavorite, addToFavorites, removeFromFavorites } = get();
        if (isFavorite(item.id)) {
          removeFromFavorites(item.id);
        } else {
          addToFavorites(item);
        }
      },

      // Check if item is favorite
      isFavorite: (id) => {
        return get().favorites.some((f) => f.id === id);
      },

      // Toggle panel
      togglePanel: () => {
        set((state) => ({ isPanelOpen: !state.isPanelOpen }));
      },

      // Open panel
      openPanel: () => {
        set({ isPanelOpen: true });
      },

      // Close panel
      closePanel: () => {
        set({ isPanelOpen: false });
      },

      // Set active tab
      setActiveTab: (tab) => {
        set({ activeTab: tab });
      },

      // Get recent items by type
      getRecentByType: (type) => {
        return get().recentItems.filter((ri) => ri.type === type);
      },

      // Get filtered items by search query
      getFilteredItems: (query) => {
        const { recentItems, favorites } = get();
        const lowerQuery = query.toLowerCase();
        
        const filterFn = (item: RecentItem) =>
          item.title.toLowerCase().includes(lowerQuery) ||
          (item.subtitle?.toLowerCase() || '').includes(lowerQuery);
        
        return {
          recent: recentItems.filter(filterFn),
          favorites: favorites.filter(filterFn),
        };
      },
    }),
    {
      name: 'agentx-recent-favorites',
      partialize: (state) => ({
        recentItems: state.recentItems,
        favorites: state.favorites,
      }),
    }
  )
);

// Helper hook to track page views
export function useTrackView(
  id: string,
  type: ItemType,
  title: string,
  subtitle?: string,
  icon?: string,
  color?: string,
  path?: string
) {
  const addRecentItem = useRecentStore((state) => state.addRecentItem);
  
  // Track view on mount
  useEffect(() => {
    if (id && title) {
      addRecentItem({
        id,
        type,
        title,
        subtitle,
        icon,
        color,
        path: path || window.location.pathname,
      });
    }
  }, [id, type, title, subtitle, icon, color, path, addRecentItem]);
}

import { useEffect } from 'react';

// Type colors for consistent UI
export const typeColors: Record<ItemType, { bg: string; text: string; border: string }> = {
  agent: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/20',
  },
  task: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/20',
  },
  project: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20',
  },
  workflow: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20',
  },
};

// Type icons
export const typeIcons: Record<ItemType, string> = {
  agent: '🤖',
  task: '✅',
  project: '📁',
  workflow: '⚡',
};

// Type labels
export const typeLabels: Record<ItemType, string> = {
  agent: 'Agent',
  task: 'Task',
  project: 'Project',
  workflow: 'Workflow',
};
