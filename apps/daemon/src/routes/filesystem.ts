// Filesystem operations - ALL paths go through sandbox validation
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { sandbox } from '../sandbox';
import { audit } from '../audit';
import { projects } from '../store/projects';
import { FileNode } from '@agentx/api-types';

const router = Router();

// Helper to check write capabilities
function canWrite(req: any, projectId: string): { allowed: boolean; error?: string } {
  const project = projects.get(projectId);
  
  if (!project) {
    return { allowed: false, error: 'Project not found' };
  }
  
  // Check safeMode - if enabled, no writes allowed
  if (project.settings.safeMode) {
    return { 
      allowed: false, 
      error: 'Write denied: project is in safe mode. Disable safeMode to enable writes.' 
    };
  }
  
  // Check FS_WRITE capability
  if (!project.settings.capabilities.FS_WRITE) {
    return { 
      allowed: false, 
      error: 'Write denied: FS_WRITE capability not enabled for this project.' 
    };
  }
  
  return { allowed: true };
}

// GET /fs/tree?projectId= - Get file tree
router.get('/tree', (req, res) => {
  const { projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId required' });
    return;
  }

  const check = sandbox.validatePath(projectId, '.');
  if (!check.allowed) {
    res.status(403).json({ error: check.error });
    return;
  }

  function buildTree(dirPath: string, relativePath: string = ''): FileNode[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      // Skip hidden files and special directories
      if (entry.name.startsWith('.') && entry.name !== '.git') continue;
      if (entry.name === 'node_modules') continue;

      const entryPath = path.join(relativePath, entry.name);
      const fullPath = path.join(dirPath, entry.name);
      const stats = fs.statSync(fullPath);

      const node: FileNode = {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? stats.size : undefined,
        modifiedAt: stats.mtime.toISOString(),
      };

      if (entry.isDirectory()) {
        node.children = buildTree(fullPath, entryPath);
      }

      nodes.push(node);
    }

    return nodes;
  }

  try {
    const tree = buildTree(check.realPath!);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: `Failed to read directory: ${err}` });
  }
});

// GET /fs/read?projectId=&path= - Read file
router.get('/read', (req, res) => {
  const { projectId, path: filePath } = req.query;
  
  if (!projectId || !filePath || typeof projectId !== 'string' || typeof filePath !== 'string') {
    res.status(400).json({ error: 'projectId and path required' });
    return;
  }

  const check = sandbox.validatePath(projectId, filePath);
  if (!check.allowed) {
    res.status(403).json({ error: check.error });
    return;
  }

  try {
    if (!fs.existsSync(check.realPath!)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const content = fs.readFileSync(check.realPath!, 'utf8');
    
    audit.logLegacy(projectId, 'user', 'FILE_READ', { path: filePath }, (req as any).session?.clientId);
    
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: `Failed to read file: ${err}` });
  }
});

// PUT /fs/write - Write file (requires capabilities + lock)
router.put('/write', (req, res) => {
  const { projectId, path: filePath, content } = req.body;
  
  if (!projectId || !filePath || typeof content !== 'string') {
    res.status(400).json({ error: 'projectId, path, and content required' });
    return;
  }

  // Check write capability
  const writeCheck = canWrite(req, projectId);
  if (!writeCheck.allowed) {
    res.status(403).json({ error: writeCheck.error || 'Write not allowed' });
    return;
  }

  const check = sandbox.validatePath(projectId, filePath);
  if (!check.allowed) {
    res.status(403).json({ error: check.error });
    return;
  }

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(check.realPath!);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(check.realPath!, content, 'utf8');
    
    audit.logLegacy(projectId, 'user', 'FILE_WRITE', { path: filePath, size: content.length }, (req as any).session?.clientId);
    
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: `Failed to write file: ${err}` });
  }
});

// POST /fs/delete - Soft delete file
router.post('/delete', (req, res) => {
  const { projectId, path: filePath } = req.body;
  
  if (!projectId || !filePath) {
    res.status(400).json({ error: 'projectId and path required' });
    return;
  }

  const writeCheck = canWrite(req, projectId);
  if (!writeCheck.allowed) {
    res.status(403).json({ error: writeCheck.error || 'Delete not allowed' });
    return;
  }

  const result = sandbox.softDelete(projectId, filePath);
  
  if (!result.allowed) {
    res.status(403).json({ error: result.error });
    return;
  }

  audit.logLegacy(projectId, 'user', 'FILE_DELETE', { path: filePath, trashPath: result.realPath }, (req as any).session?.clientId);
  
  res.json({ success: true, trashPath: result.realPath });
});

// POST /fs/rename - Rename file
router.post('/rename', (req, res) => {
  const { projectId, oldPath, newPath } = req.body;
  
  if (!projectId || !oldPath || !newPath) {
    res.status(400).json({ error: 'projectId, oldPath, and newPath required' });
    return;
  }

  const writeCheck = canWrite(req, projectId);
  if (!writeCheck.allowed) {
    res.status(403).json({ error: writeCheck.error || 'Rename not allowed' });
    return;
  }

  const oldCheck = sandbox.validatePath(projectId, oldPath);
  const newCheck = sandbox.validatePath(projectId, newPath);

  if (!oldCheck.allowed) {
    res.status(403).json({ error: `Source: ${oldCheck.error}` });
    return;
  }

  if (!newCheck.allowed) {
    res.status(403).json({ error: `Destination: ${newCheck.error}` });
    return;
  }

  try {
    fs.renameSync(oldCheck.realPath!, newCheck.realPath!);
    
    audit.logLegacy(projectId, 'user', 'FILE_RENAME', { oldPath, newPath }, (req as any).session?.clientId);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to rename: ${err}` });
  }
});

export { router as fsRouter };
