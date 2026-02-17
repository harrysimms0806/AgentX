import { useEffect, useState } from 'react';
import { Settings, RefreshCw, CheckCircle2, AlertCircle, FileJson, Shield, Users } from 'lucide-react';
import { getConfigHealth } from '../utils/api';
import { cn } from '../utils/cn';

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