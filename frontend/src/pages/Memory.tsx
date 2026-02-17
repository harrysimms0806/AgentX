import { useEffect, useState } from 'react';
import { Unlock, FolderGit2, Clock, User, AlertTriangle } from 'lucide-react';
import { getWorkspaceLocks, releaseLock, type WorkspaceLock } from '../utils/api';

export function Memory() {
  const [locks, setLocks] = useState<WorkspaceLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);

  useEffect(() => {
    loadLocks();
    const interval = setInterval(loadLocks, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadLocks = async () => {
    try {
      const data = await getWorkspaceLocks();
      setLocks(data);
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (lockId: string) => {
    if (!confirm('Are you sure you want to release this workspace lock?')) return;
    
    setReleasing(lockId);
    try {
      await releaseLock(lockId);
      loadLocks();
    } catch (err) {
      alert('Failed to release lock: ' + (err as Error).message);
    } finally {
      setReleasing(null);
    }
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Memory &amp; Locks</h1>
          <p className="text-foreground-secondary mt-1">
            Workspace locks and active context
          </p>
        </div>
        <div className="text-sm text-foreground-secondary">
          Auto-refreshing every 5s
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Active Workspace Locks</h2>
          
          {loading ? (
            <div className="glass-card p-8 text-center">Loading locks...</div>
          ) : locks.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <FolderGit2 className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
              <p className="text-foreground-secondary">No active workspace locks</p>
              <p className="text-sm text-foreground-secondary mt-1">
                Locks are created when agents start working on tasks
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {locks.map((lock) => (
                <div key={lock.id} className="glass-card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: lock.projectColor || '#3b82f6' }}
                      />
                      <div>
                        <h3 className="font-semibold">{lock.projectName}</h3>
                        <p className="text-sm text-foreground-secondary font-mono">
                          {lock.folderPath}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      className="btn-apple-secondary text-sm py-1.5 flex items-center gap-1.5"
                      onClick={() => handleRelease(lock.id)}
                      disabled={releasing === lock.id}
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      {releasing === lock.id ? 'Releasing...' : 'Release'}
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-glass-border dark:border-glass-border-dark">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-foreground-secondary" />
                        <span>{lock.agentName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-foreground-secondary" />
                        <span>Locked {getTimeAgo(lock.lockedAt)}</span>
                      </div>
                      {lock.expiresAt && (
                        <div className="flex items-center gap-2 text-amber-500">
                          <Clock className="w-4 h-4" />
                          <span>Expires {getTimeAgo(lock.expiresAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">System Status</h2>
          
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-foreground-secondary">Active Locks</span>
              <span className="text-2xl font-bold">{locks.length}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-foreground-secondary">Protected Projects</span>
              <span className="text-2xl font-bold">
                {new Set(locks.map((l) => l.projectId)).size}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-foreground-secondary">Active Agents</span>
              <span className="text-2xl font-bold">
                {new Set(locks.map((l) => l.agentId)).size}
              </span>
            </div>
          </div>

          <div className="glass-card p-4 mt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Force Release Warning</p>
                <p className="text-foreground-secondary">
                  Manually releasing locks can cause conflicts if the agent is still running. 
                  Only use when necessary.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}