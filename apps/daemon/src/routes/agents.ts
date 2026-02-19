// Agent API Routes
// Phase 4-5: Agent management, spawning, and execution

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { agentManager } from '../agents';
import { agentRunner } from '../agent-runner';
import { audit } from '../audit';
import { projects } from '../store/projects';
import { budSessionDb, projectBriefDb } from '../database';
import { renderInjectedContext } from '../context-pack';

const router = Router();

// Initialize agent manager
let initialized = false;
function ensureInit() {
  if (!initialized) {
    agentManager.initialize();
    initialized = true;
  }
}

// GET /agents/definitions - List agent definitions
router.get('/definitions', (req, res) => {
  ensureInit();
  const definitions = agentManager.getDefinitions();
  res.json({ definitions });
});

// GET /agents/definitions/:id - Get specific definition
router.get('/definitions/:id', (req, res) => {
  ensureInit();
  const { id } = req.params;
  const definition = agentManager.getDefinition(id);
  
  if (!definition) {
    res.status(404).json({ error: 'Agent definition not found' });
    return;
  }
  
  res.json({ definition });
});

// POST /agents/definitions - Create custom agent
router.post('/definitions', async (req, res) => {
  ensureInit();
  const { name, type, description, systemPrompt, capabilities, maxIterations, timeoutMinutes } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';

  if (!name || !systemPrompt) {
    res.status(400).json({ error: 'name and systemPrompt are required' });
    return;
  }

  try {
    const definition = agentManager.createDefinition({
      name,
      type: type || 'custom',
      description: description || '',
      systemPrompt,
      capabilities: capabilities || ['read_files', 'write_files'],
      maxIterations: maxIterations || 10,
      timeoutMinutes: timeoutMinutes || 30,
    });

    await audit.log({
      id: randomUUID(),
      projectId: '',
      actorType: 'user',
      actorId: clientId,
      actionType: 'AGENT_DEFINITION_CREATE',
      payload: { definitionId: definition.id },
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ definition });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create agent definition', message: err.message });
  }
});

// GET /agents/instances - List agent instances
router.get('/instances', (req, res) => {
  ensureInit();
  const { projectId } = req.query;
  
  const instances = projectId
    ? agentManager.getInstancesByProject(projectId as string)
    : Array.from(agentManager['instances'].values());
  
  res.json({ instances });
});

// GET /agents/instances/:id - Get specific instance
router.get('/instances/:id', (req, res) => {
  ensureInit();
  const { id } = req.params;
  const instance = agentManager.getInstance(id);
  
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found' });
    return;
  }
  
  const tasks = agentManager.getTasks(id);
  
  res.json({ instance, tasks });
});

