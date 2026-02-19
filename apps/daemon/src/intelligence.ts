import { execFileSync } from 'child_process';
import { supervisor } from './supervisor';
import { projects } from './store/projects';

export interface IntelligenceSuggestion {
  id: string;
  type: 'suggestion' | 'warning';
  title: string;
  detail: string;
  blockable?: boolean;
}

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-fdx/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/i,
];

function safeGitStatusCount(projectRoot: string): number {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return output.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function getIntelligenceInsights(projectId: string): IntelligenceSuggestion[] {
  const project = projects.get(projectId);
  if (!project) {
    return [];
  }

  const suggestions: IntelligenceSuggestion[] = [];

  const changedFiles = safeGitStatusCount(project.rootPath);
  if (changedFiles >= 20) {
    suggestions.push({
      id: 'many-files-changed',
      type: 'suggestion',
      title: 'Large change set detected',
      detail: `${changedFiles} files changed. Consider running git diff and using a commit checklist before finalize.`,
    });
  }

  const runs = supervisor.listRuns(projectId);
  const recentFailed = runs.filter((r) => r.status === 'failed').slice(0, 3);
  if (recentFailed.length > 0) {
    suggestions.push({
      id: 'recent-failures',
      type: 'suggestion',
      title: 'Recent failed runs',
      detail: `${recentFailed.length} recent run(s) failed. Suggest opening logs or rerunning tests with Bud assistance.`,
    });
  }

  const runningCommandRuns = runs.filter((r) => r.type === 'command' && r.status === 'running');
  if (runningCommandRuns.length > 0) {
    suggestions.push({
      id: 'long-command',
      type: 'suggestion',
      title: 'Long-running command in progress',
      detail: `There are ${runningCommandRuns.length} active command run(s). Consider backgrounding or canceling if no progress.`,
    });
  }

  for (const run of runs.slice(0, 20)) {
    const summary = (run.summary || '').toLowerCase();
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(summary)) {
        suggestions.push({
          id: `danger-${run.id}-${pattern.source}`,
          type: 'warning',
          title: 'Potentially destructive command pattern',
          detail: `Detected risky pattern in recent run summary (${run.id.slice(0, 8)}…).`,
          blockable: true,
        });
        break;
      }
    }
  }

  return suggestions.slice(0, 20);
}
