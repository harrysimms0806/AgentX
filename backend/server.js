import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import db from './models/database.js';
import { fileURLToPath } from 'url';
import { initDatabase } from './models/database.js';

// Config Bridge & Policy Engine
import { configBridge } from './services/ConfigBridge.js';
import { policyEngine } from './services/PolicyEngine.js';
import { approvalService, initApprovalsTable } from './services/ApprovalService.js';
import { auditLogger, initAuditTable } from './services/AuditLogger.js';

// NEW: Critical security features from review
import { isolatedRunner, initExecutionTables } from './services/IsolatedAgentRunner.js';
import { riskEngine, initRiskTables } from './services/RiskScoringEngine.js';
import { executionSimulator, initSimulationTables } from './services/ExecutionSimulator.js';
import { rbac, initRBACTables } from './services/RBACSystem.js';

// Import routes
import agentRoutes from './routes/agents.js';
import taskRoutes from './routes/tasks.js';
import projectRoutes from './routes/projects.js';
import integrationRoutes from './routes/integrations.js';
import lockRoutes from './routes/locks.js';
import configRoutes from './routes/config.js';
import policyRoutes from './routes/policy.js';
import approvalRoutes from './routes/approvals.js';
import auditRoutes from './routes/audit.js';
import simulateRoutes from './routes/simulate.js';
import rbacRoutes from './routes/rbac.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database and services
async function initializeServices() {
  console.log('🔧 Initializing AgentX services...\n');
  
  // Initialize database tables
  initDatabase();
  initApprovalsTable();
  initAuditTable();
  
  // NEW: Initialize enhanced security tables
  initExecutionTables();
  initRiskTables();
  initSimulationTables();
  initRBACTables();
  
  // Initialize config bridge (loads OpenClaw config)
  await configBridge.initialize();
  
  // Connect audit logger to policy engine
  policyEngine.setAuditCallback((entry) => {
    auditLogger.log(entry);
  });
  
  console.log('\n✅ All services initialized');
  console.log('   Process isolation: Ready');
  console.log('   Risk scoring: Active');
  console.log('   RBAC: Configured');
}

// WebSocket handling
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
          
        default:
          clients.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify(data));
            }
          });
      }
    } catch (err) {
      console.error('❌ Invalid WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.send(JSON.stringify({ 
    type: 'connection', 
    status: 'connected',
    timestamp: new Date().toISOString(),
  }));
});

// Broadcast helper
export function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/locks', lockRoutes);

// Config Bridge routes
app.use('/api/config', configRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/audit', auditRoutes);

// NEW: Enhanced security routes
app.use('/api/simulate', simulateRoutes);
app.use('/api/rbac', rbacRoutes);


app.get('/api/stats', (req, res) => {
  const activeAgents = db.prepare(`SELECT COUNT(*) as count FROM agents WHERE status IN ('idle', 'working', 'success')`).get().count;
  const pendingTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status IN ('pending', 'queued')`).get().count;
  const runningTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'running'`).get().count;
  const completedToday = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'completed' AND date(completed_at) = date('now')`).get().count;

  res.json({
    success: true,
    data: {
      activeAgents,
      pendingTasks,
      runningTasks,
      completedToday,
    },
  });
});

// Main health check
app.get('/api/health', (req, res) => {
  const configHealth = configBridge.getHealth();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    services: {
      config: configHealth.loaded ? 'healthy' : 'not_loaded',
      database: 'healthy',
      websocket: wss.clients.size > 0 ? 'connected' : 'waiting',
      isolation: 'ready',
      riskScoring: 'active',
      rbac: 'configured',
    },
    config: {
      loaded: configHealth.loaded,
      version: configHealth.version,
      hash: configHealth.hash?.substring(0, 8) + '...',
    },
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ API Error:', err);
  res.status(500).json({ 
    success: false, 
    error: { code: 'INTERNAL_ERROR', message: err.message } 
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully');
  
  // Kill all isolated agent processes
  isolatedRunner.killAll('SIGTERM');
  
  // Stop services
  configBridge.stop();
  approvalService.stop();
  auditLogger.stop();
  rbac.stop?.();
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  isolatedRunner.killAll('SIGKILL');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled rejection:', reason);
});

// Start server
initializeServices().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 AgentX Server v1.1 running on port ${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`\n✨ Enhanced Security Features:`);
    console.log(`   • Process Isolation: Each agent runs in separate Node.js process`);
    console.log(`   • Risk-Based Approvals: Auto-approve low risk, escalate high risk`);
    console.log(`   • Execution Simulation: Preview before approve`);
    console.log(`   • RBAC: Role-based access control (super_admin, admin, operator, viewer)`);
    console.log(`   • Audit Logging: Immutable trail of all actions`);
    console.log(`\n📊 Dashboard API ready\n`);
  });
});
