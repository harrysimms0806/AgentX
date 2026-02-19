import path from 'path';

export type ApprovalAction = 'write_files' | 'run_commands' | 'git_commit';

export interface ProjectPolicy {
  allowedWriteGlobs: string[];
  blockedCommandPatterns: string[];
  approvalRequiredFor: ApprovalAction[];
  maxFilesChangedPerRun: number;
}

export const defaultProjectPolicy: ProjectPolicy = {
  allowedWriteGlobs: ['**'],
  blockedCommandPatterns: [],
  approvalRequiredFor: [],
  maxFilesChangedPerRun: 20,
};

export type PolicyCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: 'POLICY_BLOCKED'; requestApproval: boolean };

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isPathAllowedByGlobs(targetPath: string, globs: string[]): boolean {
  if (globs.length === 0) return false;
  const normalized = targetPath.replace(/\\/g, '/');
  return globs.some((glob) => globToRegex(glob).test(normalized));
}

export function checkWritePathPolicy(policy: ProjectPolicy, filePath: string): PolicyCheckResult {
  if (!isPathAllowedByGlobs(filePath, policy.allowedWriteGlobs)) {
    return {
      allowed: false,
      code: 'POLICY_BLOCKED',
      reason: `Path "${filePath}" is outside allowedWriteGlobs`,
      requestApproval: policy.approvalRequiredFor.includes('write_files'),
    };
  }
  return { allowed: true };
}

export function checkCommandPolicy(policy: ProjectPolicy, command: string): PolicyCheckResult {
  for (const pattern of policy.blockedCommandPatterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(command)) {
        return {
          allowed: false,
          code: 'POLICY_BLOCKED',
          reason: `Command matches blocked pattern: ${pattern}`,
          requestApproval: policy.approvalRequiredFor.includes('run_commands'),
        };
      }
    } catch {
      continue;
    }
  }

  if (policy.approvalRequiredFor.includes('run_commands')) {
    return {
      allowed: false,
      code: 'POLICY_BLOCKED',
      reason: 'Policy requires approval for run_commands',
      requestApproval: true,
    };
  }

  return { allowed: true };
}

export function checkGitCommitPolicy(policy: ProjectPolicy): PolicyCheckResult {
  if (policy.approvalRequiredFor.includes('git_commit')) {
    return {
      allowed: false,
      code: 'POLICY_BLOCKED',
      reason: 'Policy requires approval for git_commit',
      requestApproval: true,
    };
  }
  return { allowed: true };
}

export function ensureWithinRunFileLimit(
  policy: ProjectPolicy,
  touchedFiles: Set<string>,
  filePath: string,
): PolicyCheckResult {
  const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'));
  const next = new Set(touchedFiles);
  next.add(normalized);

  if (next.size > policy.maxFilesChangedPerRun) {
    return {
      allowed: false,
      code: 'POLICY_BLOCKED',
      reason: `Policy maxFilesChangedPerRun exceeded (${policy.maxFilesChangedPerRun})`,
      requestApproval: policy.approvalRequiredFor.includes('write_files'),
    };
  }

  return { allowed: true };
}
