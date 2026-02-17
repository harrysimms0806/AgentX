import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, Task, Project, WorkspaceLock, Integration } from '../types';

interface AppState {
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  activeProject: Project | null;

  agents: Agent[];
  tasks: Task[];
  projects: Project[];
  locks: WorkspaceLock[];
  integrations: Integration[];

  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveProject: (project: Project | null) => void;

  setAgents: (agents: Agent[]) => void;
  setTasks: (tasks: Task[]) => void;
  setProjects: (projects: Project[]) => void;

  setAgentStatus: (agentId: string, status: Agent['status']) => void;
  upsertTask: (task: Task) => void;

  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;

  addProject: (project: Project) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'system',
      activeProject: null,
      agents: [],
      tasks: [],
      projects: [],
      locks: [],
      integrations: [],

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setActiveProject: (project) => set({ activeProject: project }),

      setAgents: (agents) => set({ agents }),
      setTasks: (tasks) => set({ tasks }),
      setProjects: (projects) => set({ projects }),

      setAgentStatus: (agentId, status) =>
        set((state) => ({
          agents: state.agents.map((a) => (a.id === agentId ? { ...a, status } : a)),
        })),

      upsertTask: (task) =>
        set((state) => {
          const exists = state.tasks.some((current) => current.id === task.id);
          return {
            tasks: exists
              ? state.tasks.map((current) => (current.id === task.id ? { ...current, ...task } : current))
              : [task, ...state.tasks],
          };
        }),

      addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
      updateTask: (taskId, updates) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
        })),
      removeTask: (taskId) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId) })),

      addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
    }),
    {
      name: 'agentx-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        activeProject: state.activeProject,
      }),
    }
  )
);
