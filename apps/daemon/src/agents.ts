// Agent Definitions and Types
// Phase 4: Agent orchestration system

import { randomUUID } from 'crypto';
import { runDb } from './database';
import { contextPackDb } from './database';
import { audit } from './audit';
import { supervisor } from './supervisor';
import { sandbox } from './sandbox';
import { projects } from './store/projects';
import { buildContextPack, type ContextPackBuildInput } from './context-pack';
import type { Run } from '@agentx/api-types';

// Agent types based on role
export type AgentType = 'coder' | 'reviewer' | 'tester' | 'architect' | 'custom';

// Agent status
export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';

// Agent definition (template)
export interface AgentDefinition {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  systemPrompt: string;
  capabilities: AgentCapability[];
  maxIterations: number;
  timeoutMinutes: number;
  createdAt: string;
  updatedAt: string;
}

// What an agent can do
export type AgentCapability = 
  | 'read_files'
  | 'write_files'
  | 'run_commands'
  | 'run_tests'
  | 'git_operations'
  | 'spawn_subagents'
  | 'request_user_input';

// Active agent instance
export interface AgentInstance {
  id: string;
  definitionId: string;
  projectId: string;
  runId?: string;
  status: AgentStatus;
  currentTask?: string;
  contextPackId?: string;
  iteration: number;
  createdAt: string;
  updatedAt: string;
}

// Agent task/checkpoint
export interface AgentTask {
  id: string;
  agentId: string;
  type: 'action' | 'thought' | 'checkpoint' | 'handoff';
  description: string;
  payload?: Record<string, unknown>;
  result?: string;
  approved: boolean;
  createdAt: string;
}

// Context pack for agent (injected into prompts)
export interface ContextPack {
  id: string;
  projectId: string;
  runId?: string;
  agentId?: string;
  createdAt: string;
  sections: {
    summary: string;           // Project overview
    activeTask?: string;       // User active task
    files: FileContext[];      // Key files with summaries
    gitStatus: string;         // Current changes
    memories: string[];        // Relevant past actions
    userNotes: string;         // Specific instructions
  };
  sizeChars: number;
  retrievedSnippetIds?: string[];
  retrievalDebug?: Array<{ id: string; sourceType: 'file' | 'run' | 'chat'; sourceRef: string; score: number; reason: string; updatedAt: string; contentPreview?: string }>;
  truncated?: boolean;
  budgetChars?: number;
}

export interface FileContext {
  path: string;
  summary: string;
  keySymbols?: string[];
  dependencies?: string[];
}

