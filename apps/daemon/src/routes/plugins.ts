import { Router } from 'express';
import { pluginManager, type Permission } from '../plugins';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ plugins: pluginManager.list() });
});

router.get('/tools', (_req, res) => {
  res.json({ tools: pluginManager.getRegisteredTools() });
});

router.post('/install', (req, res) => {
  const clientId = (req as any).session?.clientId || 'unknown';
  try {
    const plugin = pluginManager.install(req.body || {}, clientId);
    res.status(201).json({ plugin });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to install plugin' });
  }
});

router.post('/install-sample', (req, res) => {
  const clientId = (req as any).session?.clientId || 'unknown';
  try {
    const plugin = pluginManager.installSample(clientId);
    res.status(201).json({ plugin });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to install sample plugin' });
  }
});

router.post('/:pluginId/approve', (req, res) => {
  const clientId = (req as any).session?.clientId || 'unknown';
  const { pluginId } = req.params;
  const permissions = Array.isArray(req.body?.permissions) ? (req.body.permissions as Permission[]) : [];

  try {
    const plugin = pluginManager.approve(pluginId, permissions, clientId);
    res.json({ plugin });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to approve plugin' });
  }
});

router.post('/tools/:toolName/invoke', async (req, res) => {
  const actorId = (req as any).session?.clientId || 'unknown';
  try {
    const result = await pluginManager.executeTool(req.params.toolName, req.body?.args || {}, actorId);
    if (typeof result === 'undefined') {
      res.status(404).json({ error: 'Plugin tool not found or inactive' });
      return;
    }
    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Plugin tool invocation failed' });
  }
});

export { router as pluginsRouter };
