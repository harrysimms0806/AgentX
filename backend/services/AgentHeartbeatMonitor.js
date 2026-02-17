import db from '../models/database.js';
import { broadcast } from '../server.js';
import { configBridge } from './ConfigBridge.js';
import { auditLogger } from './AuditLogger.js';

/**
 * Agent Heartbeat Monitor
 * 
 * Monitors the health and status of all agents in real-time.
 * Provides heartbeat tracking, health checks, and automatic failover.
 * 
 * Features:
 * - Periodic health checks on all agents
 * - Heartbeat timeout detection
 * - Automatic status updates
 * - Health history tracking
 * - Alert generation for unhealthy agents
 */

export class AgentHeartbeatMonitor {
  constructor() {
    this.heartbeatInterval = null;
    this.healthCheckInterval = null;
    this.isRunning = false;
    this.heartbeats = new Map(); // agentId -> { lastBeat, status, history }
    this.healthHistory = new Map(); // agentId -> [health records]
    this.checkIntervalMs = 30000; // 30 seconds
    this.timeoutThresholdMs = 120000; // 2 minutes
  }

  /**
   * Initialize the heartbeat monitor
   */
  async initialize() {
    console.log('💓 AgentHeartbeatMonitor: Initializing...');

    // Initialize heartbeat tracking for all configured agents
    const config = configBridge.getConfig();
    if (config && config.agents) {
      for (const agent of config.agents) {
        this.heartbeats.set(agent.id, {
          lastBeat: Date.now(),
          status: 'offline',
          history: [],
          consecutiveFailures: 0,
        });
      }
    }

    // Start monitoring loops
    this.startHeartbeatLoop();
    this.startHealthCheckLoop();

    console.log('✅ AgentHeartbeatMonitor: Ready');
    console.log(`   Monitoring ${this.heartbeats.size} agents`);
  }

  /**
   * Start the heartbeat collection loop
   * Simulates receiving heartbeats from agents
   */
  startHeartbeatLoop() {
    this.isRunning = true;

    const collectHeartbeats = async () => {
      if (!this.isRunning) return;

      try {
        await this.collectAgentHeartbeats();
      } catch (err) {
        console.error('❌ Heartbeat collection error:', err);
      }

      this.heartbeatInterval = setTimeout(collectHeartbeats, this.checkIntervalMs);
    };

    collectHeartbeats();
    console.log('   Heartbeat collection started (30s interval)');
  }

  /**
   * Collect heartbeats from all agents
   * In production, this would poll actual agent processes
   */
  async collectAgentHeartbeats() {
    const config = configBridge.getConfig();
    if (!config || !config.agents) return;

    for (const agentConfig of config.agents) {
      const agentId = agentConfig.id;
      
      // Get current agent status from database
      const dbAgent = db.prepare('SELECT status, last_active FROM agents WHERE id = ?').get(agentId);
      
      if (!dbAgent) continue;

      const heartbeat = this.heartbeats.get(agentId) || {
        lastBeat: Date.now(),
        status: dbAgent.status,
        history: [],
        consecutiveFailures: 0,
      };

      // Update heartbeat
      const now = Date.now();
      const lastActive = dbAgent.last_active ? new Date(dbAgent.last_active).getTime() : 0;
      
      // Use the more recent of last heartbeat or last database activity
      heartbeat.lastBeat = Math.max(heartbeat.lastBeat, lastActive, now);
      heartbeat.status = dbAgent.status;

      // Add to history (keep last 100 records)
      heartbeat.history.push({
        timestamp: now,
        status: dbAgent.status,
      });
      
      if (heartbeat.history.length > 100) {
        heartbeat.history.shift();
      }

      this.heartbeats.set(agentId, heartbeat);

      // Broadcast heartbeat to all connected clients
      broadcast({
        type: 'agent:heartbeat',
        payload: {
          agentId,
          status: dbAgent.status,
          lastBeat: heartbeat.lastBeat,
          timestamp: now,
        }
      });
    }
  }

  /**
   * Start the health check loop
   * Detects agents that haven't sent heartbeats
   */
  startHealthCheckLoop() {
    const checkHealth = () => {
      if (!this.isRunning) return;

      try {
        this.checkAgentHealth();
      } catch (err) {
        console.error('❌ Health check error:', err);
      }

      this.healthCheckInterval = setTimeout(checkHealth, this.checkIntervalMs);
    };

    checkHealth();
    console.log('   Health check started (30s interval)');
  }

