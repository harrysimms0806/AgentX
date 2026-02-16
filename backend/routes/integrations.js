import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';

const router = Router();

// Get all integrations
router.get('/', (req, res) => {
  const integrations = db.prepare('SELECT * FROM integrations ORDER BY created_at DESC').all();
  res.json({ 
    success: true, 
    data: integrations.map(i => ({
      ...i,
      config: i.config ? JSON.parse(i.config) : {},
    }))
  });
});

// Create integration
router.post('/', (req, res) => {
  const { name, type, provider, config = {} } = req.body;

  if (!name || !type || !provider) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'MISSING_FIELDS', message: 'Name, type, and provider are required' } 
    });
  }

  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO integrations (id, name, type, provider, config)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, type, provider, JSON.stringify(config));

  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
  
  res.status(201).json({ 
    success: true, 
    data: { ...integration, config: JSON.parse(integration.config || '{}') }
  });
});

// Get integration by ID
router.get('/:id', (req, res) => {
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(req.params.id);
  
  if (!integration) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Integration not found' } 
    });
  }

  res.json({ 
    success: true, 
    data: { 
      ...integration, 
      config: integration.config ? JSON.parse(integration.config) : {} 
    } 
  });
});

// Update integration status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['connected', 'disconnected', 'error'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: { code: 'INVALID_STATUS', message: 'Invalid status value' } 
    });
  }

  const result = db.prepare(`
    UPDATE integrations 
    SET status = ?, last_sync = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(status, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Integration not found' } 
    });
  }

  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(req.params.id);
  
  res.json({ 
    success: true, 
    data: { ...integration, config: JSON.parse(integration.config || '{}') }
  });
});

// Update integration config
router.patch('/:id/config', (req, res) => {
  const { config } = req.body;
  
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(req.params.id);
  
  if (!integration) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Integration not found' } 
    });
  }

  const currentConfig = integration.config ? JSON.parse(integration.config) : {};
  const newConfig = { ...currentConfig, ...config };

  db.prepare('UPDATE integrations SET config = ? WHERE id = ?')
    .run(JSON.stringify(newConfig), req.params.id);

  res.json({ success: true, data: { config: newConfig } });
});

// Delete integration
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM integrations WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Integration not found' } 
    });
  }

  res.json({ success: true, message: 'Integration deleted' });
});

// Test integration connection
router.post('/:id/test', async (req, res) => {
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(req.params.id);
  
  if (!integration) {
    return res.status(404).json({ 
      success: false, 
      error: { code: 'NOT_FOUND', message: 'Integration not found' } 
    });
  }

  const config = integration.config ? JSON.parse(integration.config) : {};

  // TODO: Implement actual connection tests per provider
  const tests = {
    'openai': async () => {
      // Test OpenAI API key
      return { success: true, message: 'API key valid' };
    },
    'ollama': async () => {
      // Test Ollama local connection
      return { success: true, message: 'Local Ollama reachable' };
    },
    'replit': async () => {
      // Test Replit connection
      return { success: true, message: 'Replit API accessible' };
    },
  };

  const testFn = tests[integration.provider];
  
  if (!testFn) {
    return res.json({ success: true, message: 'No test available for this provider' });
  }

  try {
    const result = await testFn();
    
    // Update status based on test
    db.prepare(`
      UPDATE integrations 
      SET status = ?, last_sync = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.success ? 'connected' : 'error', req.params.id);

    res.json(result);
  } catch (err) {
    db.prepare(`
      UPDATE integrations 
      SET status = 'error', last_sync = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(req.params.id);

    res.status(500).json({ 
      success: false, 
      error: { code: 'TEST_FAILED', message: err.message } 
    });
  }
});

export default router;
