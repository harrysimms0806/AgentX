// Agent Runner - Execute agents with AI models
// Phase 5: Real agent execution with tool calling

import { randomUUID } from 'crypto';
import { agentManager, AgentInstance, AgentDefinition } from './agents';
import { createExecutor, AgentExecutor, Message, ToolCall } from './executor';
import { buildToolResultMessage, parseCompleteOrErrorMessage, parseToolCallMessage } from './openclaw-protocol';
import { supervisor } from './supervisor';
import { audit } from './audit';
import { runDb, budSessionDb } from './database';
import { wsServer } from './websocket';

interface RunStep {
  id: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'completion' | 'error';
  content: string;
  toolCall?: ToolCall;
  timestamp: string;
}

interface QueuedToolWork {
  toolCall: ToolCall;
}

interface AgentRunState {
  instanceId: string;
  runId: string;
  status: 'running' | 'paused' | 'completed' | 'error' | 'killed';
  steps: RunStep[];
  messages: Message[];
  iteration: number;
  maxIterations: number;
  queuedToolCalls: QueuedToolWork[];
  processingQueue: boolean;
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
      queuedToolCalls: [],
      processingQueue: false,
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
            state.queuedToolCalls.push({ toolCall });
          }

          await this.processQueuedToolCalls(state, instance, onStep);

          const statusAfterQueue = state.status as AgentRunState['status'];
          if (statusAfterQueue !== 'running') {
            await this.finalizeRun(state, instance);
            return;
          }

          // Continue loop - in a full Bud loop this would await next gateway event.
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
      this.publishRunEvent(state, instance, { kind: 'error', step: errorStep });
      state.status = 'error';

      await this.finalizeRun(state, instance);
    }
  }


  private async processQueuedToolCalls(
    state: AgentRunState,
    instance: AgentInstance,
    onStep?: (step: RunStep) => void
  ): Promise<void> {
    if (state.processingQueue) {
      return;
    }

    state.processingQueue = true;
    try {
      while (state.queuedToolCalls.length > 0) {
        if (state.status === 'killed' || state.status === 'error') {
          state.queuedToolCalls = [];
          return;
        }

        if (state.status === 'paused') {
          return;
        }

        const queued = state.queuedToolCalls.shift();
        if (!queued) {
          return;
        }

        const toolCall = queued.toolCall;
        const toolCallPayload = {
          type: 'tool_call',
          id: toolCall.id,
          tool: toolCall.function.name,
          args: safeParseToolArgs(toolCall.function.arguments),
        };
        const validatedToolCall = parseToolCallMessage(toolCallPayload);
        if (!validatedToolCall) {
          const invalidStep: RunStep = {
            id: `step-${randomUUID()}`,
            type: 'error',
            content: `Rejected invalid/disallowed tool call: ${toolCall.function.name}`,
            timestamp: new Date().toISOString(),
          };
          state.steps.push(invalidStep);
          onStep?.(invalidStep);
          await audit.log({
            id: randomUUID(),
            projectId: instance.projectId,
            actorType: 'agent',
            actorId: instance.id,
            actionType: 'OPENCLAW_TOOL_CALL_REJECTED',
            payload: { tool: toolCall.function.name },
            createdAt: new Date().toISOString(),
          });
          continue;
        }

        const callStep: RunStep = {
          id: `step-${randomUUID()}`,
          type: 'tool_call',
          content: `Calling ${toolCall.function.name}...`,
          toolCall,
          timestamp: new Date().toISOString(),
        };
        state.steps.push(callStep);
        onStep?.(callStep);
        this.publishRunEvent(state, instance, { kind: 'tool_call', step: callStep });

        const toolResult = await this.executor.executeTool(toolCall, instance.projectId);
        const structuredResult = buildToolResultMessage({
          id: validatedToolCall.id,
          tool: validatedToolCall.tool,
          success: !toolResult.startsWith('Error:'),
          result: toolResult,
        });

        const resultStep: RunStep = {
          id: `step-${randomUUID()}`,
          type: 'tool_result',
          content: typeof structuredResult.result === 'string' ? structuredResult.result : JSON.stringify(structuredResult.result),
          timestamp: new Date().toISOString(),
        };
        state.steps.push(resultStep);
        onStep?.(resultStep);
        this.publishRunEvent(state, instance, { kind: 'tool_result', step: resultStep });

        state.messages.push({ role: 'tool', content: toolResult, toolCallId: toolCall.id });

        if (toolCall.function.name === 'complete') {
          const completion = parseCompleteOrErrorMessage({ type: 'complete', summary: toolResult });
          if (completion) {
            state.status = 'completed';
            const completeStep: RunStep = {
              id: `step-${randomUUID()}`,
              type: 'completion',
              content: toolResult,
              timestamp: new Date().toISOString(),
            };
            state.steps.push(completeStep);
            onStep?.(completeStep);
            this.publishRunEvent(state, instance, { kind: 'complete', step: completeStep });
          }
          return;
        }
      }
    } finally {
      state.processingQueue = false;
    }
  }


  private publishRunEvent(
    state: AgentRunState,
    instance: AgentInstance,
    payload: Record<string, unknown>
  ): void {
    const budSession = budSessionDb.getByRunId(state.runId);
    if (!budSession) {
      return;
    }

    wsServer.publishBudEvent(budSession.sessionId, {
      runId: state.runId,
      instanceId: instance.id,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }

  /**
   * Finalize a run
   */
  private async finalizeRun(state: AgentRunState, instance: AgentInstance): Promise<void> {
    // Update instance
    instance.status = state.status === 'completed' ? 'idle' : (state.status === 'killed' ? 'paused' : 'error');
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

    const budSession = budSessionDb.getByRunId(state.runId);
    if (budSession) {
      const now = new Date().toISOString();
      budSessionDb.upsert({
        ...budSession,
        status: state.status,
        updatedAt: now,
        lastSeenAt: now,
      });
      this.publishRunEvent(state, instance, { kind: 'status', status: state.status });
    }

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
    const instance = agentManager.getInstance(state.instanceId);
    if (instance) {
      void this.processQueuedToolCalls(state, instance, undefined);
    }
    return true;
  }

  async killRun(runId: string): Promise<boolean> {
    const state = this.activeRuns.get(runId);
    if (!state || (state.status !== 'running' && state.status !== 'paused')) return false;

    state.status = 'killed';
    state.queuedToolCalls = [];

    const instance = agentManager.getInstance(state.instanceId);
    if (instance) {
      await audit.log({
        id: randomUUID(),
        projectId: instance.projectId,
        actorType: 'user',
        actorId: 'system',
        actionType: 'AGENT_RUN_KILLED',
        payload: { runId },
        createdAt: new Date().toISOString(),
      });
      await this.finalizeRun(state, instance);
    }

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

function safeParseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export const agentRunner = new AgentRunner();
