import db from '../models/database.js';
import { configBridge } from './ConfigBridge.js';

/**
 * Agent Sync Service
 * 
 * Syncs agents from OpenClaw config (ConfigBridge) to the database.
 * This ensures the dashboard shows real agents from your OpenClaw config,
 * not hardcoded fixtures.
 */

export class AgentSync {
  constructor() {
    this.syncInterval = null;
    this.isRunning = false;
  }

  /**
   * Initialize sync service
   * Called after ConfigBridge is loaded
   */
  async initialize() {
    console.log('🔄 AgentSync: Initializing...');
    
    // Wait for ConfigBridge to be loaded
    if (!configBridge.isLoaded) {
      console.log('   Waiting for ConfigBridge...');
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (configBridge.isLoaded) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    // Perform initial sync
    await this.syncAgents();

    // Listen for config changes
    configBridge.on('configLoaded', async () => {
      console.log('🔄 Config changed, re-syncing agents...');
      await this.syncAgents();
    });

    console.log('✅ AgentSync: Ready');
  }

  /**
   * Sync agents from ConfigBridge to database
   */
  async syncAgents() {
    const config = configBridge.getConfig();
    if (!config || !config.agents) {
      console.warn('⚠️ AgentSync: No agents in config');
      return;
    }

    const configAgents = config.agents;
    console.log(`🔄 AgentSync: Syncing ${configAgents.length} agents from config...`);

    // Get current agents from database
    const dbAgents = db.prepare('SELECT id FROM agents').all();
    const dbAgentIds = new Set(dbAgents.map(a => a.id));

    // Track stats
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const agent of configAgents) {
      const exists = dbAgentIds.has(agent.id);

      // Transform config agent to database format
      const dbRecord = this.transformToDbRecord(agent);

      if (exists) {
        // Update existing agent (preserve stats)
        const result = db.prepare(`
          UPDATE agents SET
            name = @name,
            type = @type,
            provider = @provider,
            model = @model,
            capabilities = @capabilities,
            avatar = @avatar,
            config = @config,
            last_active = CURRENT_TIMESTAMP
          WHERE id = @id
        `).run(dbRecord);

        if (result.changes > 0) {
          updated++;
        } else {
          unchanged++;
        }
      } else {
        // Insert new agent
        db.prepare(`
          INSERT INTO agents (
            id, name, type, status, provider, model, 
            capabilities, avatar, config, created_at
          ) VALUES (
            @id, @name, @type, 'offline', @provider, @model,
            @capabilities, @avatar, @config, CURRENT_TIMESTAMP
          )
        `).run(dbRecord);
        created++;
      }
    }

    // Optional: Mark agents not in config as archived/disabled
    // This prevents showing stale agents that were removed from config
    const configAgentIds = new Set(configAgents.map(a => a.id));
    const staleAgents = dbAgents.filter(a => !configAgentIds.has(a.id));
    
    if (staleAgents.length > 0) {
      console.log(`   Found ${staleAgents.length} stale agents (not in config)`);
      for (const stale of staleAgents) {
        db.prepare(`
          UPDATE agents SET status = 'disabled' WHERE id = ?
        `).run(stale.id);
      }
    }

    console.log(`✅ AgentSync: ${created} created, ${updated} updated, ${unchanged} unchanged`);
    
    return {
      created,
      updated,
      unchanged,
      stale: staleAgents.length,
      total: configAgents.length,
    };
  }

  /**
   * Transform ConfigBridge agent format to database record
   */
  transformToDbRecord(agent) {
    return {
      id: agent.id,
      name: agent.displayName || agent.name || agent.id,
      type: agent.type || 'cloud',
      provider: agent.provider || 'unknown',
      model: agent.model || null,
      capabilities: JSON.stringify(agent.capabilities || []),
      avatar: agent.avatar?.emoji || '🤖',
      config: JSON.stringify({
        routing: agent.routing || {},
        policy: agent.policy || {},
        metadata: agent.metadata || {},
        maxConcurrentTasks: agent.policy?.budgets?.maxConcurrent || 1,
        timeout: 30000,
        retryAttempts: 3,
      }),
    };
  }

  /**
   * Get merged agent data (config + database stats)
   * Used by the API to return rich agent information
   */
  getMergedAgents() {
    const config = configBridge.getConfig();
    if (!config) return [];

    const dbAgents = db.prepare('SELECT * FROM agents').all();
    const dbAgentMap = new Map(dbAgents.map(a => [a.id, a]));

    return config.agents.map(configAgent => {
      const dbAgent = dbAgentMap.get(configAgent.id);
      
      if (!dbAgent) {
        // Agent in config but not yet synced to DB
        return {
          ...this.transformToDbRecord(configAgent),
          status: 'offline',
          stats_tasks_completed: 0,
          stats_tasks_failed: 0,
          stats_avg_response_time: 0,
          stats_total_cost: 0,
          stats_uptime: 0,
        };
      }

      // Merge: config metadata + database stats
      return {
        ...dbAgent,
        capabilities: JSON.parse(dbAgent.capabilities || '[]'),
        config: JSON.parse(dbAgent.config || '{}'),
        // Override with latest config values
        name: configAgent.displayName || configAgent.name || dbAgent.name,
        avatar: configAgent.avatar?.emoji || dbAgent.avatar,
        provider: configAgent.provider || dbAgent.provider,
        model: configAgent.model || dbAgent.model,
      };
    });
  }

  /**
   * Force a re-sync (useful for admin operations)
   */
  async forceSync() {
    console.log('🔄 AgentSync: Forcing re-sync...');
    return await this.syncAgents();
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      configLoaded: configBridge.isLoaded,
      agentCount: configBridge.getConfig()?.agents?.length || 0,
    };
  }
}

// Export singleton
export const agentSync = new AgentSync();
export default agentSync;
