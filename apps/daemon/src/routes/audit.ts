// Audit log endpoints
import { Router } from 'express';
import { audit } from '../audit';

const router = Router();

// GET /audit?projectId=&limit= - Get audit events
router.get('/', (req, res) => {
  const { projectId, limit } = req.query;
  
  const parsedLimit = limit ? parseInt(limit as string, 10) : 100;
  const parsedProjectId = projectId as string | undefined;

  const events = audit.read(parsedProjectId, parsedLimit);
  res.json(events);
});

// GET /audit/export?projectId= - Export full audit log
router.get('/export', (req, res) => {
  const { projectId } = req.query;
  const parsedProjectId = projectId as string | undefined;

  const exportData = audit.export(parsedProjectId);
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
  res.send(exportData);
});

export { router as auditRouter };
