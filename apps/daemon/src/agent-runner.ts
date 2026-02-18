// Agent Runner - Execute agents with AI models
// Phase 5: Real agent execution with tool calling

import { randomUUID } from 'crypto';
import { agentManager, AgentInstance, AgentDefinition } from './agents';
import { createExecutor, AgentExecutor, Message, ToolCall } from './executor';
import { supervisor } from './supervisor';
import { audit } from './audit';
import { runDb } from './database';

interface RunStep {
  id: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'completion' | 'error';
  content: string;
  toolCall?: ToolCall;
  timestamp: string;
}

interface AgentRunState {
  instanceId: string;
  runId: string;
  status: 'running' | 'paused' | 'completed' | 'error';
  steps: RunStep[];
  messages: Message[];
  iteration: number;
  maxIterations: number;
}

class AgentRunner {
  private activeRuns: Map<string, AgentRunState> = new Map();
  private executor: AgentExecutor;

  constructor() {
    // Create default executor
    this.executor = createExecutor();
  }

  /**
   * Start a new agent run
   */
  async startRun(
    instanceId: string,
    prompt: string,
    onStep?: (step: RunStep) => void
  ): Promise<{ runId: string; success: boolean; error?: string }> {
    const instance = agentManager.getInstance(instanceId);
    if (!instance) {
      return { runId: '', success: false, error: 'Agent instance not found' };
    }

    const definition = agentManager.getDefinition(instance.definitionId);
    if (!definition) {
      return { runId: '', success: false, error: 'Agent definition not found' };
    }

    const contextPack = instance.contextPackId
      ? agentManager.getContextPack(instance.contextPackId)
      : undefined;

    if (!contextPack) {
      return { runId: '', success: false, error: 'Context pack not found' };
    }

    // Create run ID
    const runId = `run-${randomUUID()}`;

    // Initialize run state
    const state: AgentRunState = {
      instanceId,
      runId,
      status: 'running',
      steps: [],
      messages: [],
      iteration: 0,
      maxIterations: definition.maxIterations,
    };

    this.activeRuns.set(runId, state);

    // Update instance
    instance.runId = runId;
    instance.status = 'running';
    instance.currentTask = prompt;
    instance.updatedAt = new Date().toISOString();

    // Log
    await audit.log({
      id: randomUUID(),
      projectId: instance.projectId,
      actorType: 'agent',
      actorId: instanceId,
      actionType: 'AGENT_RUN_START',
      payload: { runId, prompt },
      createdAt: new Date().toISOString(),
    });

    // Start execution loop
    this.runExecutionLoop(state, definition, instance, contextPack, prompt, onStep);

    return { runId, success: true };
  }

  /**
   * Main execution loop
   */
  private async runExecutionLoop(
    state: AgentRunState,
    definition: AgentDefinition,
    instance: AgentInstance,
    contextPack: any,
    originalPrompt: string,
    onStep?: (step: RunStep) => void
  ): Promise<void> {
    try {
      // Initial model call
      let result = await this.executor.execute(
        definition,
        instance,
        contextPack,
        originalPrompt,
        (msg) => {
          state.messages.push(msg);
        }
      );

      // Add initial response step
      if (result.output) {
        const step: RunStep = {
          id: `step-${randomUUID()}`,
          type: 'thought',
          content: result.output,
          timestamp: new Date().toISOString(),
        };
        state.steps.push(step);
        if (onStep) onStep(step);
      }

      // Tool execution loop
      while (state.iteration < state.maxIterations && state.status === 'running') {
        state.iteration++;

        // Check for tool calls in the response
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage?.toolCalls && lastMessage.toolCalls.length > 0) {
          for (const toolCall of lastMessage.toolCalls) {
            // Add tool call step
            const callStep: RunStep = {
              id: `step-${randomUUID()}`,
              type: 'tool_call',
              content: `Calling ${toolCall.function.name}...`,
              toolCall,
              timestamp: new Date().toISOString(),
            };
            state.steps.push(callStep);
            if (onStep) onStep(callStep);

            // Execute tool
            const toolResult = await this.executor.executeTool(
              toolCall,
              instance.projectId
            );

            // Add tool result step
            const resultStep: RunStep = {
              id: `step-${randomUUID()}`,
              type: 'tool_result',
              content: toolResult,
              timestamp: new Date().toISOString(),
            };
            state.steps.push(resultStep);
            if (onStep) onStep(resultStep);

            // Add to messages for context
            state.messages.push({
              role: 'tool',
              content: toolResult,
              toolCallId: toolCall.id,
            });

            // Check for completion
            if (toolCall.function.name === 'complete') {
              state.status = 'completed';
              
              const completeStep: RunStep = {
                id: `step-${randomUUID()}`,
                type: 'completion',
                content: toolResult,
                timestamp: new Date().toISOString(),
              };
              state.steps.push(completeStep);
              if (onStep) onStep(completeStep);

              // Update run in database
              await this.finalizeRun(state, instance);
              return;
            }
          }

          // Continue loop - get next response from model
          // In production, this would call the model again with tool results
          // For now, we'll mark as completed after first iteration
          state.status = 'completed';
          
        } else {
          // No tool calls, agent is done
          state.status = 'completed';
        }
      }

      // Max iterations reached
      if (state.iteration >= state.maxIterations) {
        const errorStep: RunStep = {
          id: `step-${randomUUID()}`,
          type: 'error',
          content: 'Maximum iterations reached',
          timestamp: new Date().toISOString(),
        };
        state.steps.push(errorStep);
        if (onStep) onStep(errorStep);
        state.status = 'error';
      }

      await this.finalizeRun(state, instance);

    } catch (err: any) {
      const errorStep: RunStep = {
        id: `step-${randomUUID()}`,
        type: 'error',
        content: err.message,
        timestamp: new Date().toISOString(),
      };
      state.steps.push(errorStep);
      if (onStep) onStep(errorStep);
      state.status = 'error';

      await this.finalizeRun(state, instance);
    }
  }

  /**
   * Finalize a run
   */
  private async finalizeRun(state: AgentRunState, instance: AgentInstance): Promise<void> {
    // Update instance
    instance.status = state.status === 'completed' ? 'idle' : 'error';
    instance.runId = undefined;
    instance.updatedAt = new Date().toISOString();

    // Log completion
    await audit.log({
      id: randomUUID(),
      projectId: instance.projectId,
      actorType: 'agent',
      actorId: state.instanceId,
      actionType: 'AGENT_RUN_COMPLETE',
      payload: {
        runId: state.runId,
        status: state.status,
        iterations: state.iteration,
      },
      createdAt: new Date().toISOString(),
    });

    console.log(`Agent run ${state.runId} completed with status: ${state.status}`);
  }

  /**
   * Get run state
   */
  getRun(runId: string): AgentRunState | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Pause a running agent
   */
  pauseRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state || state.status !== 'running') return false;
    
    state.status = 'paused';
    return true;
  }

  /**
   * Resume a paused agent
   */
  resumeRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state || state.status !== 'paused') return false;
    
    state.status = 'running';
    return true;
  }

  /**
   * Get run history for an instance
   */
  getRunsByInstance(instanceId: string): AgentRunState[] {
    return Array.from(this.activeRuns.values())
      .filter(r => r.instanceId === instanceId)
      .sort((a, b) => new Date(b.steps[0]?.timestamp).getTime() - new Date(a.steps[0]?.timestamp).getTime());
  }
}

export const agentRunner = new AgentRunner();