// Default agent definitions
export const defaultAgents: AgentDefinition[] = [
  {
    id: 'agent-coder',
    name: 'Coder',
    type: 'coder',
    description: 'Writes and modifies code based on requirements',
    systemPrompt: `You are a skilled software developer. Your task is to write clean, well-documented code.
Rules:
- Always check existing code before modifying
- Write tests for new functionality
- Follow project conventions
- Ask for clarification if requirements are unclear`,
    capabilities: ['read_files', 'write_files', 'run_commands', 'run_tests', 'request_user_input'],
    maxIterations: 10,
    timeoutMinutes: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'agent-reviewer',
    name: 'Code Reviewer',
    type: 'reviewer',
    description: 'Reviews code for quality, security, and best practices',
    systemPrompt: `You are a senior code reviewer. Analyze code for:
- Security vulnerabilities
- Performance issues
- Maintainability
- Test coverage
- Documentation

Provide specific, actionable feedback.`,
    capabilities: ['read_files', 'write_files', 'run_tests', 'request_user_input'],
    maxIterations: 5,
    timeoutMinutes: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'agent-architect',
    name: 'Architect',
    type: 'architect',
    description: 'Designs system structure and makes tech decisions',
    systemPrompt: `You are a software architect. Your role is to:
- Design system components
- Define interfaces and APIs
- Choose appropriate technologies
- Document architectural decisions

Focus on simplicity, scalability, and maintainability.`,
    capabilities: ['read_files', 'write_files', 'spawn_subagents', 'request_user_input'],
    maxIterations: 5,
    timeoutMinutes: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class AgentManager {
  private definitions: Map<string, AgentDefinition> = new Map();
  private instances: Map<string, AgentInstance> = new Map();
  private tasks: Map<string, AgentTask[]> = new Map();
  private contextPacks: Map<string, ContextPack> = new Map();

  initialize(): void {
    // Load default agents
    for (const agent of defaultAgents) {
      this.definitions.set(agent.id, agent);
    }
    console.log(`🤖 Agent manager initialized with ${this.definitions.size} definitions`);
  }

  // Agent Definitions
  getDefinitions(): AgentDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinition(id: string): AgentDefinition | undefined {
    return this.definitions.get(id);
  }

  createDefinition(def: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>): AgentDefinition {
    const definition: AgentDefinition = {
      ...def,
      id: `agent-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.definitions.set(definition.id, definition);
    return definition;
  }

  // Agent Instances
  createInstance(definitionId: string, projectId: string, contextPackId?: string): AgentInstance {
    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new Error(`Agent definition ${definitionId} not found`);
    }

    const instance: AgentInstance = {
      id: `instance-${randomUUID()}`,
      definitionId,
      projectId,
      status: 'idle',
      contextPackId,
      iteration: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.instances.set(instance.id, instance);
    this.tasks.set(instance.id, []);

    console.log(`Created agent instance ${instance.id} (${definition.name}) for project ${projectId}`);
    return instance;
  }

  getInstance(id: string): AgentInstance | undefined {
    return this.instances.get(id);
  }

  getInstancesByProject(projectId: string): AgentInstance[] {
    return Array.from(this.instances.values())
      .filter(i => i.projectId === projectId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  // Agent Tasks
  addTask(agentId: string, task: Omit<AgentTask, 'id' | 'agentId' | 'createdAt'>): AgentTask {
    const fullTask: AgentTask = {
      ...task,
      id: `task-${randomUUID()}`,
      agentId,
      createdAt: new Date().toISOString(),
    };

    const tasks = this.tasks.get(agentId) || [];
    tasks.push(fullTask);
    this.tasks.set(agentId, tasks);

    // Update instance
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.currentTask = task.description;
      instance.updatedAt = new Date().toISOString();
      if (task.type === 'checkpoint') {
        instance.iteration++;
      }
    }

    return fullTask;
  }

  getTasks(agentId: string): AgentTask[] {
    return this.tasks.get(agentId) || [];
  }

  // Context Packs
  createContextPack(projectId: string, sections: ContextPack['sections']): ContextPack {
    const pack: ContextPack = {
      id: `context-${randomUUID()}`,
      projectId,
      createdAt: new Date().toISOString(),
      sections,
      sizeChars: JSON.stringify(sections).length,
    };

    this.contextPacks.set(pack.id, pack);
    return pack;
  }

  getContextPack(id: string): ContextPack | undefined {
    return this.contextPacks.get(id);
  }

  getStoredContextPacks(projectId: string, runId?: string): ContextPack[] {
    return contextPackDb.getByProject(projectId, runId);
  }

  async previewContextPack(input: ContextPackBuildInput): Promise<ContextPack> {
    const pack = buildContextPack(input);
    this.contextPacks.set(pack.id, pack);
    return pack;
  }

  // Spawn agent as a run (integration with supervisor)
  async spawn(
    definitionId: string,
    projectId: string,
    prompt: string,
    contextPackId?: string
  ): Promise<{ instance: AgentInstance; runId: string }> {
    // Create agent instance
    const instance = this.createInstance(definitionId, projectId, contextPackId);

    // Create context pack if not provided
    if (!contextPackId) {
      const pack = await this.generateContextPack({
        projectId,
        prompt,
      });
      instance.contextPackId = pack.id;
    } else {
      const existingPack = this.contextPacks.get(contextPackId) || contextPackDb.getById(contextPackId);
      if (!existingPack) {
        throw new Error(`Context pack ${contextPackId} not found`);
      }
      if (existingPack.projectId !== projectId) {
        throw new Error('Context pack does not belong to project');
      }
      this.contextPacks.set(existingPack.id, existingPack);
      instance.contextPackId = existingPack.id;
    }

    // Create run via supervisor
    const definition = this.definitions.get(definitionId)!;
    const projectPath = sandbox.getProjectPath(projectId);
    if (!projectPath.allowed || !projectPath.path) {
      throw new Error(projectPath.error || 'Invalid project path');
    }

    const runId = await supervisor.spawnAgentRun(
      projectId,
      instance.id,
      definition,
      prompt,
      instance.contextPackId!,
      projectPath.path
    );

    instance.runId = runId;
    instance.status = 'running';
    instance.updatedAt = new Date().toISOString();

    const contextPack = this.contextPacks.get(instance.contextPackId!);
    if (contextPack) {
      contextPack.runId = runId;
      contextPackDb.create(contextPack);
    }

    // Log
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actionType: 'AGENT_SPAWN',
      payload: { agentId: definitionId, instanceId: instance.id, runId },
      createdAt: new Date().toISOString(),
    });

    return { instance, runId };
  }

  // Generate context pack from project
  private async generateContextPack(input: { projectId: string; prompt: string }): Promise<ContextPack> {
    const project = projects.get(input.projectId);
    if (!project) {
      throw new Error(`Project ${input.projectId} not found`);
    }
    const pack = buildContextPack({
      projectId: input.projectId,
      projectRootPath: project.rootPath,
      prompt: input.prompt,
    });
    this.contextPacks.set(pack.id, pack);
    return pack;
  }

  // Handoff agent to another agent
  async handoff(
    fromInstanceId: string,
    toDefinitionId: string,
    handoffMessage: string
  ): Promise<AgentInstance> {
    const fromInstance = this.instances.get(fromInstanceId);
    if (!fromInstance) {
      throw new Error(`Source agent ${fromInstanceId} not found`);
    }

    // Mark source as paused
    fromInstance.status = 'paused';
    this.addTask(fromInstanceId, {
      type: 'handoff',
      description: `Handoff to ${toDefinitionId}: ${handoffMessage}`,
      approved: true,
    });

    // Create target agent
    const toInstance = this.createInstance(
      toDefinitionId,
      fromInstance.projectId,
      fromInstance.contextPackId
    );

    console.log(`Handoff ${fromInstanceId} → ${toInstance.id}`);
    return toInstance;
  }

  // Shutdown
  shutdown(): void {
    console.log(`Shutting down ${this.instances.size} agent instances`);
    for (const instance of this.instances.values()) {
      if (instance.status === 'running') {
        instance.status = 'paused';
      }
    }
  }
}

export const agentManager = new AgentManager();
