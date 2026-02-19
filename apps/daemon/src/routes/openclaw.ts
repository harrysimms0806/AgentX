import { Router } from 'express';
import { config } from '../config';
import { openclawAdapter } from '../openclaw-adapter';

const router = Router();

router.get('/status', (req, res) => {
  const status = openclawAdapter.getStatus();
  res.json({
    aiEngine: config.aiEngine,
    openclaw: status,
  });
});

export { router as openclawRouter };
