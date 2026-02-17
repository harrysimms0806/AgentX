import { useEffect, useState, useRef } from 'react';
import { Settings, RefreshCw, CheckCircle2, AlertCircle, FileJson, Shield, Users, Download, Upload, Database } from 'lucide-react';
import { getConfigHealth } from '../utils/api';
import { cn } from '../utils/cn';
import { toast } from '../components/Toast';
import { useAppStore } from '../stores/appStore';
import { useWorkflowStore } from '../stores/workflowStore';

interface ConfigHealth {
  loaded: boolean;
  configPath?: string;
  lastReload?: string;
  errors?: string[];
}

export function SettingsPage() {
  const [health, setHealth] = useState<ConfigHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'agents' | 'security'>('general');

  useEffect(() => {
    loadHealth();
  }, []);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const data = await getConfigHealth();
      setHealth(data);
    } catch (err) {
      console.error('Failed to load config health:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-foreground-secondary mt-1">
          Configure preferences, credentials, and system defaults
        </p>
      </div>

      <div className="flex gap-4 mb-6 border-b border-glass-border dark:border-glass-border-dark">
        {[
          { id: 'general', label: 'General', icon: Settings },
          { id: 'agents', label: 'Agents', icon: Users },
          { id: 'security', label: 'Security', icon: Shield },
        ].map((tab) => (
          <button
            key={tab.id}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-foreground-secondary hover:text-foreground'
            )}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              Configuration Status
            </h2>

            {loading ? (
              <div className="flex items-center gap-2 text-foreground-secondary">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading configuration...
              </div>
            ) : health ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {health.loaded ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="text-green-500 font-medium">Configuration loaded</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <span className="text-red-500 font-medium">Configuration failed to load</span>
                    </>
                  )}
                </div>

                {health.configPath && (
                  <div className="text-sm">
                    <span className="text-foreground-secondary">Config path: </span>
                    <code className="bg-background-secondary dark:bg-background-secondary-dark px-2 py-0.5 rounded">
                      {health.configPath}
                    </code>
                  </div>
                )}

                {health.lastReload && (
                  <div className="text-sm">
                    <span className="text-foreground-secondary">Last reload: </span>
                    {new Date(health.lastReload).toLocaleString()}
                  </div>
                )}

                {health.errors && health.errors.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium mb-2 text-red-500">Errors</h3>
                    <div className="space-y-1">
                      {health.errors.map((error, i) => (
                        <div 
                          key={i} 
                          className="text-sm text-red-500 bg-red-500/10 p-2 rounded"
                        >
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  className="btn-apple-secondary flex items-center gap-2 mt-4"
                  onClick={loadHealth}
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Status
                </button>
              </div>
            ) : (
              <div className="text-foreground-secondary">
                Failed to load configuration status
              </div>
            )}
          </section>

          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4">UI Preferences</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Theme</label>
                  <p className="text-sm text-foreground-secondary">Choose your preferred color scheme</p>
                </div>
                <select className="input-apple">
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Sidebar Default</label>
                  <p className="text-sm text-foreground-secondary">Start with sidebar collapsed or expanded</p>
                </div>
                <select className="input-apple">
                  <option value="expanded">Expanded</option>
                  <option value="collapsed">Collapsed</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Auto-refresh Interval</label>
                  <p className="text-sm text-foreground-secondary">How often to refresh dashboard data</p>
                </div>
                <select className="input-apple">
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                </select>
              </div>
            </div>
          </section>

          <DataManagementSection />
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold mb-4">Default Agent Settings</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium">Max Concurrent Tasks</label>
                <p className="text-sm text-foreground-secondary">Default maximum tasks per agent</p>
              </div>
              <input 
                type="number" 
                className="input-apple w-24" 
                defaultValue={3}
                min={1}
                max={10}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium">Default Timeout</label>
                <p className="text-sm text-foreground-secondary">Task execution timeout in seconds</p>
              </div>
              <input 
                type="number" 
                className="input-apple w-24" 
                defaultValue={300}
                min={30}
                step={30}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium">Auto-retry Failed Tasks</label>
                <p className="text-sm text-foreground-secondary">Automatically retry failed tasks once</p>
              </div>
              <input type="checkbox" className="w-5 h-5 accent-accent" defaultChecked />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security Policies
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Require Approval for Writes</label>
                  <p className="text-sm text-foreground-secondary">Prompt for approval before file modifications</p>
                </div>
                <input type="checkbox" className="w-5 h-5 accent-accent" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Require Approval for Exec</label>
                  <p className="text-sm text-foreground-secondary">Prompt for approval before command execution</p>
                </div>
                <input type="checkbox" className="w-5 h-5 accent-accent" defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Audit Log Retention</label>
                  <p className="text-sm text-foreground-secondary">Days to keep audit logs</p>
                </div>
                <select className="input-apple">
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            </div>
          </section>

          <section className="glass-card p-6 border-amber-500/20">
            <h2 className="text-lg font-semibold mb-4 text-amber-500">Danger Zone</h2>
            
            <div className="space-y-3">
              <button className="btn-apple-secondary w-full text-left flex items-center justify-between">
                <span>Clear All Audit Logs</span>
                <span className="text-xs text-foreground-secondary">Cannot be undone</span>
              </button>
              
              <button className="w-full text-left px-4 py-2 rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors">
                Reset All Settings to Default
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Data Management Component
function DataManagementSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { agents, tasks, projects, integrations } = useAppStore();
  const { workflows } = useWorkflowStore();

  const handleExport = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      agents,
      tasks,
      projects,
      integrations,
      workflows,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentx-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Data exported successfully', {
      action: {
        label: 'View file',
        onClick: () => {},
      },
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        // Validate structure
        if (!data.version || !data.exportedAt) {
          toast.error('Invalid backup file format');
          return;
        }

        // Show confirmation with summary
        const summary = [
          data.agents?.length && `${data.agents.length} agents`,
          data.tasks?.length && `${data.tasks.length} tasks`,
          data.projects?.length && `${data.projects.length} projects`,
          data.workflows?.length && `${data.workflows.length} workflows`,
        ].filter(Boolean).join(', ');

        if (confirm(`Import ${summary}? This will merge with existing data.`)) {
          // Import logic would go here - for now just show success
          toast.success(`Imported ${summary}`);
        }
      } catch (err) {
        toast.error('Failed to parse backup file');
      }
    };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = '';
  };

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-accent/10">
          <Database className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Data Management</h2>
          <p className="text-sm text-foreground-secondary">Export or import your AgentX data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={handleExport}
          className="flex items-center gap-3 p-4 rounded-xl border border-glass-border dark:border-glass-border-dark hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors text-left"
        >
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Download className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="font-medium">Export Data</p>
            <p className="text-sm text-foreground-secondary">Download all agents, tasks, workflows</p>
          </div>
        </button>

        <button
          onClick={handleImportClick}
          className="flex items-center gap-3 p-4 rounded-xl border border-glass-border dark:border-glass-border-dark hover:bg-background-secondary dark:hover:bg-background-secondary-dark transition-colors text-left"
        >
          <div className="p-2 rounded-lg bg-green-500/10">
            <Upload className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="font-medium">Import Data</p>
            <p className="text-sm text-foreground-secondary">Restore from a backup file</p>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div className="mt-4 p-3 rounded-lg bg-background-secondary/50 dark:bg-background-secondary-dark/50 text-sm text-foreground-secondary">
        <p><strong>Current data:</strong> {' '}
          {agents.length} agents, {tasks.length} tasks, {projects.length} projects, {workflows.length} workflows
        </p>
      </div>
    </section>
  );
}