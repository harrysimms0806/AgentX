// Health check endpoint - no auth required
import { Router } from 'express';
import { config } from '../config';
import { openclawAdapter } from '../openclaw-adapter';

const router = Router();

router.get('/', (req, res) => {
  const openclaw = openclawAdapter.getStatus();
  const redactedError = openclaw.lastError ? redactHealthError(openclaw.lastError) : null;

  res.json({
    status: 'ok',
    version: '0.1.0-phase0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sandbox: config.sandboxRoot,
    daemonPort: config.port,
    uiPort: config.uiPort,
    aiEngine: config.aiEngine,
    openclaw: {
      connected: openclaw.connected,
      state: openclaw.state,
      gatewayUrl: openclaw.gatewayUrl,
      lastError: redactedError,
    },
  });
});

export { router as healthRouter };

function redactHealthError(errorMessage: string): string {
  return errorMessage
    .replace(/(token|api[_-]?key|authorization)\s*[:=]\s*[^\s]+/gi, '$1=[redacted]')
    .slice(0, 300);
}
