import { Router } from 'express';
import { configBridge } from '../services/ConfigBridge.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /config
 * Returns normalized dashboard configuration (redacted)
 */
router.get('/', (req, res) => {
  const config = configBridge.getConfig();
  
  if (!config) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'CONFIG_NOT_LOADED',
        message: 'Configuration not yet loaded',
      },
    });
  }

  res.json({
    success: true,
    data: config,
  });
});

/**
 * GET /config/health
 * Returns config loading status and validation info
 */
router.get('/health', (req, res) => {
  const health = configBridge.getHealth();
  
  res.json({
    success: true,
    data: health,
  });
});

/**
 * POST /config/reload
 * Manual config reload (admin only)
 */
router.post('/reload', requireAdmin, async (req, res) => {
  try {
    const health = await configBridge.reload();
    
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RELOAD_FAILED',
        message: error.message,
      },
    });
  }
});

/**
 * GET /config/agents
 * List all agents with their policies
 */
router.get('/agents', (req, res) => {
  const config = configBridge.getConfig();
  
  if (!config) {
    return res.status(503).json({
      success: false,
      error: { code: 'CONFIG_NOT_LOADED', message: 'Configuration not loaded' },
    });
  }

  res.json({
    success: true,
    data: config.agents,
  });
});

/**
 * GET /config/agents/:id
 * Get specific agent configuration
 */
router.get('/agents/:id', (req, res) => {
  const agent = configBridge.getAgent(req.params.id);
  
  if (!agent) {
    return res.status(404).json({
      success: false,
      error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found' },
    });
  }

  res.json({
    success: true,
    data: agent,
  });
});

/**
 * GET /config/integrations
 * List all integrations
 */
router.get('/integrations', (req, res) => {
  const config = configBridge.getConfig();
  
  if (!config) {
    return res.status(503).json({
      success: false,
      error: { code: 'CONFIG_NOT_LOADED', message: 'Configuration not loaded' },
    });
  }

  res.json({
    success: true,
    data: config.integrations,
  });
});

/**
 * GET /config/ui-settings
 * Get UI settings only (lightweight, for initial dashboard load)
 */
router.get('/ui-settings', (req, res) => {
  const settings = configBridge.getUISettings();
  
  if (!settings) {
    return res.status(503).json({
      success: false,
      error: { code: 'CONFIG_NOT_LOADED', message: 'Configuration not loaded' },
    });
  }

  res.json({
    success: true,
    data: settings,
  });
});

/**
 * GET /config/settings-pointers
 * Get settings pointers (where to find various settings)
 */
router.get('/settings-pointers', (req, res) => {
  const config = configBridge.getConfig();
  
  if (!config) {
    return res.status(503).json({
      success: false,
      error: { code: 'CONFIG_NOT_LOADED', message: 'Configuration not loaded' },
    });
  }

  res.json({
    success: true,
    data: config.settingsPointers,
  });
});

export default router;
