import { spawn, type ChildProcess } from 'child_process';

export interface OpenClawRunOptions {
  projectId: string;
  agentId: string;
  prompt: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onStart?: (pid?: number) => void;
  onTimeout?: () => void;
}

export interface OpenClawRunHandle {
  process: ChildProcess;
  args: string[];
}

function sanitizeArg(value: string): string {
  // Avoid accidental null-bytes and normalize whitespace-heavy args.
  return value.replace(/\0/g, '').trim();
}

class OpenClawAdapter {
  private readonly command = process.env.OPENCLAW_CMD || 'openclaw';

  runTask(options: OpenClawRunOptions): OpenClawRunHandle {
    const prompt = sanitizeArg(options.prompt);
    const agentId = sanitizeArg(options.agentId);

    const args = [
      'run',
      '--agent',
      agentId,
      '--project',
      options.projectId,
      '--prompt',
      prompt,
      '--stream',
    ];

    const child = spawn(this.command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        AGENTX_PROJECT_ID: options.projectId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    options.onStart?.(child.pid);

    const timeout = setTimeout(() => {
      options.onTimeout?.();
      try {
        child.kill('SIGTERM');
      } catch {
        // noop
      }

      setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null && child.pid) {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch {
            // noop
          }
        }
      }, 5000);
    }, options.timeoutMs);

    child.stdout?.on('data', (data) => {
      options.onStdout?.(data.toString());
    });

    child.stderr?.on('data', (data) => {
      options.onStderr?.(data.toString());
    });

    child.on('exit', () => {
      clearTimeout(timeout);
    });

    return { process: child, args };
  }
}

export const openclawAdapter = new OpenClawAdapter();
