import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WorkflowNodeType = 'trigger' | 'agent' | 'condition' | 'action' | 'delay' | 'notification';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
  connectedTo?: string[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  results?: Record<string, unknown>;
  logs: string[];
}

interface WorkflowState {
  workflows: Workflow[];
  activeWorkflowId: string | null;
  executions: WorkflowExecution[];
  isExecuting: boolean;
  
  // Actions
  setWorkflows: (workflows: Workflow[]) => void;
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => void;
  setActiveWorkflow: (id: string | null) => void;
  
  // Node operations
  addNode: (workflowId: string, node: WorkflowNode) => void;
  updateNode: (workflowId: string, nodeId: string, updates: Partial<WorkflowNode>) => void;
  removeNode: (workflowId: string, nodeId: string) => void;
  moveNode: (workflowId: string, nodeId: string, x: number, y: number) => void;
  
  // Edge operations
  addEdge: (workflowId: string, edge: WorkflowEdge) => void;
  removeEdge: (workflowId: string, edgeId: string) => void;
  
  // Execution
  addExecution: (execution: WorkflowExecution) => void;
  updateExecution: (id: string, updates: Partial<WorkflowExecution>) => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      workflows: [],
      activeWorkflowId: null,
      executions: [],
      isExecuting: false,

      setWorkflows: (workflows) => set({ workflows }),
      
      addWorkflow: (workflow) =>
        set((state) => ({
          workflows: [...state.workflows, workflow],
        })),
      
      updateWorkflow: (id, updates) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w
          ),
        })),
      
      deleteWorkflow: (id) =>
        set((state) => ({
          workflows: state.workflows.filter((w) => w.id !== id),
          activeWorkflowId: state.activeWorkflowId === id ? null : state.activeWorkflowId,
        })),
      
      setActiveWorkflow: (id) => set({ activeWorkflowId: id }),

      addNode: (workflowId, node) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? { ...w, nodes: [...w.nodes, node], updatedAt: new Date().toISOString() }
              : w
          ),
        })),

      updateNode: (workflowId, nodeId, updates) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  nodes: w.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
                  updatedAt: new Date().toISOString(),
                }
              : w
          ),
        })),

      removeNode: (workflowId, nodeId) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  nodes: w.nodes.filter((n) => n.id !== nodeId),
                  edges: w.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                  updatedAt: new Date().toISOString(),
                }
              : w
          ),
        })),

      moveNode: (workflowId, nodeId, x, y) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  nodes: w.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
                  updatedAt: new Date().toISOString(),
                }
              : w
          ),
        })),

      addEdge: (workflowId, edge) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? { ...w, edges: [...w.edges, edge], updatedAt: new Date().toISOString() }
              : w
          ),
        })),

      removeEdge: (workflowId, edgeId) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  edges: w.edges.filter((e) => e.id !== edgeId),
                  updatedAt: new Date().toISOString(),
                }
              : w
          ),
        })),

      addExecution: (execution) =>
        set((state) => ({
          executions: [execution, ...state.executions],
        })),

      updateExecution: (id, updates) =>
        set((state) => ({
          executions: state.executions.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),
    }),
    {
      name: 'agentx-workflows',
      partialize: (state) => ({
        workflows: state.workflows,
        executions: state.executions,
      }),
    }
  )
);
