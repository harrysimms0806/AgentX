// AgentX Daemon - Phase 0 Implementation
// Core daemon with auth, sandbox, audit, and supervisor

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { config, initializeConfig } from './config';
import { auth } from './auth';
import { sandbox } from './sandbox';
import { audit } from './audit';
import { supervisor } from './supervisor';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { authPublicRouter, authProtectedRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { fsRouter } from './routes/filesystem';
import { auditRouter } from './routes/audit';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for local dev
  crossOriginEmbedderPolicy: false,
}));

// CORS restricted to localhost only
app.use(cors({
  origin: (origin, callback) => {
    // Allow UI origin or no origin (same-origin requests)
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// PUBLIC ROUTE ALLOWLIST
// These are the ONLY routes that do not require Bearer token authentication
// - /health - Health check for monitoring
// - /auth/session - Create new session (must be public to obtain token)
// ALL other routes require valid Bearer token via authMiddleware
const PUBLIC_ROUTES = ['/health', '/auth/session'] as const;

// Routes - /health is the ONLY public endpoint (per Phase 0 requirements)
app.use('/health', healthRouter);
app.use('/auth', authPublicRouter);              // /auth/session - public
app.use('/auth', authMiddleware, authProtectedRouter);  // /auth/revoke - protected
app.use('/projects', authMiddleware, projectsRouter);
app.use('/fs', authMiddleware, fsRouter);
app.use('/audit', authMiddleware, auditRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// Initialize and start
async function main() {
  console.log('🔧 AgentX Daemon - Phase 0');
  
  // Initialize config first (includes port discovery)
  await initializeConfig();
  
  console.log(`Sandbox root: ${config.sandboxRoot}`);
  
  // Initialize subsystems
  await auth.initialize();
  await sandbox.initialize();
  await audit.initialize();
  await supervisor.initialize();
  
  // Write runtime config for UI discovery
  const runtimeConfig = {
    uiPort: config.uiPort,
    daemonPort: config.port,
    startedAt: new Date().toISOString(),
    sandboxRoot: config.sandboxRoot,
  };
  
  const runtimeDir = path.join(os.homedir(), '.agentx');
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(runtimeDir, 'runtime.json'),
    JSON.stringify(runtimeConfig, null, 2)
  );
  
  // Start server
  app.listen(config.port, '127.0.0.1', () => {
    console.log(`✅ Daemon running on http://127.0.0.1:${config.port}`);
    console.log(`📁 Sandbox: ${config.sandboxRoot}`);
    console.log(`🔒 Auth: ${auth.isEnabled() ? 'enabled' : 'disabled'}`);
  });
}

main().catch((err) => {
  console.error('Failed to start daemon:', err);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  supervisor.shutdown();
  audit.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  supervisor.shutdown();
  audit.shutdown();
  process.exit(0);
});

export { app };