// POST /agents/spawn - Spawn a new agent
router.post('/spawn', async (req, res) => {
  ensureInit();
  const { definitionId, projectId, prompt, contextPackId } = req.body;

  if (!definitionId || !projectId || !prompt) {
    res.status(400).json({ error: 'definitionId, projectId, and prompt are required' });
    return;
  }

  // Validate projectId format
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId format' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (!project.settings.capabilities.OPENCLAW_RUN) {
    res.status(403).json({ error: 'OpenClaw runs are disabled for this project (OPENCLAW_RUN off)' });
    return;
  }

  if (project.settings.safeMode) {
    res.status(403).json({ error: 'OpenClaw run blocked: safe mode is enabled for this project' });
    return;
  }

  try {
    const { instance, runId } = await agentManager.spawn(
      definitionId,
      projectId,
      prompt,
      contextPackId
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const sessionId = randomUUID();

    budSessionDb.upsert({
      sessionId,
      runId,
      projectId,
      status: 'running',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
      lastKnownTask: prompt.slice(0, 300),
      lastSeenAt: now.toISOString(),
    });

    res.status(201).json({
      success: true,
      instance,
      runId,
      sessionId,
      message: `Agent ${definitionId} spawned successfully`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to spawn agent', message: err.message });
  }
});


// GET /agents/sessions - List resumable Bud sessions
router.get('/sessions', (req, res) => {
  ensureInit();
  const projectId = req.query.projectId as string | undefined;
  const sessions = budSessionDb.list(projectId);
  res.json({ sessions });
});

// POST /agents/sessions/:id/resume - Mark session as resumed and refresh expiry
router.post('/sessions/:id/resume', (req, res) => {
  ensureInit();
  const existing = budSessionDb.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  const now = new Date();
  budSessionDb.upsert({
    ...existing,
    status: existing.status === 'expired' ? 'expired' : 'running',
    updatedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });

  res.json({ success: true, session: budSessionDb.getById(existing.sessionId) });
});

// POST /agents/sessions/:id/start-new - Mark old session closed when user starts fresh
router.post('/sessions/:id/start-new', (req, res) => {
  ensureInit();
  const existing = budSessionDb.getById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  const now = new Date().toISOString();
  budSessionDb.upsert({
    ...existing,
    status: 'closed',
    updatedAt: now,
    lastSeenAt: now,
  });

  res.json({ success: true });
});


// POST /agents/spawn-bud - Spawn a Bud/OpenClaw session explicitly
router.post('/spawn-bud', async (req, res) => {
  ensureInit();
  const { definitionId, projectId, prompt, contextPackId } = req.body;

  if (!definitionId || !projectId || !prompt) {
    res.status(400).json({ error: 'definitionId, projectId, and prompt are required' });
    return;
  }

  try {
    const result = await agentManager.spawn(definitionId, projectId, prompt, contextPackId);
    const now = new Date();
    const sessionId = randomUUID();

    budSessionDb.upsert({
      sessionId,
      runId: result.runId,
      projectId,
      status: 'running',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      lastKnownTask: prompt.slice(0, 300),
      lastSeenAt: now.toISOString(),
    });

    res.status(201).json({ success: true, sessionId, ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to spawn Bud session', message: err.message });
  }
});

// GET /agents/bud/:sessionId/status - Bud session status
router.get('/bud/:sessionId/status', (req, res) => {
  ensureInit();
  const session = budSessionDb.getById(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  const run = session.runId ? agentRunner.getRun(session.runId) : undefined;
  res.json({ session, run });
});

// DELETE /agents/bud/:sessionId - kill Bud session
router.delete('/bud/:sessionId', async (req, res) => {
  ensureInit();
  const session = budSessionDb.getById(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  if (session.runId) {
    await agentRunner.killRun(session.runId);
  }

  const now = new Date().toISOString();
  budSessionDb.upsert({
    ...session,
    status: 'killed',
    updatedAt: now,
    lastSeenAt: now,
  });

  res.json({ success: true });
});

// POST /agents/context-pack/preview - Build context pack preview before send
router.post('/context-pack/preview', async (req, res) => {
  ensureInit();
  const {
    projectId,
    prompt,
    activeTask,
    openFiles,
    recentChanges,
    userNotes,
    userSnippets,
    maxChars,
  } = req.body;

  if (!projectId || !prompt) {
    res.status(400).json({ error: 'projectId and prompt are required' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const pack = await agentManager.previewContextPack({
      projectId,
      projectRootPath: project.rootPath,
      prompt,
      activeTask,
      openFiles,
      recentChanges,
      userNotes,
      userSnippets,
      maxChars,
    });

    res.status(201).json({
      contextPack: pack,
      injectedContext: renderInjectedContext(pack),
      budget: {
        usedChars: pack.sizeChars,
        maxChars: pack.budgetChars,
        truncated: Boolean(pack.truncated),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate context pack preview', message: err.message });
  }
});


// GET /agents/context-packs - List persisted context packs for project
router.get('/context-packs', (req, res) => {
  ensureInit();
  const projectId = req.query.projectId as string;
  const runId = req.query.runId as string | undefined;

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const packs = agentManager.getStoredContextPacks(projectId, runId);
  res.json({ contextPacks: packs });
});

// GET /agents/context-pack/:id - Retrieve persisted context pack for audit/replay
router.get('/context-pack/:id', (req, res) => {
  ensureInit();
  const { id } = req.params;
  const projectId = req.query.projectId as string;

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const packs = agentManager.getStoredContextPacks(projectId);
  const pack = packs.find((candidate) => candidate.id === id);

  if (!pack) {
    res.status(404).json({ error: 'Context pack not found' });
    return;
  }

  res.json({
    contextPack: pack,
    projectBrief: projectBriefDb.list(projectId),
    injectedContext: renderInjectedContext(pack),
  });
});

// POST /agents/instances/:id/task - Add a task/checkpoint
router.post('/instances/:id/task', (req, res) => {
  ensureInit();
  const { id } = req.params;
  const { type, description, payload, approved } = req.body;

  const instance = agentManager.getInstance(id);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found' });
    return;
  }

  const task = agentManager.addTask(id, {
    type: type || 'action',
    description,
    payload,
    approved: approved ?? true,
  });

  res.status(201).json({ task });
});

// POST /agents/instances/:id/handoff - Handoff to another agent
router.post('/instances/:id/handoff', async (req, res) => {
  ensureInit();
  const { id } = req.params;
  const { toDefinitionId, message } = req.body;

  if (!toDefinitionId) {
    res.status(400).json({ error: 'toDefinitionId is required' });
    return;
  }

  try {
    const newInstance = await agentManager.handoff(id, toDefinitionId, message || '');
    
    res.json({
      success: true,
      fromInstanceId: id,
      toInstance: newInstance,
      message: `Handoff to ${toDefinitionId} complete`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Handoff failed', message: err.message });
  }
});

// POST /agents/instances/:id/execute - Execute agent with AI (Phase 5)
router.post('/instances/:id/execute', async (req, res) => {
  ensureInit();
  const { id } = req.params;
  const { prompt } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  const instance = agentManager.getInstance(id);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found' });
    return;
  }

  if (instance.status === 'running') {
    res.status(409).json({ error: 'Agent is already running' });
    return;
  }

  try {
    const result = await agentRunner.startRun(id, prompt, (step) => {
      // In production, this would stream via WebSocket
      console.log(`Run step: ${step.type} - ${step.content.slice(0, 100)}`);
    });

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      runId: result.runId,
      message: 'Agent execution started',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Execution failed', message: err.message });
  }
});

// GET /agents/runs/:runId - Get run status and steps
router.get('/runs/:runId', (req, res) => {
  ensureInit();
  const { runId } = req.params;
  
  const run = agentRunner.getRun(runId);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  
  res.json({
    runId: run.runId,
    instanceId: run.instanceId,
    status: run.status,
    iteration: run.iteration,
    maxIterations: run.maxIterations,
    steps: run.steps,
  });
});

// POST /agents/runs/:runId/pause - Pause a running agent
router.post('/runs/:runId/pause', (req, res) => {
  ensureInit();
  const { runId } = req.params;
  
  const success = agentRunner.pauseRun(runId);
  if (success) {
    res.json({ success: true, message: 'Run paused' });
  } else {
    res.status(400).json({ error: 'Run not found or not running' });
  }
});

// POST /agents/runs/:runId/resume - Resume a paused agent
router.post('/runs/:runId/resume', (req, res) => {
  ensureInit();
  const { runId } = req.params;
  
  const success = agentRunner.resumeRun(runId);
  if (success) {
    res.json({ success: true, message: 'Run resumed' });
  } else {
    res.status(400).json({ error: 'Run not found or not paused' });
  }
});


// POST /agents/runs/:runId/kill - Kill an active agent run
router.post('/runs/:runId/kill', async (req, res) => {
  ensureInit();
  const { runId } = req.params;

  const success = await agentRunner.killRun(runId);
  if (!success) {
    res.status(400).json({ error: 'Run not found or not active' });
    return;
  }

  res.json({ success: true, message: 'Run killed' });
});

// DELETE /agents/instances/:id - Stop/kill agent
router.delete('/instances/:id', async (req, res) => {
  ensureInit();
  const { id } = req.params;
  const clientId = (req as any).session?.clientId || 'unknown';

  const instance = agentManager.getInstance(id);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found' });
    return;
  }

  if (instance.runId) {
    await agentRunner.killRun(instance.runId);
  }

  // Update status
  instance.status = 'paused';

  await audit.log({
    id: randomUUID(),
    projectId: instance.projectId,
    actorType: 'user',
    actorId: clientId,
    actionType: 'AGENT_STOP',
    payload: { instanceId: id },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Agent stopped' });
});


// GET /agents/project-brief - list pinned snippets
router.get('/project-brief', async (req, res) => {
  const projectId = req.query.projectId as string;
  const clientId = (req as any).session?.clientId || 'unknown';
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const snippets = projectBriefDb.list(projectId);
  await audit.log({
    id: randomUUID(),
    projectId,
    actorType: 'user',
    actorId: clientId,
    actionType: 'PROJECT_BRIEF_READ',
    payload: { count: snippets.length },
    createdAt: new Date().toISOString(),
  });

  res.json({ snippets });
});

// POST /agents/project-brief/pin
router.post('/project-brief/pin', async (req, res) => {
  const { projectId, snippet } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';
  if (!projectId || !snippet || typeof snippet !== 'object') {
    res.status(400).json({ error: 'projectId and snippet are required' });
    return;
  }

  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const snippetId = String((snippet as any).id || `brief-${Date.now()}`);
  projectBriefDb.upsert(projectId, snippetId, snippet);

  await audit.log({
    id: randomUUID(),
    projectId,
    actorType: 'user',
    actorId: clientId,
    actionType: 'PROJECT_BRIEF_PIN',
    payload: { snippetId },
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ success: true, snippetId });
});

// POST /agents/project-brief/unpin
router.post('/project-brief/unpin', async (req, res) => {
  const { projectId, snippetId } = req.body;
  const clientId = (req as any).session?.clientId || 'unknown';
  if (!projectId || !snippetId) {
    res.status(400).json({ error: 'projectId and snippetId are required' });
    return;
  }

  const removed = projectBriefDb.remove(projectId, snippetId);
  if (!removed) {
    res.status(404).json({ error: 'Pinned snippet not found' });
    return;
  }

  await audit.log({
    id: randomUUID(),
    projectId,
    actorType: 'user',
    actorId: clientId,
    actionType: 'PROJECT_BRIEF_UNPIN',
    payload: { snippetId },
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true });
});

export { router as agentsRouter };
