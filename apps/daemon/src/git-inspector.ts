import { execFileSync } from 'child_process';
import path from 'path';

export type GitFileStatus = {
  path: string;
  stagedStatus: string;
  unstagedStatus: string;
};

function runGit(projectRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
}

function normalizeRelativePath(projectRoot: string, filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, '/');
  const absolute = path.resolve(projectRoot, normalized);
  const relative = path.relative(projectRoot, absolute).replace(/\\/g, '/');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path outside project root');
  }
  return relative;
}

export function isGitRepo(projectRoot: string): boolean {
  try {
    const output = runGit(projectRoot, ['rev-parse', '--is-inside-work-tree']).trim();
    return output === 'true';
  } catch {
    return false;
  }
}

export function getGitStatus(projectRoot: string): GitFileStatus[] {
  const output = runGit(projectRoot, ['status', '--porcelain']);
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const filePath = line.slice(3);
      return {
        path: filePath,
        stagedStatus: status[0] === ' ' ? '' : status[0],
        unstagedStatus: status[1] === ' ' ? '' : status[1],
      };
    });
}

export function getUnifiedDiff(projectRoot: string, filePath?: string): string {
  const normalizedPath = normalizeRelativePath(projectRoot, filePath);
  const args = ['diff', '--no-color', '--unified=3'];
  if (normalizedPath) {
    args.push('--', normalizedPath);
  }
  return runGit(projectRoot, args);
}

export type RunSummary = {
  intent: string;
  filesChanged: string[];
  riskyAreas: string[];
};

const RISKY_PATTERNS: Array<{ label: string; matcher: RegExp }> = [
  { label: 'Configuration', matcher: /(\.env(\.|$)|config|settings|\.ya?ml$|\.toml$|\.json$)/i },
  { label: 'Authentication / Authorization', matcher: /(auth|permission|policy|token|session)/i },
  { label: 'Database / Migrations', matcher: /(migration|schema|db|database|sql)/i },
];

export function buildRunSummary(projectRoot: string, prompt: string): RunSummary {
  const filesChanged = getGitStatus(projectRoot).map((item) => item.path);
  const risky = new Set<string>();

  for (const filePath of filesChanged) {
    for (const pattern of RISKY_PATTERNS) {
      if (pattern.matcher.test(filePath)) {
        risky.add(pattern.label);
      }
    }
  }

  return {
    intent: prompt.trim().slice(0, 280),
    filesChanged,
    riskyAreas: Array.from(risky),
  };
}
