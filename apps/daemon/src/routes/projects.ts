// Projects management
import { Router } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { sandbox } from '../sandbox';
import { audit } from '../audit';
import { Project, ProjectSettings } from '@agentx/api-types';

const router = Router();

// In-memory store for Phase 0 (replace with SQLite in future)
const projects: Map<string, Project> = new Map();

// Default project settings
const defaultSettings: ProjectSettings = {
  capabilities: {
    FS_READ: true,
    FS_WRITE: false, // Safe mode default
    EXEC_SHELL: false,
    NETWORK: false,
    GIT_WRITE: false,
    OPENCLAW_RUN: false,
  },
  safeMode: true,
  preferredAgents: [],
};

// GET /projects - List all projects
router.get('/', (req, res) => {
  const projectList = Array.from(projects.values());
  res.json(projectList);
});

// POST /projects - Create new project
router.post('/', (req, res) => {
  const { name } = req.body;
  
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Project name required' });
    return;
  }

  // Create safe project ID from name
  const id = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (projects.has(id)) {
    res.status(409).json({ error: 'Project already exists' });
    return;
  }

  // Create sandbox directory
  const createResult = sandbox.createProject(id);
  if (!createResult.success) {
    res.status(500).json({ error: createResult.error || 'Failed to create project directory' });
    return;
  }

  // Get project path
  const pathResult = sandbox.getProjectPath(id);
  if (!pathResult.allowed) {
    res.status(500).json({ error: pathResult.error || 'Failed to get project path' });
    return;
  }

  // Create project structure
  const projectPath = pathResult.path;
  fs.mkdirSync(path.join(projectPath, 'app'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'memory'), { recursive: true });

  // Create PROJECT.md template
  fs.writeFileSync(
    path.join(projectPath, 'PROJECT.md'),
    `# ${name}\n\nCreated: ${new Date().toISOString()}\n\n## Description\n\n## Goals\n\n## Notes\n`
  );

  // Create RULES.md
  fs.writeFileSync(
    path.join(projectPath, 'RULES.md'),
    `# ${name} Rules\n\nSafe Mode: ON\nCapabilities: READ ONLY\n`
  );

  const project: Project = {
    id,
    name,
    rootPath: projectPath,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    settings: defaultSettings,
  };

  projects.set(id, project);
  
  // Audit log
  audit.log(id, 'system', 'PROJECT_CREATE', { name }, 'daemon');

  res.status(201).json(project);
});

// POST /projects/:id/open - Open/switch to project
router.post('/:id/open', (req, res) => {
  const { id } = req.params;
  const project = projects.get(id);
  
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  project.lastOpenedAt = new Date().toISOString();
  
  audit.log(id, 'user', 'PROJECT_OPEN', {}, (req as any).session?.clientId);
  
  res.json(project);
});

// GET /projects/:id/settings - Get project settings
router.get('/:id/settings', (req, res) => {
  const { id } = req.params;
  const project = projects.get(id);
  
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(project.settings);
});

// PUT /projects/:id/settings - Update project settings
router.put('/:id/settings', (req, res) => {
  const { id } = req.params;
  const project = projects.get(id);
  
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { capabilities, safeMode, preferredAgents } = req.body;

  // Validate capability changes
  if (capabilities) {
    // Log capability changes for audit
    const oldCaps = project.settings.capabilities;
    const newCaps = { ...oldCaps, ...capabilities };
    
    audit.log(id, 'user', 'SETTINGS_CHANGE', {
      oldCapabilities: oldCaps,
      newCapabilities: newCaps,
    }, (req as any).session?.clientId);

    project.settings.capabilities = newCaps;
  }

  if (typeof safeMode === 'boolean') {
    audit.log(id, 'user', 'SAFE_MODE_CHANGE', {
      old: project.settings.safeMode,
      new: safeMode,
    }, (req as any).session?.clientId);
    
    project.settings.safeMode = safeMode;
  }

  if (preferredAgents) {
    project.settings.preferredAgents = preferredAgents;
  }

  res.json(project.settings);
});

export { router as projectsRouter };
