import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';
import { configBridge } from '../services/ConfigBridge.js';
import { broadcast } from '../server.js';

const router = Router();

/**
 * POST /agents/wizard/validate-step
 * Validate a step in the agent creation wizard
 */
router.post('/wizard/validate-step', (req, res) => {
  const { step, data } = req.body;
  
  const validations = {
    1: () => {
      // Basic info
      if (!data.name || data.name.length < 2) {
        return { valid: false, error: 'Name must be at least 2 characters' };
      }
      if (!data.type) {
        return { valid: false, error: 'Type is required' };
      }
      return { valid: true };
    },
    2: () => {
      // Provider & Model
      if (!data.provider) {
        return { valid: false, error: 'Provider is required' };
      }
      return { valid: true };
    },
    3: () => {
      // Capabilities
      if (!data.capabilities || data.capabilities.length === 0) {
        return { valid: false, error: 'At least one capability is required' };
      }
      return { valid: true };
    },
    4: () => {
      // Policy & Permissions
      return { valid: true };
    },
  };

  const validator = validations[step];
  if (!validator) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STEP', message: 'Invalid wizard step' },
    });
  }

  const result = validator();
  res.json({ success: true, data: result });
});

/**
 * POST /agents/wizard/create
 * Create agent from wizard data
 */
router.post('/wizard/create', (req, res) => {
  const {
    name,
    displayName,
    type,
    provider,
    model,
    capabilities,
    description,
    policy,
    avatar,
  } = req.body;

  // Validate required fields
  if (!name || !type || !provider) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Name, type, and provider are required' },
    });
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Check if agent already exists
  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(id);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'AGENT_EXISTS', message: 'An agent with this ID already exists' },
    });
  }

  // Insert agent
  db.prepare(`
    INSERT INTO agents (id, name, type, provider, model, capabilities, avatar, config, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle')
  `).run(
    id,
    displayName || name,
    type,
    provider,
    model || null,
    JSON.stringify(capabilities || []),
    avatar || '🤖',
    JSON.stringify({
      description,
      policy: policy || { allow: ['read'], deny: [] },
      createdVia: 'wizard',
    })
  );

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);

  // Broadcast new agent
  broadcast({
    type: 'agent:created',
    payload: { ...agent, capabilities: JSON.parse(agent.capabilities || '[]') },
  });

  res.status(201).json({
    success: true,
    data: {
      ...agent,
      capabilities: JSON.parse(agent.capabilities || '[]'),
      config: JSON.parse(agent.config || '{}'),
    },
  });
});

/**
 * GET /agents/wizard/templates
 * Get agent templates for wizard
 */
router.get('/wizard/templates', (req, res) => {
  const templates = [
    {
      id: 'coordinator',
      name: 'Coordinator',
      description: 'High-level planning and coordination agent',
      type: 'coordinator',
      provider: 'kimi',
      model: 'kimi-coding/k2p5',
      capabilities: ['planning', 'coordination', 'review'],
      emoji: '🧠',
    },
    {
      id: 'builder',
      name: 'Builder',
      description: 'Code generation and development agent',
      type: 'builder',
      provider: 'openai',
      model: 'codex',
      capabilities: ['code-generation', 'refactoring', 'debugging'],
      emoji: '🛠️',
    },
    {
      id: 'local',
      name: 'Local',
      description: 'Fast local model for quick edits',
      type: 'local',
      provider: 'ollama',
      model: 'qwen2.5-coder:14b',
      capabilities: ['quick-edits', 'css', 'simple-fixes'],
      emoji: '💻',
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Code review and quality assurance',
      type: 'cloud',
      provider: 'openai',
      model: 'gpt-4',
      capabilities: ['review', 'analysis', 'documentation'],
      emoji: '👀',
    },
  ];

  res.json({ success: true, data: templates });
});

/**
 * GET /agents/providers
 * Get available providers and models
 */
router.get('/providers', (req, res) => {
  const config = configBridge.getConfig();
  
  const providers = [
    {
      id: 'kimi',
      name: 'Kimi',
      models: [
        { id: 'kimi-coding/k2p5', name: 'Kimi K2.5', type: 'coder' },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      models: [
        { id: 'codex', name: 'Codex', type: 'coder' },
        { id: 'gpt-4', name: 'GPT-4', type: 'chat' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', type: 'chat' },
      ],
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      models: [
        { id: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B', type: 'local' },
        { id: 'llama3.2:3b', name: 'Llama 3.2 3B', type: 'local' },
        { id: 'codellama:7b', name: 'CodeLlama 7B', type: 'local' },
      ],
    },
  ];

  res.json({ success: true, data: providers });
});

/**
 * GET /agents/capabilities
 * Get available capabilities
 */
router.get('/capabilities', (req, res) => {
  const capabilities = [
    { id: 'read', name: 'Read', description: 'Read files and data' },
    { id: 'write', name: 'Write', description: 'Write and modify files' },
    { id: 'exec', name: 'Execute', description: 'Execute commands and scripts' },
    { id: 'admin', name: 'Admin', description: 'Administrative actions' },
    { id: 'planning', name: 'Planning', description: 'Task planning and coordination' },
    { id: 'code-generation', name: 'Code Generation', description: 'Generate code from descriptions' },
    { id: 'refactoring', name: 'Refactoring', description: 'Restructure existing code' },
    { id: 'debugging', name: 'Debugging', description: 'Find and fix bugs' },
    { id: 'review', name: 'Review', description: 'Code review and analysis' },
    { id: 'documentation', name: 'Documentation', description: 'Write documentation' },
    { id: 'analysis', name: 'Analysis', description: 'Analyze code and data' },
    { id: 'architecture', name: 'Architecture', description: 'Design system architecture' },
  ];

  res.json({ success: true, data: capabilities });
});

export default router;
