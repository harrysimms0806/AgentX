import { watch } from 'chokidar';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { z } from 'zod';
import EventEmitter from 'events';

/**
 * Config Bridge Service
 * 
 * Reads OpenClaw config as source of truth, normalizes for dashboard,
 * validates schema, and provides hot reload capabilities.
 * 
 * Emoji Avatar Feature:
 * - Every agent gets an emoji avatar
 * - Priority: OpenClaw config → Overlay file → Deterministic fallback
 * - Settings pointers guide UI to find avatars consistently
 */

// Emoji fallback set (deterministic based on agentId hash)
const FALLBACK_EMOJI_SET = [
  "🧠", "🤖", "🛠️", "🧑‍💻", "📡", "🧩", "🧭", "🔧", 
  "🧪", "🛰️", "📦", "📋", "🗂️", "🧰", "🧯", "⚙️"
];

// Schema definitions
const CapabilitySchema = z.enum(['read', 'write', 'exec', 'admin']);

const PolicySchema = z.object({
  allow: z.array(CapabilitySchema).default([]),
  deny: z.array(CapabilitySchema).default([]),
  requiresApproval: z.array(CapabilitySchema).default([]),
  scopes: z.object({
    folders: z.array(z.string()).default([]),
    repos: z.array(z.string()).default([]),
  }).default({}),
  budgets: z.object({
    dailyCost: z.number().optional(),
    monthlyCost: z.number().optional(),
    maxConcurrent: z.number().default(1),
  }).default({}),
});

// Avatar schema with emoji support
const AvatarSchema = z.object({
  mode: z.enum(['emoji', 'image', 'initials']).default('emoji'),
  emoji: z.string().max(8).optional(),
  imageUrl: z.string().optional(),
  initials: z.string().max(2).optional(),
  backgroundColor: z.string().optional(),
});

const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  type: z.enum(['coordinator', 'builder', 'local', 'cloud']),
  provider: z.string(),
  model: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  policy: PolicySchema,
  routing: z.object({
    priority: z.number().default(0),
    autoAssign: z.boolean().default(false),
  }).default({}),
  avatar: AvatarSchema,
  metadata: z.object({
    description: z.string().optional(),
    icon: z.string().optional(),
    category: z.string().default('general'),
  }).default({}),
});

const IntegrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['filesystem', 'git', 'shell', 'api', 'database', 'messaging']),
  provider: z.string(),
  enabled: z.boolean().default(true),
  capabilities: z.array(CapabilitySchema).default(['read']),
  config: z.record(z.any()).default({}),
});

// Settings pointers schema
const SettingsPointersSchema = z.object({
  agentAvatarModePath: z.string().default('/ui/avatars/mode'),
  agentEmojiPath: z.string().default('/agents/*/avatar/emoji'),
  fallbackEmojiPath: z.string().default('/ui/avatars/fallbackSet'),
  agentDisplayNamePath: z.string().default('/agents/*/displayName'),
});

const DashboardConfigSchema = z.object({
  version: z.string(),
  hash: z.string(),
  loadedAt: z.string(),
  providers: z.array(z.object({
    id: z.string(),
    type: z.enum(['local', 'cloud']),
    endpoint: z.string().optional(),
  })),
  models: z.array(z.object({
    id: z.string(),
    provider: z.string(),
    type: z.enum(['embed', 'localCoder', 'cloudCoder', 'chat']),
    maxTokens: z.number().optional(),
  })),
  agents: z.array(AgentSchema),
  integrations: z.array(IntegrationSchema),
  routing: z.object({
    defaultAgent: z.string(),
    fallbackBehavior: z.enum(['queue', 'reject', 'notify']).default('queue'),
  }),
  globalPolicy: z.object({
    defaultDeny: z.boolean().default(true),
    requireApprovalFor: z.array(CapabilitySchema).default(['exec', 'admin']),
    auditAllActions: z.boolean().default(true),
  }).default({}),
  ui: z.object({
    avatars: z.object({
      mode: z.enum(['emoji', 'image', 'initials']).default('emoji'),
      fallbackSet: z.array(z.string()).default(FALLBACK_EMOJI_SET),
    }).default({}),
    sidebar: z.object({
      collapsedByDefault: z.boolean().default(false),
      order: z.array(z.string()).default([]),
    }).default({}),
  }).default({}),
  settingsPointers: SettingsPointersSchema.default({}),
});