  /**
   * Check health of all agents
   * Detects timeouts and updates status
   */
  checkAgentHealth() {
    const now = Date.now();

    for (const [agentId, heartbeat] of this.heartbeats) {
      const elapsed = now - heartbeat.lastBeat;
      const dbAgent = db.prepare('SELECT status FROM agents WHERE id = ?').get(agentId);

      if (!dbAgent) continue;

      // Detect timeout conditions
      if (elapsed > this.timeoutThresholdMs) {
        // Agent hasn't sent heartbeat in 2+ minutes
        
        if (dbAgent.status === 'working') {
          // Working agent that stopped responding - mark as failed
          console.warn(`💔 Agent ${agentId} timed out (no heartbeat for ${Math.round(elapsed / 1000)}s)`);
          
          heartbeat.consecutiveFailures++;
          
          // Update database status
          db.prepare(`UPDATE agents SET status = 'error' WHERE id = ?`).run(agentId);

          // Broadcast alert
          broadcast({
            type: 'agent:alert',
            payload: {
              agentId,
              alert: 'heartbeat_timeout',
              severity: 'warning',
              message: `Agent ${agentId} has not sent a heartbeat for ${Math.round(elapsed / 1000)} seconds`,
              lastBeat: heartbeat.lastBeat,
              elapsed,
            }
          });

          // Log to audit
          auditLogger.log({
            actionType: 'agent',
            action: 'agent_heartbeat_timeout',
            agentId,
            result: 'failure',
            details: {
              elapsed,
              lastBeat: heartbeat.lastBeat,
              consecutiveFailures: heartbeat.consecutiveFailures,
            },
          });

        } else if (dbAgent.status !== 'offline' && dbAgent.status !== 'error') {
          // Non-working agent that's gone quiet - mark as offline
          db.prepare(`UPDATE agents SET status = 'offline' WHERE id = ?`).run(agentId);
          
          broadcast({
            type: 'agent:status',
            payload: { agentId, status: 'offline', reason: 'heartbeat_timeout' }
          });
        }
      } else {
        // Agent is healthy - reset failure count
        if (heartbeat.consecutiveFailures > 0) {
          heartbeat.consecutiveFailures = 0;
          this.heartbeats.set(agentId, heartbeat);
        }
      }
    }
  }

  /**
   * Record a heartbeat from an agent
   * Called when an agent reports in
   */
  recordHeartbeat(agentId, metadata = {}) {
    const heartbeat = this.heartbeats.get(agentId) || {
      lastBeat: Date.now(),
      status: 'idle',
      history: [],
      consecutiveFailures: 0,
    };

    const now = Date.now();
    
    heartbeat.lastBeat = now;
    heartbeat.status = metadata.status || 'idle';
    heartbeat.consecutiveFailures = 0;
    
    heartbeat.history.push({
      timestamp: now,
      status: heartbeat.status,
      metadata,
    });

    if (heartbeat.history.length > 100) {
      heartbeat.history.shift();
    }

    this.heartbeats.set(agentId, heartbeat);

    // Update database
    db.prepare(`
      UPDATE agents SET last_active = CURRENT_TIMESTAMP WHERE id = ?
    `).run(agentId);

    // Broadcast
    broadcast({
      type: 'agent:heartbeat',
      payload: {
        agentId,
        status: heartbeat.status,
        timestamp: now,
        ...metadata,
      }
    });

    return heartbeat;
  }

  /**
   * Get heartbeat status for an agent
   */
  getAgentHeartbeat(agentId) {
    const heartbeat = this.heartbeats.get(agentId);
    if (!heartbeat) return null;

    const now = Date.now();
    const elapsed = now - heartbeat.lastBeat;

    return {
      agentId,
      ...heartbeat,
      elapsed,
      healthy: elapsed <= this.timeoutThresholdMs,
    };
  }

  /**
   * Get heartbeat status for all agents
   */
  getAllHeartbeats() {
    const result = [];
    for (const [agentId, heartbeat] of this.heartbeats) {
      const now = Date.now();
      const elapsed = now - heartbeat.lastBeat;
      
      result.push({
        agentId,
        ...heartbeat,
        elapsed,
        healthy: elapsed <= this.timeoutThresholdMs,
      });
    }
    return result;
  }

  /**
   * Get health history for an agent
   */
  getAgentHealthHistory(agentId, limit = 24) {
    const heartbeat = this.heartbeats.get(agentId);
    if (!heartbeat) return [];

    return heartbeat.history.slice(-limit);
  }

  /**
   * Get system health summary
   */
  getSystemHealth() {
    const heartbeats = this.getAllHeartbeats();
    const total = heartbeats.length;
    const healthy = heartbeats.filter(h => h.healthy).length;
    const unhealthy = total - healthy;

    return {
      total,
      healthy,
      unhealthy,
      healthRate: total > 0 ? (healthy / total) * 100 : 0,
      agents: heartbeats,
    };
  }

  /**
   * Manually mark an agent as unhealthy
   */
  markUnhealthy(agentId, reason = 'manual') {
    const heartbeat = this.heartbeats.get(agentId);
    if (heartbeat) {
      heartbeat.consecutiveFailures++;
      this.heartbeats.set(agentId, heartbeat);
    }

    db.prepare(`UPDATE agents SET status = 'error' WHERE id = ?`).run(agentId);

    broadcast({
      type: 'agent:alert',
      payload: {
        agentId,
        alert: 'marked_unhealthy',
        severity: 'warning',
        reason,
      }
    });
  }

  /**
   * Stop the monitor
   */
  stop() {
    console.log('🛑 AgentHeartbeatMonitor: Stopping...');
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearTimeout(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    console.log('✅ AgentHeartbeatMonitor: Stopped');
  }
}

// Export singleton
export const agentHeartbeatMonitor = new AgentHeartbeatMonitor();
export default agentHeartbeatMonitor;
