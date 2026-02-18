// Git routes intentionally disabled for Phase 2.
// Guardrail: no process spawning and no git write actions in this phase.

import { Router } from 'express';

const router = Router();

router.all('*', (_req, res) => {
  res.status(410).json({
    error: 'Git APIs are disabled in Phase 2',
    code: 'FEATURE_DISABLED_PHASE2',
  });
});

export { router as gitRouter };