export class ConfigBridge extends EventEmitter {
  constructor() {
    super();
    // Use the actual OpenClaw config from the project build
    this.configPath = process.env.OPENCLAW_CONFIG_PATH || '/Users/bud/BUD BOT/projects/AgentX/build/AgentX.app/Contents/Resources/config/openclaw.config.json';
    this.overlayPath = process.env.DASHBOARD_OVERLAY_PATH || './dashboard.overlay.json';
    this.currentConfig = null;
    this.lastHash = null;
    this.validationErrors = [];
    this.isLoaded = false;
    this.watcher = null;
  }

  /**
   * Initialize and start watching config files
   */
  async initialize() {
    console.log('🔧 ConfigBridge initializing...');
    console.log(`   Config path: ${this.configPath}`);
    console.log(`   Overlay path: ${this.overlayPath}`);

    // Initial load
    await this.loadConfig();

    // Start file watcher
    this.startWatcher();

    console.log('✅ ConfigBridge ready');
  }

  /**
   * Start watching config files for changes
   */
  startWatcher() {
    const pathsToWatch = [this.configPath];
    if (existsSync(this.overlayPath)) {
      pathsToWatch.push(this.overlayPath);
    }

    this.watcher = watch(pathsToWatch, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    // Debounced reload
    let reloadTimeout;
    this.watcher.on('change', (path) => {
      console.log(`📝 Config file changed: ${path}`);
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        this.loadConfig();
      }, 500);
    });

