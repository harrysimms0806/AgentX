import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, Task, Project, WorkspaceLock, UserPreferences, Integration } from '@types/index';

interface AppState {
  // UI State
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  activeProject: string | null;
  
  // Data
  agents: Agent[];
  tasks: Task[];
  projects: Project[];
  locks: WorkspaceLock[];
  integrations: Integration[];
  
  // Actions
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveProject: (projectId: string | null) => void;
  
  // Agent Actions
  setAgentStatus: (agentId: string, status: Agent['status']) => void;
  updateAgentStats: (agentId: string, stats: Partial<Agent['stats']>) => void;
  
  // Task Actions
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  
  // Project Actions
  addProject: (project: Project) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  removeProject: (projectId: string) => void;
  
  // Lock Actions
  addLock: (lock: WorkspaceLock) => void;
  removeLock: (lockId: string) => void;
  getActiveLock: (projectId: string) => WorkspaceLock | undefined;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State
      sidebarCollapsed: false,
      theme: 'system',
      activeProject: null,
      agents: [],
      tasks: [],
      projects: [],
      locks: [],
      integrations: [],
      
      // UI Actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setActiveProject: (projectId) => set({ activeProject: projectId }),
      
      // Agent Actions
      setAgentStatus: (agentId, status) =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId ? { ...a, status } : a
          ),
        })),
      updateAgentStats: (agentId, stats) =>
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId ? { ...a, stats: { ...a.stats, ...stats } } : a
          ),
        })),
      
      // Task Actions
      addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
      updateTask: (taskId, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, ...updates } : t
          ),
        })),
      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== taskId),
        })),
      
      // Project Actions
      addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
      updateProject: (projectId, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, ...updates } : p
          ),
        })),
      removeProject: (projectId) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
        })),
      
      // Lock Actions
      addLock: (lock) => set((state) => ({ locks: [...state.locks, lock] })),
      removeLock: (lockId) =>
        set((state) => ({
          locks: state.locks.filter((l) => l.id !== lockId),
        })),
      getActiveLock: (projectId) =>
        get().locks.find((l) => l.projectId === projectId),
    }),
    {
      name: 'agentx-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        activeProject: state.activeProject,
        projects: state.projects,
      }),
    }
  )
);
