import { useEffect, useState } from 'react';
import { Plus, Bot, Sparkles, Shield, Code, Search } from 'lucide-react';
import { AgentCard } from '../components/AgentCard';
import { useAppStore } from '../stores/appStore';
import { getAgents, createAgent, deleteAgent } from '../utils/api';
import type { Agent } from '../types/index.js';
import { cn } from '../utils/cn';

const agentTemplates = [
  { id: 'coordinator', name: 'Coordinator', description: 'Orchestrates multi-agent workflows', icon: Sparkles, color: 'bg-purple-500/20 text-purple-500' },
  { id: 'builder', name: 'Builder', description: 'Writes and edits code', icon: Code, color: 'bg-blue-500/20 text-blue-500' },
  { id: 'reviewer', name: 'Reviewer', description: 'Reviews code and checks quality', icon: Shield, color: 'bg-green-500/20 text-green-500' },
  { id: 'researcher', name: 'Researcher', description: 'Searches and analyzes information', icon: Bot, color: 'bg-amber-500/20 text-amber-500' },
];

export function Agents() {
  const { agents, setAgents, addAgent, removeAgent } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'builder' as Agent['type'],
    provider: 'openai',
    model: 'gpt-4o',
    capabilities: [] as string[],
  });

  useEffect(() => {
    getAgents().then(setAgents);
  }, [setAgents]);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const agent = await createAgent({
        ...formData,
        avatar: '🤖',
        config: { maxConcurrentTasks: 3, timeout: 300000 },
      });
      addAgent(agent);
      setShowModal(false);
      setFormData({ name: '', type: 'builder', provider: 'openai', model: 'gpt-4o', capabilities: [] });
    } catch (err) {
      alert('Failed to create agent: ' + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;
    try {
      await deleteAgent(id);
      removeAgent(id);
    } catch (err) {
      alert('Failed to delete agent: ' + (err as Error).message);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = agentTemplates.find((t) => t.id === templateId);
    if (template) {
      setFormData({
        ...formData,
        name: template.name,
        type: template.id as Agent['type'],
      });
      setShowTemplates(false);
      setShowModal(true);
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-foreground-secondary mt-1">
            Manage AI agents and their capabilities
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-apple-secondary flex items-center gap-2"
            onClick={() => { setShowTemplates(true); setSelectedAgent(null); }}
          >
            <Sparkles className="w-4 h-4" />
            From Template
          </button>
          <button
            className="btn-apple flex items-center gap-2"
            onClick={() => { setShowModal(true); setShowTemplates(false); setSelectedAgent(null); }}
          >
            <Plus className="w-4 h-4" />
            New Agent
          </button>
        </div>
      </div>

      <div className="glass-card p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary" />
          <input
            type="text"
            className="input-apple w-full pl-9"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {filteredAgents.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Bot className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
          <p className="text-foreground-secondary">No agents found</p>
          <button
            className="btn-apple mt-4"
            onClick={() => setShowModal(true)}
          >
            Create Your First Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <div key={agent.id} className="relative group">
              <AgentCard agent={agent} />
              <button
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(agent.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showTemplates && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4">Choose a Template</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {agentTemplates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    className="glass-card p-4 text-left hover:ring-2 hover:ring-accent transition-all"
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className={cn('p-2 rounded-lg w-fit mb-3', template.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold">{template.name}</h3>
                    <p className="text-sm text-foreground-secondary mt-1">{template.description}</p>
                  </button>
                );
              })}
            </div>
            <button
              className="btn-apple-secondary w-full mt-4"
              onClick={() => setShowTemplates(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {selectedAgent ? 'Edit Agent' : 'Create Agent'}
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  className="input-apple w-full"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Builder Bot"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    className="input-apple w-full"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Agent['type'] })}
                  >
                    <option value="coordinator">Coordinator</option>
                    <option value="builder">Builder</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="researcher">Researcher</option>
                    <option value="custom">Custom</option>
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
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Model</label>
                <input
                  type="text"
                  className="input-apple w-full"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g., gpt-4o, claude-3-opus"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Capabilities</label>
                <div className="flex flex-wrap gap-2">
                  {['read', 'write', 'exec', 'search', 'git'].map((cap) => (
                    <label key={cap} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-secondary dark:bg-background-secondary-dark cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={formData.capabilities.includes(cap)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, capabilities: [...formData.capabilities, cap] });
                          } else {
                            setFormData({ ...formData, capabilities: formData.capabilities.filter((c) => c !== cap) });
                          }
                        }}
                      />
                      <span className="text-sm capitalize">{cap}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="btn-apple-secondary flex-1"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-apple flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : selectedAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
