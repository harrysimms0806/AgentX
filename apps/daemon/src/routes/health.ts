// Health check endpoint - no auth required
import { Router } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0-phase0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sandbox: config.sandboxRoot,
  });
});

export { router as healthRouter };
