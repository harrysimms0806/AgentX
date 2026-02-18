// Git API Routes
// Phase 2: /git/status, /git/diff

import { Router } from 'express';
import { spawn } from 'child_process';
import { sandbox } from '../sandbox';
import { audit } from '../audit';
import { randomUUID } from 'crypto';
import path from 'path';

const router = Router();

// Helper to run git commands in project sandbox
async function runGit(projectId: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const projectResult = sandbox.getProjectPath(projectId);
  if (!projectResult.allowed) {
    throw new Error(projectResult.error || 'Invalid project');
  }
  const projectPath = projectResult.path;
  const workingDir = cwd ? path.join(projectPath, cwd) : projectPath;

  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd: workingDir,
      env: { ...process.env, GIT_PAGER: 'cat' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 });
    });
  });
}

// Parse git status porcelain output
function parseStatus(stdout: string): { branch: string; modified: string[]; staged: string[]; untracked: string[] } {
  const lines = stdout.trim().split('\n').filter(Boolean);
  let branch = 'unknown';
  const modified: string[] = [];
  const staged: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    // Branch info from --porcelain=v1
    if (line.startsWith('## ')) {
      branch = line.slice(3).split('...')[0];
      continue;
    }

    // Parse status code
    const statusCode = line.slice(0, 2);
    const filePath = line.slice(3);

    // Index (staged) status
    if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
      staged.push(filePath);
    }

    // Working tree status
    if (statusCode[1] === 'M') {
      modified.push(filePath);
    } else if (statusCode[1] === '?') {
      untracked.push(filePath);
    }
  }

  return { branch, modified, staged, untracked };
}

// GET /git/status/:projectId - Get git status for project
router.get('/status/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { path: subPath } = req.query;

  // Validation
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  try {
    const result = await runGit(projectId, ['status', '--porcelain', '-b'], subPath as string);

    if (result.exitCode !== 0) {
      // Not a git repo or other error
      if (result.stderr.includes('not a git repository')) {
        res.status(404).json({ 
          error: 'Not a git repository',
          branch: null,
          modified: [],
          staged: [],
          untracked: [],
          isGitRepo: false,
        });
        return;
      }
      res.status(500).json({ error: 'Git command failed', message: result.stderr });
      return;
    }

    const status = parseStatus(result.stdout);

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actionType: 'GIT_STATUS',
      payload: { path: subPath },
      createdAt: new Date().toISOString(),
    });

    res.json({
      ...status,
      isGitRepo: true,
      raw: result.stdout,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get git status', message: err.message });
  }
});

// GET /git/diff/:projectId - Get diff for files
router.get('/diff/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath, cached } = req.query;

  // Validation
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  // Sandbox validation for file path
  if (filePath) {
    const check = sandbox.validatePath(projectId, filePath as string);
    if (!check.allowed) {
      res.status(403).json({ error: 'Path outside sandbox', message: check.error });
      return;
    }
  }

  try {
    const args = ['diff'];
    if (cached) args.push('--cached');
    if (filePath) args.push('--', filePath as string);

    const result = await runGit(projectId, args);

    if (result.exitCode !== 0) {
      if (result.stderr.includes('not a git repository')) {
        res.status(404).json({ error: 'Not a git repository' });
        return;
      }
      res.status(500).json({ error: 'Git command failed', message: result.stderr });
      return;
    }

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actionType: 'GIT_DIFF',
      payload: { path: filePath, cached: !!cached },
      createdAt: new Date().toISOString(),
    });

    res.json({
      diff: result.stdout,
      hasChanges: result.stdout.length > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get git diff', message: err.message });
  }
});

// POST /git/commit/:projectId - Create a commit (requires FS_WRITE capability)
router.post('/commit/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { message, files } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Commit message is required' });
    return;
  }

  // Validation
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  try {
    // Stage files if specified
    if (files && Array.isArray(files) && files.length > 0) {
      const addResult = await runGit(projectId, ['add', '--', ...files]);
      if (addResult.exitCode !== 0) {
        res.status(500).json({ error: 'Failed to stage files', message: addResult.stderr });
        return;
      }
    }

    // Create commit
    const commitResult = await runGit(projectId, ['commit', '-m', message]);

    if (commitResult.exitCode !== 0) {
      res.status(500).json({ 
        error: 'Commit failed', 
        message: commitResult.stderr,
        output: commitResult.stdout 
      });
      return;
    }

    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actionType: 'GIT_COMMIT',
      payload: { message, files },
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Commit created',
      output: commitResult.stdout,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create commit', message: err.message });
  }
});

export { router as gitRouter };
