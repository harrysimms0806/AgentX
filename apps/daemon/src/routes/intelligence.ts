import { Router } from 'express';
import { getIntelligenceInsights } from '../intelligence';

const router = Router();

router.get('/insights', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const insights = getIntelligenceInsights(projectId);
  res.json({ insights });
});

export { router as intelligenceRouter };
