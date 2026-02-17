import { useEffect, useState } from 'react';
import { 
  Plug, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Server, MessageSquare, Database, GitBranch
} from 'lucide-react';
import { 
  getIntegrations, 
  createIntegration, 
  deleteIntegration, 
  testIntegration,
  updateIntegrationStatus,
} from '../utils/api';
import { useAppStore } from '../stores/appStore';
import type { Integration } from '../types/index.js';
import { cn } from '../utils/cn';

const typeIcons: Record<Integration['type'], React.ComponentType<{ className?: string }>> = {
  api: Server,
  database: Database,
  messaging: MessageSquare,
  service: GitBranch,
};

const typeOptions: { value: Integration['type']; label: string }[] = [
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'service', label: 'Service' },
];

const statusConfig = {
  connected: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
  disconnected: { color: 'text-gray-500', bg: 'bg-gray-500/10', icon: XCircle },
  error: { color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertCircle },
};

export function Integrations() {
  const { integrations, setIntegrations } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'api' as Integration['type'],
    provider: 'openai',
    config: { apiKey: '', endpoint: '' },
  });

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const data = await getIntegrations();
      setIntegrations(data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createIntegration(formData);
      setShowModal(false);
      setFormData({ name: '', type: 'api', provider: 'openai', config: { apiKey: '', endpoint: '' } });
      loadIntegrations();
    } catch (err) {
      alert('Failed to create integration: ' + (err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this integration?')) return;
    try {
      await deleteIntegration(id);
      loadIntegrations();
    } catch (err) {
      alert('Failed to delete integration: ' + (err as Error).message);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await testIntegration(id);
      alert(result.message);
      loadIntegrations();
    } catch (err) {
      alert('Test failed: ' + (err as Error).message);
    } finally {
      setTesting(null);
    }
  };

  const handleToggleStatus = async (integration: Integration) => {
    const newStatus = integration.status === 'connected' ? 'disconnected' : 'connected';
    try {
      await updateIntegrationStatus(integration.id, newStatus);
      loadIntegrations();
    } catch (err) {
      alert('Failed to update status: ' + (err as Error).message);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-foreground-secondary mt-1">
            Manage API providers and external services
          </p>
        </div>
        <button 
          className="btn-apple flex items-center gap-2"
          onClick={() => setShowModal(true)}
        >
          <Plus className="w-4 h-4" />
          Add Integration
        </button>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center">Loading integrations...</div>
      ) : integrations.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Plug className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
          <p className="text-foreground-secondary">No integrations configured yet</p>
          <button 
            className="btn-apple mt-4"
            onClick={() => setShowModal(true)}
          >
            Add Your First Integration
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((integration) => {
            const TypeIcon = typeIcons[integration.type] || Plug;
            const status = statusConfig[integration.status];
            const StatusIcon = status.icon;
            
            return (
              <div key={integration.id} className="glass-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg', status.bg)}>
                      <TypeIcon className={cn('w-5 h-5', status.color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{integration.name}</h3>
                      <p className="text-sm text-foreground-secondary capitalize">
                        {integration.provider} • {integration.type}
                      </p>
                    </div>
                  </div>
                  <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs', status.bg)}>
                    <StatusIcon className={cn('w-3 h-3', status.color)} />
                    <span className={status.color}>{integration.status}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-glass-border dark:border-glass-border-dark">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground-secondary">
                      Last sync: {integration.lastSync 
                        ? new Date(integration.lastSync).toLocaleString() 
                        : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    className="btn-apple-secondary flex-1 text-sm py-1.5"
                    onClick={() => handleTest(integration.id)}
                    disabled={testing === integration.id}
                  >
                    <RefreshCw className={cn('w-3 h-3 mr-1', testing === integration.id && 'animate-spin')} />
                    Test
                  </button>
                  <button
                    className={cn(
                      'flex-1 text-sm py-1.5 rounded-lg transition-colors',
                      integration.status === 'connected'
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                    )}
                    onClick={() => handleToggleStatus(integration)}
                  >
                    {integration.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-secondary hover:text-red-500 transition-colors"
                    onClick={() => handleDelete(integration.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Add Integration</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  className="input-apple w-full"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., OpenAI Production"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    className="input-apple w-full"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Integration['type'] })}
                  >
                    {typeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Provider</label>
                  <select
                    className="input-apple w-full"
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama</option>
                    <option value="replit">Replit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  className="input-apple w-full"
                  value={formData.config.apiKey}
                  onChange={(e) => setFormData({ ...formData, config: { ...formData.config, apiKey: e.target.value } })}
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Endpoint (optional)</label>
                <input
                  type="text"
                  className="input-apple w-full"
                  value={formData.config.endpoint}
                  onChange={(e) => setFormData({ ...formData, config: { ...formData.config, endpoint: e.target.value } })}
                  placeholder="https://api.example.com"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="btn-apple-secondary flex-1"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-apple flex-1">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}