    this.watcher.on('error', (error) => {
      console.error('❌ Config watcher error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Load and validate configuration
   */
  async loadConfig() {
    try {
      // Check if config exists
      if (!existsSync(this.configPath)) {
        throw new Error(`OpenClaw config not found: ${this.configPath}`);
      }

      // Read OpenClaw config
      const openclawConfig = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      
      // Read overlay if exists
      let overlay = {};
      if (existsSync(this.overlayPath)) {
        overlay = JSON.parse(readFileSync(this.overlayPath, 'utf-8'));
      }

      // Calculate hash before transformation
      const configString = JSON.stringify(openclawConfig);
      const newHash = createHash('sha256').update(configString).digest('hex');

      // Transform to dashboard schema
      const dashboardConfig = this.transformConfig(openclawConfig, overlay);

      // Validate
      const validation = DashboardConfigSchema.safeParse(dashboardConfig);
      
      if (!validation.success) {
        this.validationErrors = validation.error.errors;
        console.error('❌ Config validation failed:');
        validation.error.errors.forEach(err => {
          console.error(`   ${err.path.join('.')}: ${err.message}`);
        });
        
        // Keep old config if validation fails
        if (this.currentConfig) {
          console.log('⚠️ Keeping previous valid config');
          this.emit('validationFailed', {
            errors: this.validationErrors,
            keptConfig: this.currentConfig,
          });
          return;
        }
        
        throw new Error('Config validation failed and no previous config available');
      }

      // Success - update config
      this.currentConfig = validation.data;
      this.lastHash = newHash;
      this.validationErrors = [];
      this.isLoaded = true;

      console.log('✅ Config loaded successfully');
      console.log(`   Version: ${this.currentConfig.version}`);
      console.log(`   Agents: ${this.currentConfig.agents.length}`);
      console.log(`   Integrations: ${this.currentConfig.integrations.length}`);
      console.log(`   Avatar mode: ${this.currentConfig.ui.avatars.mode}`);

      this.emit('configLoaded', this.currentConfig);

    } catch (error) {
      console.error('❌ Config load failed:', error.message);
      this.validationErrors = [{ message: error.message }];
      this.emit('error', error);
    }
  }

  /**
   * Transform OpenClaw config to dashboard schema
   */
  transformConfig(openclawConfig, overlay) {
    const now = new Date().toISOString();
    
    return {
      version: openclawConfig.version || '1.0.0',
      hash: this.lastHash || 'unknown',
      loadedAt: now,
      
      // Map providers
      providers: this.mapProviders(openclawConfig.providers || []),
      
      // Map models
      models: this.mapModels(openclawConfig.models || []),
      
      // Map agents with emoji avatars
      agents: this.mapAgents(openclawConfig.agents || [], overlay.agents || {}),
      
      // Map integrations/tools
      integrations: this.mapIntegrations(openclawConfig.tools || [], overlay.integrations || {}),
      
      // Routing defaults
      routing: {
        defaultAgent: openclawConfig.defaultAgent || 'bud',
        fallbackBehavior: openclawConfig.fallbackBehavior || 'queue',
      },
      
      // Global policy
      globalPolicy: {
        defaultDeny: openclawConfig.policy?.defaultDeny !== false,
        requireApprovalFor: openclawConfig.policy?.requireApprovalFor || ['exec', 'admin'],
        auditAllActions: openclawConfig.policy?.auditAllActions !== false,
      },

      // UI settings with avatar configuration
      ui: {
        avatars: {
          mode: overlay.ui?.avatars?.mode || 'emoji',
          fallbackSet: overlay.ui?.avatars?.fallbackSet || FALLBACK_EMOJI_SET,
        },
        sidebar: {
          collapsedByDefault: overlay.ui?.sidebar?.collapsedByDefault || false,
          order: overlay.ui?.sidebar?.order || [],
        },
      },

      // Settings pointers for frontend navigation
      settingsPointers: {
        agentAvatarModePath: '/ui/avatars/mode',
        agentEmojiPath: '/agents/*/avatar/emoji',
        fallbackEmojiPath: '/ui/avatars/fallbackSet',
        agentDisplayNamePath: '/agents/*/displayName',
        ...overlay.settingsPointers,
      },
    };
  }

  mapProviders(providers) {
    return providers.map(p => ({
      id: p.id || p.name,
      type: p.type || 'cloud',
      endpoint: p.endpoint,
    }));
  }

  mapModels(models) {
    return models.map(m => ({
      id: m.id || m.name,
      provider: m.provider,
      type: m.type || 'chat',
      maxTokens: m.maxTokens,
    }));
  }

  /**
   * Map agents with emoji avatar resolution
   */
  mapAgents(agents, overlayAgents) {
    return agents.map((agent, index) => {
      const overlay = overlayAgents[agent.id] || {};
      
      // Build policy from OpenClaw permissions
      const policy = this.buildPolicy(agent.permissions || {}, overlay.policy);
      
      // Resolve emoji avatar (priority: overlay → openclaw → deterministic fallback)
      const avatar = this.resolveAvatar(agent, overlay, index);
      
      return {
        id: agent.id,
        name: agent.name || agent.id,
        displayName: overlay.displayName || agent.displayName || agent.name || agent.id,
        type: agent.type || 'cloud',
        provider: agent.provider || 'unknown',
        model: agent.model,
        capabilities: agent.capabilities || [],
        policy,
        routing: {
          priority: agent.priority || 0,
          autoAssign: agent.autoAssign || false,
        },
        avatar, // Emoji avatar object
        metadata: {
          description: overlay.description || agent.description,
          icon: overlay.icon || agent.icon,
          category: overlay.category || 'general',
        },
      };
    });
  }

  /**
   * Resolve emoji avatar for an agent
   * Priority: 1. Overlay → 2. OpenClaw config → 3. Deterministic fallback
   */
  resolveAvatar(agent, overlay, index) {
    let emoji = null;
    let source = 'fallback';

    // 1. Check overlay (highest priority)
    if (overlay.emoji && this.isValidEmoji(overlay.emoji)) {
      emoji = overlay.emoji;
      source = 'overlay';
    }
    // 2. Check OpenClaw config avatar/emoji
    else if (agent.avatar?.emoji && this.isValidEmoji(agent.avatar.emoji)) {
      emoji = agent.avatar.emoji;
      source = 'config';
    }
    else if (agent.emoji && this.isValidEmoji(agent.emoji)) {
      emoji = agent.emoji;
      source = 'config';
    }
    // 3. Deterministic fallback based on agentId hash
    else {
      emoji = this.getDeterministicEmoji(agent.id);
      source = 'fallback';
    }

    // Validate and log if fallback was used
    if (source === 'fallback') {
      console.log(`   🎨 Agent "${agent.id}" using fallback emoji: ${emoji}`);
    }

    return {
      mode: 'emoji',
      emoji: emoji,
    };
  }

  /**
   * Get deterministic emoji from agentId hash
   * Ensures same agent always gets same emoji across restarts
   */
  getDeterministicEmoji(agentId) {
    // Create hash of agentId
    const hash = createHash('md5').update(agentId).digest('hex');
    
    // Use first 8 chars as number, modulo fallback set size
    const hashPrefix = parseInt(hash.substring(0, 8), 16);
    const index = hashPrefix % FALLBACK_EMOJI_SET.length;
    
    return FALLBACK_EMOJI_SET[index];
  }

  /**
   * Basic emoji validation
   * - Must be non-empty
   * - Must be <= 8 characters (handles multi-codepoint emoji)
   * - Basic Unicode emoji check (regex)
   */
  isValidEmoji(emoji) {
    if (!emoji || typeof emoji !== 'string') return false;
    if (emoji.length === 0 || emoji.length > 8) return false;
    
    // Basic emoji regex (matches most common emoji)
    // This is a simplified check - production might want more robust validation
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20EF}]/u;
    
    // Also allow simple symbols that might be used as avatars
    const symbolRegex = /[📁📂📄📊📈📉📋📌📍📎📏📐📑📒📓📔📕📖📗📘📙📚📛📜📝📞📟📠📡📢📣📤📥📦📧📨📩📪📫📬📭📮📯📰📱📲📳📴📵📶📷📸📹📺📻📼📽️📿🔀🔁🔂🔃🔄🔅🔆🔇🔈🔉🔊🔋🔌🔍🔎🔏🔐🔑🔒🔓🔔🔕🔖🔗🔘🔙🔚🔛🔜🔝🔞🔟🔠🔡🔢🔣🔤🔥🔦🔧🔨🔩🔪🔫🔬🔭🔮🔯🔰🔱🔲🔳🔴🔵🔶🔷🔸🔹🔺🔻🔼🔽🔾🔿🕯️🕰️🕳️🕴️🕵️🕶️🕷️🕸️🕹️🕺🖇️🖊️🖋️🖌️🖍️🖐️🖕🖖🖤🖥️🖨️🖱️🖲️🖼️🗂️🗃️🗄️🗑️🗒️🗓️🗜️🗝️🗞️🗡️🗣️🗨️🗯️🗳️🗺️🛋️🛍️🛎️🛏️🛐🛑🛒🛠️🛡️🛢️🛣️🛤️🛥️🛩️🛫🛬🛰️🛳️🛴🛵🛷🛸🛹🛺🛻🛼🛽🟠🟡🟢🔵🟣🟤🟥🟦🟧🟨🟩🟪🟫]/u;
    
    return emojiRegex.test(emoji) || symbolRegex.test(emoji) || emoji.length <= 2;
  }

  mapIntegrations(tools, overlayIntegrations) {
    return tools.map(tool => {
      const overlay = overlayIntegrations[tool.id] || {};
      
      return {
        id: tool.id,
        name: overlay.displayName || tool.name || tool.id,
        type: tool.type || 'api',
        provider: tool.provider || 'unknown',
        enabled: tool.enabled !== false,
        capabilities: tool.capabilities || ['read'],
        config: this.redactSecrets(tool.config || {}),
      };
    });
  }

  buildPolicy(permissions, overlayPolicy) {
    // Default deny
    const policy = {
      allow: [],
      deny: [],
      requiresApproval: [],
      scopes: {
        folders: [],
        repos: [],
      },
      budgets: {
        maxConcurrent: 1,
      },
    };

    // Apply permissions
    if (permissions.read) policy.allow.push('read');
    if (permissions.write) policy.allow.push('write');
    if (permissions.exec) policy.allow.push('exec');
    if (permissions.admin) policy.allow.push('admin');

    // Apply denials (explicit deny overrides allow)
    if (permissions.deny) {
      policy.deny = permissions.deny;
    }

    // Apply approval requirements
    if (permissions.requiresApproval) {
      policy.requiresApproval = permissions.requiresApproval;
    }

    // Apply scopes
    if (permissions.scopes) {
      policy.scopes = {
        folders: permissions.scopes.folders || [],
        repos: permissions.scopes.repos || [],
      };
    }

    // Apply budgets
    if (permissions.budgets) {
      policy.budgets = {
        ...policy.budgets,
        ...permissions.budgets,
      };
    }

    // Overlay can add metadata but not grant new permissions unless explicitly allowed
    if (overlayPolicy?.metadata) {
      policy.metadata = overlayPolicy.metadata;
    }

    return policy;
  }

  redactSecrets(config) {
    const redacted = { ...config };
    const secretKeys = ['apiKey', 'token', 'password', 'secret', 'key'];
    
    for (const key of Object.keys(redacted)) {
      if (secretKeys.some(sk => key.toLowerCase().includes(sk))) {
        redacted[key] = '[REDACTED]';
      }
    }
    
    return redacted;
  }

  /**
   * Get current config (redacted for frontend)
   */
  getConfig() {
    if (!this.currentConfig) {
      return null;
    }

    // Return a copy with any additional redaction needed for frontend
    return {
      ...this.currentConfig,
      // Ensure no secrets leak
      integrations: this.currentConfig.integrations.map(i => ({
        ...i,
        config: this.redactSecrets(i.config),
      })),
    };
  }

  /**
   * Get UI settings only (lightweight endpoint)
   */
  getUISettings() {
    if (!this.currentConfig) {
      return null;
    }

    return {
      ui: this.currentConfig.ui,
      settingsPointers: this.currentConfig.settingsPointers,
      agents: this.currentConfig.agents.map(a => ({
        id: a.id,
        displayName: a.displayName,
        avatar: a.avatar,
      })),
    };
  }

  /**
   * Get health status
   */
  getHealth() {
    return {
      loaded: this.isLoaded,
      version: this.currentConfig?.version || null,
      hash: this.lastHash,
      loadedAt: this.currentConfig?.loadedAt || null,
      validationErrors: this.validationErrors.map(e => ({
        path: e.path,
        message: e.message,
      })),
    };
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.currentConfig?.agents.find(a => a.id === agentId) || null;
  }

  /**
   * Get integration by ID
   */
  getIntegration(integrationId) {
    return this.currentConfig?.integrations.find(i => i.id === integrationId) || null;
  }

  /**
   * Manual reload (for admin use)
   */
  async reload() {
    console.log('🔄 Manual config reload triggered');
    await this.loadConfig();
    return this.getHealth();
  }

  /**
   * Stop watching
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

// Singleton instance
export const configBridge = new ConfigBridge();
