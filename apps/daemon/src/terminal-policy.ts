import path from 'path';
import { projects } from './store/projects';
import { sandbox } from './sandbox';

export interface TerminalPolicyResult {
  allowed: boolean;
  code?: string;
  error?: string;
  realCwd?: string;
}

export function validateTerminalAccess(projectId: string, cwd?: string): TerminalPolicyResult {
  const project = projects.get(projectId);
  if (!project) {
    return { allowed: false, code: 'PROJECT_NOT_FOUND', error: 'Project not found' };
  }

  if (project.settings.safeMode) {
    return { allowed: false, code: 'SAFE_MODE_BLOCK', error: 'Terminal blocked: safe mode enabled' };
  }

  if (!project.settings.capabilities.EXEC_SHELL) {
    return { allowed: false, code: 'EXEC_SHELL_DISABLED', error: 'Terminal blocked: EXEC_SHELL capability disabled' };
  }

  // Force cwd within project sandbox root. Reuse sandbox utility for boundary-safe checks.
  const requested = cwd && cwd.trim().length > 0 ? cwd : '.';
  const pathCheck = sandbox.validatePath(projectId, requested);
  if (!pathCheck.allowed || !pathCheck.realPath) {
    return {
      allowed: false,
      code: 'PATH_OUTSIDE_SANDBOX',
      error: pathCheck.error || 'Terminal blocked: invalid working directory',
    };
  }

  const projectRootCheck = sandbox.getProjectPath(projectId);
  if (!projectRootCheck.allowed) {
    return {
      allowed: false,
      code: 'PROJECT_PATH_INVALID',
      error: projectRootCheck.error || 'Invalid project path',
    };
  }

  const relative = path.relative(projectRootCheck.path, pathCheck.realPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      allowed: false,
      code: 'PATH_OUTSIDE_SANDBOX',
      error: 'Terminal blocked: cwd outside project boundary',
    };
  }

  return {
    allowed: true,
    realCwd: pathCheck.realPath,
  };
}
