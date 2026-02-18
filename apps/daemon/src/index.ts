// AgentX Daemon - Phase 4 Implementation
// Core daemon + SQLite + WebSocket terminals + Agent orchestration

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

import { config, initializeConfig } from './config';
import { auth } from './auth';
import { sandbox } from './sandbox';
import { audit } from './audit';
import { supervisor } from './supervisor';
import { initDatabase, closeDatabase } from './database';
import { terminalManager } from './terminal';
import { wsServer } from './websocket';
import { agentManager } from './agents';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { authPublicRouter, authProtectedRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { fsRouter } from './routes/filesystem';
import { auditRouter } from './routes/audit';
import { supervisorRouter } from './routes/supervisor';
import { locksRouter } from './routes/locks';
import { gitRouter } from './routes/git';
import { terminalsRouter } from './routes/terminals';
import { agentsRouter } from './routes/agents';
import { runsRouter } from './routes/runs';

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

// AUTH POLICY
// HTTP Routes: Explicit public routes mounted without authMiddleware:
// - /health - Health check (no auth required)
// - /auth/session - Create session (must be public to obtain token)
// ALL other HTTP routes require Bearer token via authMiddleware
//
// WebSocket Policy (for future Phase 3+):
// - WS connections must perform auth handshake on connect
// - Reject connection if valid Bearer token not provided in subprotocol/header
// - Use same authMiddleware logic adapted for WS upgrade
// - Audit all WS connections like HTTP requests

// Routes - public endpoints mounted WITHOUT authMiddleware
app.use('/health', healthRouter);
app.use('/auth', authPublicRouter);              // /auth/session - public

// Routes - protected endpoints mounted WITH authMiddleware
app.use('/auth', authMiddleware, authProtectedRouter);  // /auth/revoke - protected
app.use('/projects', authMiddleware, projectsRouter);
app.use('/fs', authMiddleware, fsRouter);
app.use('/audit', authMiddleware, auditRouter);
app.use('/supervisor', authMiddleware, supervisorRouter);
app.use('/locks', authMiddleware, locksRouter);
app.use('/git', authMiddleware, gitRouter);
app.use('/terminals', authMiddleware, terminalsRouter);
app.use('/agents', authMiddleware, agentsRouter);
app.use('/runs', authMiddleware, runsRouter);

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
  console.log('🔧 AgentX Daemon - Phase 4');

  // Initialize config first (includes port discovery)
  await initializeConfig();

  console.log(`Sandbox root: ${config.sandboxRoot}`);

  // Initialize subsystems
  await auth.initialize();
  await sandbox.initialize();
  await audit.initialize();
  await supervisor.initialize();

  // Initialize SQLite database (Phase 2)
  initDatabase();
  console.log('💾 SQLite persistence initialized');

  // Initialize terminal manager (Phase 3)
  terminalManager.initialize();

  // Initialize agent manager (Phase 4)
  agentManager.initialize();

  // Write runtime config for UI discovery
  // Schema versioned for backward compatibility
  const runtimeConfig = {
    schemaVersion: '1.0',
    uiPort: config.uiPort,
    daemonPort: config.port,
    startedAt: new Date().toISOString(),
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
  const server = http.createServer(app);

  // Initialize WebSocket server (Phase 3)
  wsServer.initialize(server);

  server.listen(config.port, '127.0.0.1', () => {
    console.log(`✅ Daemon running on http://127.0.0.1:${config.port}`);
    console.log(`📁 Sandbox: ${config.sandboxRoot}`);
    console.log(`🔒 Auth: ${auth.isEnabled() ? 'enabled' : 'disabled'}`);
    console.log('🖥️  WebSocket terminals: enabled on /ws');
    console.log('🤖 Agent orchestration: enabled');
  });
}

main().catch((err) => {
  console.error('Failed to start daemon:', err);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  agentManager.shutdown();
  wsServer.shutdown();
  terminalManager.shutdown();
  await supervisor.shutdown();
  audit.shutdown();
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  agentManager.shutdown();
  wsServer.shutdown();
  terminalManager.shutdown();
  await supervisor.shutdown();
  audit.shutdown();
  closeDatabase();
  process.exit(0);
});

export { app };
