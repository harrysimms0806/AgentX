import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Workflow as WorkflowIcon, Plus, Play, Trash2, GitBranch, Settings2, 
  Zap, Clock, Bell, MousePointer2, X, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { useWorkflowStore, type WorkflowNode, type Workflow } from '../stores/workflowStore';
import { generateId } from '../utils/id';

// Node type definitions
const nodeTypes = [
  { type: 'trigger' as const, label: 'Trigger', icon: Zap, color: 'bg-amber-500', desc: 'Start workflow' },
  { type: 'agent' as const, label: 'Agent', icon: Settings2, color: 'bg-blue-500', desc: 'Run agent task' },
  { type: 'condition' as const, label: 'Condition', icon: GitBranch, color: 'bg-purple-500', desc: 'Branch logic' },
  { type: 'action' as const, label: 'Action', icon: Play, color: 'bg-green-500', desc: 'Execute action' },
  { type: 'delay' as const, label: 'Delay', icon: Clock, color: 'bg-orange-500', desc: 'Wait period' },
  { type: 'notification' as const, label: 'Notify', icon: Bell, color: 'bg-pink-500', desc: 'Send alert' },
];

// Sample workflows for demo
const sampleWorkflows: Workflow[] = [
  {
    id: 'wf-1',
    name: 'New Task Handler',
    description: 'Automatically route and process new tasks',
    nodes: [
      { id: 'n1', type: 'trigger', label: 'Task Created', x: 50, y: 200 },
      { id: 'n2', type: 'condition', label: 'High Priority?', x: 250, y: 200 },
      { id: 'n3', type: 'agent', label: 'Coordinator', x: 500, y: 150 },
      { id: 'n4', type: 'agent', label: 'Builder', x: 500, y: 280 },
      { id: 'n5', type: 'notification', label: 'Notify User', x: 750, y: 200 },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', condition: 'yes' },
      { id: 'e3', source: 'n2', target: 'n4', condition: 'no' },
      { id: 'e4', source: 'n3', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n5' },
    ],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'wf-2',
    name: 'Code Review Pipeline',
    description: 'Automated code review and testing',
    nodes: [
      { id: 'n1', type: 'trigger', label: 'PR Created', x: 50, y: 150 },
      { id: 'n2', type: 'agent', label: 'Reviewer', x: 300, y: 150 },
      { id: 'n3', type: 'condition', label: 'Tests Pass?', x: 550, y: 150 },
      { id: 'n4', type: 'action', label: 'Merge PR', x: 800, y: 100 },
      { id: 'n5', type: 'notification', label: 'Request Changes', x: 800, y: 200 },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4', condition: 'yes' },
      { id: 'e4', source: 'n3', target: 'n5', condition: 'no' },
    ],
    enabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function Workflows() {
  const { 
    workflows, activeWorkflowId, executions,
    setWorkflows, addWorkflow, updateWorkflow, deleteWorkflow, setActiveWorkflow,
    addNode, updateNode, removeNode, moveNode, addEdge, removeEdge,
    addExecution, updateExecution
  } = useWorkflowStore();
  
  // Initialize with sample workflows if empty
  useEffect(() => {
    if (workflows.length === 0) {
      setWorkflows(sampleWorkflows);
      setActiveWorkflow(sampleWorkflows[0].id);
    }
  }, []);

  const activeWorkflow = workflows.find(w => w.id === activeWorkflowId);
  
  // Canvas state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState({ x: 0, y: 0 });
  const [showNewModal, setShowNewModal] = useState(false);
  const [showExecutions, setShowExecutions] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Form state
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');

  // Drag handlers
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = activeWorkflow?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
    setSelectedEdge(null);
    setDragOffset({
      x: (e.clientX - rect.left - pan.x) / scale - node.x,
      y: (e.clientY - rect.top - pan.y) / scale - node.y,
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingNode && activeWorkflow) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = (e.clientX - rect.left - pan.x) / scale - dragOffset.x;
      const y = (e.clientY - rect.top - pan.y) / scale - dragOffset.y;
      moveNode(activeWorkflow.id, draggingNode, Math.max(0, x), Math.max(0, y));
    }
    
    if (connectingFrom) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setConnectingMousePos({
        x: (e.clientX - rect.left - pan.x) / scale,
        y: (e.clientY - rect.top - pan.y) / scale,
      });
    }
    
    if (isPanning) {
      setPan({
        x: pan.x + (e.clientX - panStart.x),
        y: pan.y + (e.clientY - panStart.y),
      });
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [draggingNode, activeWorkflow, dragOffset, connectingFrom, isPanning, pan, panStart, scale, moveNode]);

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
    setIsPanning(false);
  }, []);

  // Connection handlers
  const handleNodeConnectionStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setConnectingFrom(nodeId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setConnectingMousePos({
        x: (e.clientX - rect.left - pan.x) / scale,
        y: (e.clientY - rect.top - pan.y) / scale,
      });
    }
  };

  const handleNodeConnectionEnd = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom && connectingFrom !== nodeId && activeWorkflow) {
      const existingEdge = activeWorkflow.edges.find(
        e => e.source === connectingFrom && e.target === nodeId
      );
      if (!existingEdge) {
        addEdge(activeWorkflow.id, {
          id: `e-${generateId()}`,
          source: connectingFrom,
          target: nodeId,
        });
      }
    }
    setConnectingFrom(null);
  };

  // Add node from palette
  const handleAddNode = (type: typeof nodeTypes[0]) => {
    if (!activeWorkflow) return;
    
    const newNode: WorkflowNode = {
      id: `n-${generateId()}`,
      type: type.type,
      label: type.label,
      x: 100 + Math.random() * 200,
      y: 150 + Math.random() * 100,
      config: {},
    };
    addNode(activeWorkflow.id, newNode);
  };

  // Create new workflow
  const handleCreateWorkflow = () => {
    if (!newWorkflowName.trim()) return;
    
    const newWorkflow: Workflow = {
      id: `wf-${generateId()}`,
      name: newWorkflowName,
      description: newWorkflowDesc,
      nodes: [
        { id: 'n1', type: 'trigger', label: 'Start', x: 50, y: 200 },
      ],
      edges: [],
      enabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    addWorkflow(newWorkflow);
    setActiveWorkflow(newWorkflow.id);
    setShowNewModal(false);
    setNewWorkflowName('');
    setNewWorkflowDesc('');
  };

  // Execute workflow
  const handleExecuteWorkflow = () => {
    if (!activeWorkflow) return;
    
    const execution = {
      id: `exec-${generateId()}`,
      workflowId: activeWorkflow.id,
      status: 'running' as const,
      startedAt: new Date().toISOString(),
      logs: ['Starting workflow execution...'],
    };
    
    addExecution(execution);
    
    // Simulate execution
    setTimeout(() => {
      updateExecution(execution.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        logs: ['Starting workflow execution...', 'Trigger fired', 'Processing nodes...', 'Workflow completed successfully'],
      });
    }, 3000);
  };

  // Duplicate workflow
  const handleDuplicateWorkflow = (workflow: Workflow) => {
    const duplicated: Workflow = {
      ...workflow,
      id: `wf-${generateId()}`,
      name: `${workflow.name} (Copy)`,
      enabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addWorkflow(duplicated);
  };

  // Get node type config
  const getNodeTypeConfig = (type: string) => nodeTypes.find(nt => nt.type === type) || nodeTypes[0];

  return (
    <div className="h-screen flex flex-col bg-background dark:bg-background-dark">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-glass-border dark:border-glass-border-dark">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <WorkflowIcon className="w-5 h-5 text-accent" />
              Workflow Builder
            </h1>
            <p className="text-sm text-foreground-secondary mt-0.5">
              {workflows.length} workflows • {activeWorkflow?.nodes.length || 0} nodes
            </p>
          </div>
          
          {activeWorkflow && (
            <div className="flex items-center gap-2 ml-6">
              <select 
                className="input-apple text-sm py-1.5 min-w-[200px]"
                value={activeWorkflowId || ''}
                onChange={(e) => setActiveWorkflow(e.target.value)}
              >
                {workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                ))}
              </select>
              <button
                className="p-1.5 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                onClick={() => setShowNewModal(true)}
                title="New workflow"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {activeWorkflow && (
            <>
              <button
                className={cn(
                  "btn-apple-secondary flex items-center gap-2 text-sm",
                  activeWorkflow.enabled && "text-green-500"
                )}
                onClick={() => updateWorkflow(activeWorkflow.id, { enabled: !activeWorkflow.enabled })}
              >
                <Zap className="w-4 h-4" />
                {activeWorkflow.enabled ? 'Enabled' : 'Disabled'}
              </button>
              
              <button
                className="btn-apple-secondary flex items-center gap-2 text-sm"
                onClick={() => setShowExecutions(true)}
              >
                <Clock className="w-4 h-4" />
                History
              </button>
              
              <button
                className="btn-apple flex items-center gap-2 text-sm"
                onClick={handleExecuteWorkflow}
              >
                <Play className="w-4 h-4" />
                Run
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Node Palette */}
        <aside className="w-64 border-r border-glass-border dark:border-glass-border-dark p-4 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground-secondary mb-3">Node Palette</h3>
            <div className="space-y-2">
              {nodeTypes.map((nt) => {
                const Icon = nt.icon;
                return (
                  <button
                    key={nt.type}
                    onClick={() => handleAddNode(nt)}
                    disabled={!activeWorkflow}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                      "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                      !activeWorkflow && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn("p-2 rounded-lg", nt.color, "text-white")}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{nt.label}</p>
                      <p className="text-xs text-foreground-secondary">{nt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="mt-auto">
            <h3 className="text-sm font-semibold text-foreground-secondary mb-3">Your Workflows</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => setActiveWorkflow(wf.id)}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-all",
                    activeWorkflowId === wf.id
                      ? "border-accent bg-accent/5"
                      : "border-glass-border dark:border-glass-border-dark hover:bg-background-secondary/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{wf.name}</span>
                    {wf.enabled && <Zap className="w-3 h-3 text-green-500" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-foreground-secondary">{wf.nodes.length} nodes</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicateWorkflow(wf); }}
                      className="p-1 rounded hover:bg-background-secondary"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3 text-foreground-secondary" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }}
                      className="p-1 rounded hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setShowNewModal(true)}
              className="w-full mt-3 btn-apple-secondary text-sm flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden bg-background-secondary/30 dark:bg-background-secondary-dark/30">
          {!activeWorkflow ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <WorkflowIcon className="w-16 h-16 mx-auto text-foreground-secondary mb-4" />
                <p className="text-foreground-secondary">Select or create a workflow to start</p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="btn-apple mt-4"
                >
                  Create Workflow
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Canvas controls */}
              <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                <div className="glass-card p-1 flex items-center gap-1">
                  <button
                    className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                    onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                  >
                    -
                  </button>
                  <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                  <button
                    className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
                    onClick={() => setScale(s => Math.min(2, s + 0.1))}
                  >
                    +
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark ml-1"
                    onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
                  >
                    <MousePointer2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Help text */}
              <div className="absolute bottom-4 left-4 text-xs text-foreground-secondary z-10">
                <p>Drag to move nodes • Shift+drag to pan • Drag from connection point to connect</p>
              </div>

              {/* SVG Canvas */}
              <div
                ref={canvasRef}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
              >
                <svg
                  className="absolute inset-0 w-full h-full"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                  }}
                >
                  {/* Grid pattern */}
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.1"/>
                    </pattern>
                  </defs>
                  <rect width="2000" height="2000" fill="url(#grid)" />

                  {/* Connection line being dragged */}
                  {connectingFrom && activeWorkflow && (() => {
                    const sourceNode = activeWorkflow.nodes.find(n => n.id === connectingFrom);
                    if (!sourceNode) return null;
                    return (
                      <line
                        x1={sourceNode.x + 140}
                        y1={sourceNode.y + 25}
                        x2={connectingMousePos.x}
                        y2={connectingMousePos.y}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                        opacity="0.5"
                      />
                    );
                  })()}

                  {/* Edges */}
                  {activeWorkflow.edges.map((edge) => {
                    const sourceNode = activeWorkflow.nodes.find(n => n.id === edge.source);
                    const targetNode = activeWorkflow.nodes.find(n => n.id === edge.target);
                    if (!sourceNode || !targetNode) return null;
                    
                    const isSelected = selectedEdge === edge.id;
                    
                    return (
                      <g key={edge.id}>
                        <line
                          x1={sourceNode.x + 140}
                          y1={sourceNode.y + 25}
                          x2={targetNode.x}
                          y2={targetNode.y + 25}
                          stroke={isSelected ? "var(--accent)" : "currentColor"}
                          strokeWidth={isSelected ? 3 : 2}
                          opacity={isSelected ? 1 : 0.3}
                          className="cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setSelectedEdge(edge.id); }}
                        />
                        {edge.condition && (
                          <text
                            x={(sourceNode.x + 140 + targetNode.x) / 2}
                            y={(sourceNode.y + 25 + targetNode.y + 25) / 2 - 5}
                            className="text-xs fill-current opacity-50"
                            textAnchor="middle"
                          >
                            {edge.condition}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Nodes */}
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                  }}
                >
                  {activeWorkflow.nodes.map((node) => {
                    const nodeConfig = getNodeTypeConfig(node.type);
                    const Icon = nodeConfig.icon;
                    const isSelected = selectedNode === node.id;
                    
                    return (
                      <motion.div
                        key={node.id}
                        layoutId={node.id}
                        className={cn(
                          "absolute w-[140px] rounded-xl border-2 bg-background dark:bg-background-dark p-3",
                          "shadow-lg transition-all",
                          isSelected && "ring-2 ring-accent border-accent",
                          "cursor-move"
                        )}
                        style={{ left: node.x, top: node.y }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Connection points */}
                        <div
                          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground-secondary cursor-crosshair hover:bg-accent hover:scale-150 transition-all"
                          onMouseDown={(e) => handleNodeConnectionStart(e, node.id)}
                          onMouseUp={(e) => handleNodeConnectionEnd(e, node.id)}
                          title="Drag to connect"
                        />
                        <div
                          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground-secondary cursor-crosshair hover:bg-accent hover:scale-150 transition-all"
                          onMouseDown={(e) => handleNodeConnectionStart(e, node.id)}
                          onMouseUp={(e) => handleNodeConnectionEnd(e, node.id)}
                          title="Drag to connect"
                        />
                        
                        {/* Node content */}
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded-lg", nodeConfig.color, "text-white")}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-sm font-medium truncate">{node.label}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Properties panel */}
              <AnimatePresence>
                {(selectedNode || selectedEdge) && activeWorkflow && (
                  <motion.div
                    initial={{ x: 300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 300, opacity: 0 }}
                    className="absolute right-0 top-0 bottom-0 w-72 bg-background dark:bg-background-dark border-l border-glass-border dark:border-glass-border-dark p-4 overflow-y-auto z-20"
                  >
                    {selectedNode && (() => {
                      const node = activeWorkflow.nodes.find(n => n.id === selectedNode);
                      if (!node) return null;
                      const nodeConfig = getNodeTypeConfig(node.type);
                      
                      return (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Node Properties</h3>
                            <button
                              onClick={() => setSelectedNode(null)}
                              className="p-1 rounded hover:bg-background-secondary"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm text-foreground-secondary">Type</label>
                              <div className="flex items-center gap-2 mt-1">
                                <div className={cn("p-1.5 rounded", nodeConfig.color, "text-white")}>
                                  <nodeConfig.icon className="w-4 h-4" />
                                </div>
                                <span className="font-medium">{nodeConfig.label}</span>
                              </div>
                            </div>
                            
                            <div>
                              <label className="text-sm text-foreground-secondary">Label</label>
                              <input
                                type="text"
                                className="input-apple w-full mt-1"
                                value={node.label}
                                onChange={(e) => updateNode(activeWorkflow.id, node.id, { label: e.target.value })}
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-sm text-foreground-secondary">X</label>
                                <input
                                  type="number"
                                  className="input-apple w-full mt-1"
                                  value={Math.round(node.x)}
                                  onChange={(e) => moveNode(activeWorkflow.id, node.id, Number(e.target.value), node.y)}
                                />
                              </div>
                              <div>
                                <label className="text-sm text-foreground-secondary">Y</label>
                                <input
                                  type="number"
                                  className="input-apple w-full mt-1"
                                  value={Math.round(node.y)}
                                  onChange={(e) => moveNode(activeWorkflow.id, node.id, node.x, Number(e.target.value))}
                                />
                              </div>
                            </div>
                            
                            <div className="pt-4 border-t border-glass-border">
                              <button
                                onClick={() => {
                                  removeNode(activeWorkflow.id, node.id);
                                  setSelectedNode(null);
                                }}
                                className="btn-danger w-full flex items-center justify-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Node
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    
                    {selectedEdge && (() => {
                      const edge = activeWorkflow.edges.find(e => e.id === selectedEdge);
                      if (!edge) return null;
                      
                      return (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Connection</h3>
                            <button
                              onClick={() => setSelectedEdge(null)}
                              className="p-1 rounded hover:bg-background-secondary"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm text-foreground-secondary">Condition (optional)</label>
                              <input
                                type="text"
                                className="input-apple w-full mt-1"
                                value={edge.condition || ''}
                                onChange={(ev) => {
                                  updateWorkflow(activeWorkflow.id, {
                                    edges: activeWorkflow.edges.map(ed =>
                                      ed.id === edge.id ? { ...ed, condition: ev.target.value || undefined } : ed
                                    )
                                  });
                                }}
                                placeholder="e.g., yes, no, true"
                              />
                            </div>
                            
                            <div className="pt-4 border-t border-glass-border">
                              <button
                                onClick={() => {
                                  removeEdge(activeWorkflow.id, edge.id);
                                  setSelectedEdge(null);
                                }}
                                className="btn-danger w-full flex items-center justify-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Connection
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      {/* New Workflow Modal */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowNewModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-4">Create New Workflow</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    className="input-apple w-full"
                    value={newWorkflowName}
                    onChange={(e) => setNewWorkflowName(e.target.value)}
                    placeholder="e.g., Task Processor"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Description (optional)</label>
                  <textarea
                    className="input-apple w-full h-20 resize-none"
                    value={newWorkflowDesc}
                    onChange={(e) => setNewWorkflowDesc(e.target.value)}
                    placeholder="What does this workflow do?"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  className="btn-apple-secondary flex-1"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-apple flex-1"
                  onClick={handleCreateWorkflow}
                  disabled={!newWorkflowName.trim()}
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Executions Panel */}
      <AnimatePresence>
        {showExecutions && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed inset-y-0 right-0 w-96 bg-background dark:bg-background-dark border-l border-glass-border dark:border-glass-border-dark shadow-2xl z-50"
          >
            <div className="flex items-center justify-between p-4 border-b border-glass-border dark:border-glass-border-dark">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Execution History
              </h3>
              <button
                onClick={() => setShowExecutions(false)}
                className="p-2 rounded-lg hover:bg-background-secondary dark:hover:bg-background-secondary-dark"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-3 overflow-y-auto h-[calc(100vh-80px)]">
              {executions.length === 0 ? (
                <p className="text-foreground-secondary text-center py-8">No executions yet</p>
              ) : (
                executions.map((exec) => {
                  const workflow = workflows.find(w => w.id === exec.workflowId);
                  return (
                    <div key={exec.id} className="glass-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm truncate">{workflow?.name || 'Unknown'}</span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          exec.status === 'completed' && "bg-green-500/10 text-green-500",
                          exec.status === 'running' && "bg-blue-500/10 text-blue-500",
                          exec.status === 'failed' && "bg-red-500/10 text-red-500",
                        )}>
                          {exec.status}
                        </span>
                      </div>
                      
                      <div className="text-xs text-foreground-secondary">
                        <p>Started: {new Date(exec.startedAt).toLocaleString()}</p>
                        {exec.completedAt && (
                          <p>Completed: {new Date(exec.completedAt).toLocaleString()}</p>
                        )}
                      </div>
                      
                      {exec.logs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-glass-border dark:border-glass-border-dark">
                          <p className="text-xs font-medium mb-1">Logs:</p>
                          <div className="space-y-1">
                            {exec.logs.map((log, i) => (
                              <p key={i} className="text-xs text-foreground-secondary font-mono">{log}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
