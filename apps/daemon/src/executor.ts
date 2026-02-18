// AI Model Integration
// Phase 5: Connect agents to LLMs for actual execution

import { randomUUID } from 'crypto';
import path from 'path';
import type { AgentDefinition, AgentInstance, ContextPack, AgentTask } from './agents';

// Model providers
export type ModelProvider = 'openai' | 'anthropic' | 'ollama' | 'openclaw';

// Model configuration
export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
}

// Message in conversation
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

// Tool/function call
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Tool definition for model
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Available tools for agents
export const agentTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runCommand',
      description: 'Execute a shell command in the project directory',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (optional, defaults to root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitStatus',
      description: 'Get git status of the project',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchFiles',
      description: 'Search for text in project files',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          path: { type: 'string', description: 'Directory to search in (optional)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete',
      description: 'Mark the task as complete',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of what was accomplished' },
        },
        required: ['summary'],
      },
    },
  },
];

// Execution result
export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  toolCalls?: ToolCall[];
  messages: Message[];
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// Agent executor class
export class AgentExecutor {
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  /**
   * Execute agent with a task
   */
  async execute(
    agent: AgentDefinition,
    instance: AgentInstance,
    contextPack: ContextPack,
    userPrompt: string,
    onMessage?: (msg: Message) => void
  ): Promise<ExecutionResult> {
    // Build conversation
    const messages = this.buildMessages(agent, contextPack, userPrompt);
    
    // Call model
    return this.callModel(messages, agent.capabilities, onMessage);
  }

  /**
   * Build message context for model
   */
  private buildMessages(
    agent: AgentDefinition,
    contextPack: ContextPack,
    userPrompt: string
  ): Message[] {
    const messages: Message[] = [];

    // System message with agent instructions
    messages.push({
      role: 'system',
      content: `${agent.systemPrompt}

You have access to the following tools. Use them to complete your task:
${agentTools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n')}

Project Context:
${contextPack.sections.summary}

Relevant Files:
${contextPack.sections.files.map(f => `- ${f.path}: ${f.summary}`).join('\n')}

Git Status:
${contextPack.sections.gitStatus}

User Notes:
${contextPack.sections.userNotes}

When you need to use a tool, respond with a tool call. When done, use the 'complete' tool.`,
    });

    // User prompt
    messages.push({
      role: 'user',
      content: userPrompt,
    });

    return messages;
  }

  /**
   * Call the AI model
   */
  private async callModel(
    messages: Message[],
    capabilities: string[],
    onMessage?: (msg: Message) => void
  ): Promise<ExecutionResult> {
    // Filter tools based on capabilities
    const availableTools = agentTools.filter(tool => {
      const toolName = tool.function.name;
      if (toolName === 'complete') return true; // Always allow complete
      
      const capabilityMap: Record<string, string> = {
        readFile: 'read_files',
        writeFile: 'write_files',
        runCommand: 'run_commands',
        listFiles: 'read_files',
        gitStatus: 'git_operations',
        searchFiles: 'read_files',
      };
      
      return capabilities.includes(capabilityMap[toolName]);
    });

    // For Phase 5, we'll implement a placeholder
    // In production, this would call OpenAI, Anthropic, etc.
    try {
      // Check if we have an API key
      if (!this.config.apiKey && this.config.provider !== 'ollama') {
        return {
          success: false,
          error: `No API key configured for ${this.config.provider}`,
          messages,
        };
      }

      // Placeholder: Simulate model response
      // In production: const response = await openai.chat.completions.create({...})
      
      const simulatedResponse: Message = {
        role: 'assistant',
        content: 'I understand your request. However, AI model integration requires an API key to be configured. Please set up your API key in the daemon configuration.',
      };

      if (onMessage) {
        onMessage(simulatedResponse);
      }

      return {
        success: true,
        output: simulatedResponse.content,
        messages: [...messages, simulatedResponse],
        tokensUsed: {
          prompt: JSON.stringify(messages).length / 4,
          completion: simulatedResponse.content.length / 4,
          total: (JSON.stringify(messages).length + simulatedResponse.content.length) / 4,
        },
      };

    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        messages,
      };
    }
  }

  /**
   * Execute a tool call
   */
  async executeTool(
    toolCall: ToolCall,
    projectId: string
  ): Promise<string> {
    const { name, arguments: argsStr } = toolCall.function;
    const args = JSON.parse(argsStr);

    // Import here to avoid circular dependencies
    const { sandbox } = await import('./sandbox');
    const { supervisor } = await import('./supervisor');

    switch (name) {
      case 'readFile': {
        const check = sandbox.validatePath(projectId, args.path);
        if (!check.allowed) return `Error: ${check.error}`;
        try {
          const fs = await import('fs');
          const content = fs.readFileSync(check.realPath!, 'utf8');
          return content;
        } catch (err: any) {
          return `Error reading file: ${err.message}`;
        }
      }

      case 'writeFile': {
        // Requires write capability check
        const check = sandbox.validatePath(projectId, args.path);
        if (!check.allowed) return `Error: ${check.error}`;
        try {
          const fs = await import('fs');
          fs.writeFileSync(check.realPath!, args.content);
          return `File ${args.path} written successfully`;
        } catch (err: any) {
          return `Error writing file: ${err.message}`;
        }
      }

      case 'runCommand': {
        // Parse command into cmd and args
        const parts = args.command.split(' ');
        const cmd = parts[0];
        const cmdArgs = parts.slice(1);
        
        // Create run first
        const run = supervisor.createRun(projectId, 'command');
        
        // Spawn command
        const projectPath = sandbox.getProjectPath(projectId);
        if (!projectPath.allowed) return `Error: ${projectPath.error}`;
        
        const cwd = args.cwd ? path.join(projectPath.path, args.cwd) : projectPath.path;
        
        supervisor.spawnCommand(run.id, cmd, cmdArgs, cwd);
        
        return `Command started with run ID: ${run.id}`;
      }

      case 'listFiles': {
        const check = sandbox.validatePath(projectId, args.path || '.');
        if (!check.allowed) return `Error: ${check.error}`;
        try {
          const fs = await import('fs');
          const entries = fs.readdirSync(check.realPath!, { withFileTypes: true });
          return entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
        } catch (err: any) {
          return `Error listing files: ${err.message}`;
        }
      }

      case 'gitStatus': {
        // This would call the git route
        return 'Git status: Not implemented in tool executor';
      }

      case 'searchFiles': {
        // Simple grep-like search
        return `Search for "${args.query}": Not implemented`;
      }

      case 'complete': {
        return `Task completed: ${args.summary}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}

// Factory for creating executors
export function createExecutor(config?: Partial<ModelConfig>): AgentExecutor {
  const fullConfig: ModelConfig = {
    provider: config?.provider || 'openai',
    model: config?.model || 'gpt-4',
    apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
    temperature: config?.temperature ?? 0.7,
    maxTokens: config?.maxTokens || 4000,
    ...config,
  };

  return new AgentExecutor(fullConfig);
}
