import { useEffect, useState } from 'react';
import { ScrollText, Filter, Download, CheckCircle2, XCircle, AlertTriangle, Search } from 'lucide-react';
import { getAuditLogs, type AuditLog } from '../utils/api';
import { cn } from '../utils/cn';

const resultConfig = {
  success: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
  failure: { color: 'text-red-500', bg: 'bg-red-500/10', icon: XCircle },
  blocked: { color: 'text-amber-500', bg: 'bg-amber-500/10', icon: AlertTriangle },
};

export function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    actionType: '',
    result: '',
    search: '',
  });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [filters.actionType, filters.result]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs({
        actionType: filters.actionType || undefined,
        result: filters.result || undefined,
        limit: 100,
      });
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!filters.search) return true;
    const search = filters.search.toLowerCase();
    return (
      log.action.toLowerCase().includes(search) ||
      log.agentName?.toLowerCase().includes(search) ||
      log.integration?.toLowerCase().includes(search)
    );
  });

  const handleExport = () => {
    const exportData = logs.map((log) => ({
      timestamp: log.timestamp.toISOString(),
      agent: log.agentName,
      action: log.action,
      type: log.actionType,
      result: log.result,
      details: log.details,
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-foreground-secondary mt-1">
            System activity and execution history
          </p>
        </div>
        <button 
          className="btn-apple-secondary flex items-center gap-2"
          onClick={handleExport}
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      <div className="glass-card p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-foreground-secondary" />
            <select
              className="input-apple text-sm py-1.5"
              value={filters.actionType}
              onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="task">Task</option>
              <option value="agent">Agent</option>
              <option value="integration">Integration</option>
              <option value="policy">Policy</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="input-apple text-sm py-1.5"
              value={filters.result}
              onChange={(e) => setFilters({ ...filters, result: e.target.value })}
            >
              <option value="">All Results</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-secondary" />
              <input
                type="text"
                className="input-apple w-full pl-9 text-sm py-1.5"
                placeholder="Search logs..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center">Loading logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <ScrollText className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
          <p className="text-foreground-secondary">No logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const config = resultConfig[log.result];
            const Icon = config.icon;
            const isExpanded = expandedLog === log.id;
            
            return (
              <div 
                key={log.id} 
                className={cn(
                  'glass-card p-4 cursor-pointer transition-all',
                  isExpanded && 'ring-1 ring-accent'
                )}
                onClick={() => setExpandedLog(isExpanded ? null : log.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn('p-2 rounded-lg', config.bg)}>
                    <Icon className={cn('w-4 h-4', config.color)} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{log.action}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-background-secondary dark:bg-background-secondary-dark">
                        {log.actionType}
                      </span>
                    </div>                    <div className="flex items-center gap-3 text-sm text-foreground-secondary mt-0.5">
                      {log.agentName && (
                        <span>Agent: {log.agentName}</span>
                      )}
                      {log.integration && (
                        <span>Integration: {log.integration}</span>
                      )}
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className={cn('text-sm font-medium', config.color)}>
                    {log.result}
                  </div>
                </div>

                {isExpanded && log.details && (
                  <div className="mt-4 pt-4 border-t border-glass-border dark:border-glass-border-dark">
                    <h4 className="text-sm font-medium mb-2">Details</h4>
                    <pre className="bg-background-secondary dark:bg-background-secondary-dark p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}