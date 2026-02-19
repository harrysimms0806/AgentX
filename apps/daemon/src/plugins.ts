import { fork } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';
import { audit } from './audit';
import { OPENCLAW_ALLOWED_TOOLS } from './openclaw-protocol';
import { pluginDb } from './database';

const PERMISSIONS = ['fs_read', 'fs_write', 'exec_shell', 'workflows', 'register_tool'] as const;
type Permission = (typeof PERMISSIONS)[number];

type PluginManifest = {
  name: string;
  version: string;
  description: string;
  toolName: string;
  requestedPermissions: Permission[];
  sourceCode: string;
};

type PluginRecord = {
  id: string;
  name: string;
  version: string;
  description: string;
  toolName: string;
  status: 'pending' | 'active' | 'disabled';
  requestedPermissions: Permission[];
  approvedPermissions: Permission[];
  sourceCode: string;
  createdAt: string;
  updatedAt: string;
};

function validateManifest(input: Partial<PluginManifest>): PluginManifest {
  if (!input.name || !input.version || !input.toolName || !input.sourceCode) {
    throw new Error('name, version, toolName, and sourceCode are required');
  }
  const requestedPermissions = (input.requestedPermissions || []).filter((perm): perm is Permission =>
    PERMISSIONS.includes(perm as Permission)
  );
  return {
    name: input.name,
    version: input.version,
    description: input.description || '',
    toolName: input.toolName,
    requestedPermissions,
    sourceCode: input.sourceCode,
  };
}

class PluginManager {
  list(): Omit<PluginRecord, 'sourceCode'>[] {
    return pluginDb.list().map(({ sourceCode, ...rest }) => ({
      ...rest,
      requestedPermissions: rest.requestedPermissions as Permission[],
      approvedPermissions: rest.approvedPermissions as Permission[],
    }));
  }

  install(input: Partial<PluginManifest>, actorId: string): Omit<PluginRecord, 'sourceCode'> {
    const manifest = validateManifest(input);
    const now = new Date().toISOString();
    const record: PluginRecord = {
      id: `plugin-${randomUUID()}`,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      toolName: manifest.toolName,
      status: 'pending',
      requestedPermissions: manifest.requestedPermissions,
      approvedPermissions: [],
      sourceCode: manifest.sourceCode,
      createdAt: now,
      updatedAt: now,
    };

    pluginDb.create(record);
    void audit.logLegacy('system', 'user', 'PLUGIN_INSTALLED', {
      pluginId: record.id,
      name: record.name,
      requestedPermissions: record.requestedPermissions,
    }, actorId);

    const { sourceCode, ...safe } = record;
    return {
      ...safe,
      requestedPermissions: safe.requestedPermissions as Permission[],
      approvedPermissions: safe.approvedPermissions as Permission[],
    };
  }

  installSample(actorId: string): Omit<PluginRecord, 'sourceCode'> {
    return this.install({
      name: 'sample-echo-plugin',
      version: '1.0.0',
      description: 'Sample plugin that echoes an input string',
      toolName: 'sampleEcho',
      requestedPermissions: ['register_tool'],
      sourceCode: `module.exports.run = async (args) => ({ echo: String(args.input || ''), plugin: 'sample-echo-plugin' });`,
    }, actorId);
  }

  approve(pluginId: string, permissions: Permission[], actorId: string): Omit<PluginRecord, 'sourceCode'> {
    const plugin = pluginDb.getById(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const allowed = permissions.filter((perm) => plugin.requestedPermissions.includes(perm));
    const updated = pluginDb.updateApproval(pluginId, allowed, 'active');
    OPENCLAW_ALLOWED_TOOLS.add(updated.toolName);

    void audit.logLegacy('system', 'user', 'PLUGIN_APPROVED', {
      pluginId,
      approvedPermissions: allowed,
      toolName: updated.toolName,
    }, actorId);

    const { sourceCode, ...safe } = updated;
    return {
      ...safe,
      requestedPermissions: safe.requestedPermissions as Permission[],
      approvedPermissions: safe.approvedPermissions as Permission[],
    };
  }

  getRegisteredTools(): Array<{ name: string; description: string }> {
    return pluginDb.list().filter((plugin) => plugin.status === 'active').map((plugin) => ({
      name: plugin.toolName,
      description: plugin.description || `${plugin.name} plugin tool`,
    }));
  }

  async executeTool(toolName: string, args: Record<string, unknown>, actorId: string): Promise<unknown> {
    const plugin = pluginDb.getByToolName(toolName);
    if (!plugin || plugin.status !== 'active') {
      return undefined;
    }

    const workerPath = path.join(__dirname, 'plugin-worker.js');
    const child = fork(workerPath, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const requestId = randomUUID();

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('plugin_execution_timeout'));
      }, 2000);

      child.on('message', (message: any) => {
        if (!message || message.requestId !== requestId) return;
        clearTimeout(timeout);
        child.kill();
        if (message.type === 'result') {
          resolve(message.result);
          return;
        }
        reject(new Error(message.error || 'plugin_execution_failed'));
      });

      child.send({
        type: 'invoke',
        requestId,
        sourceCode: plugin.sourceCode,
        args,
      });
    });

    void audit.logLegacy('system', 'agent', 'PLUGIN_TOOL_EXECUTED', {
      pluginId: plugin.id,
      toolName,
      args,
    }, actorId);

    return result;
  }
}

export const pluginManager = new PluginManager();
export type { PluginRecord, Permission };
