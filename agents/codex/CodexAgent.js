import { AgentProtocol } from '../protocols/AgentProtocol.js';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Codex Agent - Integration with OpenAI Codex CLI
 */
export class CodexAgent extends AgentProtocol {
  constructor() {
    super('codex');
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async _runAgent(task) {
    return new Promise((resolve, reject) => {
      // Prepare the prompt with context
      const prompt = this._buildPrompt(task);
      
      // Change to workspace directory
      const cwd = task.workspacePath;
      
      // Spawn Codex CLI process
      // Note: This assumes `codex` CLI is installed and available
      const args = [
        '--approval-mode', 'full-auto', // Or 'suggest' for safety
        '--quiet',
        prompt
      ];

      this._log(task.id, 'info', `Starting Codex in ${cwd}`);
      
      this.process = spawn('codex', args, {
        cwd,
        env: {
          ...process.env,
          OPENAI_API_KEY: this.apiKey,
        },
        shell: true,
      });

      let stdout = '';
      let stderr = '';
      let cost = 0;

      this.process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Stream logs to dashboard
        this._log(task.id, 'info', chunk);
        
        // Parse cost if present in output
        const costMatch = chunk.match(/Cost:\s*\$?([\d.]+)/);
        if (costMatch) {
          cost = parseFloat(costMatch[1]);
        }
      });

      this.process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        this._log(task.id, 'warn', chunk);
      });

      this.process.on('close', (code) => {
        this.process = null;

        if (code === 0) {
          resolve({ output: stdout, cost });
        } else {
          const error = new Error(stderr || 'Codex execution failed');
          error.code = 'CODEX_ERROR';
          error.exitCode = code;
          reject(error);
        }
      });

      this.process.on('error', (error) => {
        this.process = null;
        error.code = 'CODEX_SPAWN_ERROR';
        reject(error);
      });

      // Timeout handling
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGTERM');
          const error = new Error('Task timed out after 2 minutes');
          error.code = 'TIMEOUT';
          reject(error);
        }
      }, 120000); // 2 minute timeout
    });
  }

  _buildPrompt(task) {
    // Build comprehensive prompt with context
    const parts = [
      `Task: ${task.title}`,
      '',
      `Description: ${task.description || 'No description provided'}`,
      '',
    ];

    if (task.context?.files?.length > 0) {
      parts.push('Relevant files:');
      parts.push(...task.context.files.map(f => `- ${f}`));
      parts.push('');
    }

    if (task.context?.systemMessage) {
      parts.push('Instructions:');
      parts.push(task.context.systemMessage);
      parts.push('');
    }

    parts.push(task.context?.prompt || '');

    return parts.join('\n');
  }
}

/**
 * Factory function to create appropriate agent
 */
export function createAgent(agentId) {
  switch (agentId) {
    case 'codex':
      return new CodexAgent();
    // Add other agents here
    default:
      throw new Error(`Unknown agent: ${agentId}`);
  }
}
