// Agent API Routes
// Phase 4: Agent management and spawning

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { agentManager } from '../agents';
import { audit } from '../audit';

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

  try {
    const { instance, runId } = await agentManager.spawn(
      definitionId,
      projectId,
      prompt,
      contextPackId
    );

    res.status(201).json({
      success: true,
      instance,
      runId,
      message: `Agent ${definitionId} spawned successfully`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to spawn agent', message: err.message });
  }
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

export { router as agentsRouter };
