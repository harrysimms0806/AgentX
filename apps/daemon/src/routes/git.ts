import { Router } from 'express';
import { projects } from '../store/projects';
import { randomUUID } from 'crypto';
import { audit } from '../audit';
import { getGitStatus, getUnifiedDiff, isGitRepo } from '../git-inspector';
import { policyDb } from '../database';
import { checkGitCommitPolicy, defaultProjectPolicy } from '../policy-engine';

const router = Router();

function actorIdFromReq(req: any): string {
  return req.session?.clientId || (req.headers['x-client-id'] as string) || 'unknown';
}

function requireProject(projectId: string, res: any) {
  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }

  if (!isGitRepo(project.rootPath)) {
    res.status(400).json({ error: 'Project root is not a git repository' });
    return null;
  }

  return project;
}

router.get('/status', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const project = requireProject(projectId, res);
  if (!project) return;

  try {
    const files = getGitStatus(project.rootPath);
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: actorIdFromReq(req),
      actionType: 'GIT_STATUS_READ',
      payload: { fileCount: files.length },
      createdAt: new Date().toISOString(),
    });

    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read git status', message: err?.message });
  }
});

router.get('/diff', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const filePath = req.query.path as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const project = requireProject(projectId, res);
  if (!project) return;

  try {
    const diff = getUnifiedDiff(project.rootPath, filePath);
    await audit.log({
      id: randomUUID(),
      projectId,
      actorType: 'user',
      actorId: actorIdFromReq(req),
      actionType: 'GIT_DIFF_READ',
      payload: {
        path: filePath || null,
        bytes: Buffer.byteLength(diff, 'utf8'),
      },
      createdAt: new Date().toISOString(),
    });

    res.json({ diff });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to read git diff', message: err?.message });
  }
});


router.post('/commit', async (req, res) => {
  const { projectId } = req.body;
  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const project = requireProject(projectId, res);
  if (!project) return;

  const policy = policyDb.getByProject(projectId) || defaultProjectPolicy;
  const policyCheck = checkGitCommitPolicy(policy);
  if (!policyCheck.allowed) {
    res.status(403).json({
      error: `Policy blocked: ${policyCheck.reason}`,
      code: policyCheck.code,
      requestApproval: policyCheck.requestApproval,
    });
    return;
  }

  res.status(501).json({ error: 'git commit endpoint not implemented yet' });
});

export { router as gitRouter };
