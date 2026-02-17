import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Heart, Database, Wifi, Cpu, HardDrive, Server,
  CheckCircle2, AlertCircle, XCircle, Activity
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useWebSocket } from '../hooks/useWebSocket';

interface SystemStatus {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  icon: React.ElementType;
  latency?: number;
  uptime?: string;
  lastCheck: Date;
}

const mockServices: SystemStatus[] = [
  { id: 'websocket', name: 'WebSocket', status: 'healthy', icon: Wifi, latency: 12, uptime: '99.9%', lastCheck: new Date() },
  { id: 'database', name: 'Database', status: 'healthy', icon: Database, latency: 8, uptime: '100%', lastCheck: new Date() },
  { id: 'api', name: 'API Server', status: 'healthy', icon: Server, latency: 24, uptime: '99.8%', lastCheck: new Date() },
  { id: 'agents', name: 'Agent Pool', status: 'healthy', icon: Cpu, latency: 45, uptime: '99.5%', lastCheck: new Date() },
  { id: 'storage', name: 'Storage', status: 'healthy', icon: HardDrive, latency: 15, uptime: '100%', lastCheck: new Date() },
];

const statusConfig = {
  healthy: { color: 'text-green-500', bgColor: 'bg-green-500/10', icon: CheckCircle2, label: 'Healthy' },
  warning: { color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: AlertCircle, label: 'Warning' },
  error: { color: 'text-red-500', bgColor: 'bg-red-500/10', icon: XCircle, label: 'Error' },
  unknown: { color: 'text-gray-500', bgColor: 'bg-gray-500/10', icon: Activity, label: 'Unknown' },
};

interface SystemHealthMonitorProps {
  className?: string;
  compact?: boolean;
}

export function SystemHealthMonitor({ className, compact = false }: SystemHealthMonitorProps) {
  const [services, setServices] = useState<SystemStatus[]>(mockServices);
  const [overallStatus, setOverallStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const { connected } = useWebSocket();

  // Calculate overall status
  useEffect(() => {
    const hasError = services.some(s => s.status === 'error');
    const hasWarning = services.some(s => s.status === 'warning');
    
    if (hasError) setOverallStatus('error');
    else if (hasWarning) setOverallStatus('warning');
    else setOverallStatus('healthy');
  }, [services]);

  // Update WebSocket status based on connection
  useEffect(() => {
    setServices(prev => prev.map(s => 
      s.id === 'websocket' 
        ? { ...s, status: connected ? 'healthy' : 'error', lastCheck: new Date() }
        : s
    ));
  }, [connected]);

  // Simulate status updates
  useEffect(() => {
    const interval = setInterval(() => {
      setServices(prev => prev.map(service => {
        // Randomly vary latency
        const latencyVariation = Math.floor(Math.random() * 20) - 10;
        const newLatency = Math.max(5, (service.latency || 20) + latencyVariation);
        
        // Occasionally introduce warnings (rarely errors)
        const rand = Math.random();
        let newStatus = service.status;
        if (rand > 0.98) newStatus = 'warning';
        else if (rand > 0.995) newStatus = 'error';
        else if (service.status !== 'healthy' && rand > 0.9) newStatus = 'healthy';
        
        return {
          ...service,
          latency: newLatency,
          status: newStatus,
          lastCheck: new Date(),
        };
      }));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const overallConfig = statusConfig[overallStatus];
  const OverallIcon = overallConfig.icon;

  if (compact) {
    return (
      <div className={cn("glass-card p-4", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl", overallConfig.bgColor)}>
              <Heart className={cn("w-5 h-5", overallConfig.color)} />
            </div>
            <div>
              <p className="font-medium">System Health</p>
              <p className={cn("text-sm", overallConfig.color)}>{overallConfig.label}</p>
            </div>
          </div>
          
          <div className="flex -space-x-1">
            {services.slice(0, 4).map((service) => {
              const config = statusConfig[service.status];
              return (
                <div
                  key={service.id}
                  className={cn(
                    "w-2 h-2 rounded-full border-2 border-background",
                    config.bgColor.replace('/10', '')
                  )}
                  title={`${service.name}: ${config.label}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("glass-card overflow-hidden", className)}>
      {/* Header */}
      <div className="p-4 border-b border-glass-border dark:border-glass-border-dark">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div 
              className={cn("p-2 rounded-xl", overallConfig.bgColor)}
              animate={{ scale: overallStatus === 'healthy' ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <OverallIcon className={cn("w-5 h-5", overallConfig.color)} />
            </motion.div>
            <div>
              <h3 className="font-semibold">System Health</h3>
              <p className={cn("text-sm", overallConfig.color)}>{overallConfig.label}</p>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-2xl font-bold">{services.filter(s => s.status === 'healthy').length}/{services.length}</p>
            <p className="text-xs text-foreground-secondary">Services up</p>
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className="p-2">
        {services.map((service, index) => {
          const Icon = service.icon;
          const config = statusConfig[service.status];
          const StatusIcon = config.icon;
          
          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-background-secondary/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-background-secondary dark:bg-background-secondary-dark">
                  <Icon className="w-4 h-4 text-foreground-secondary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{service.name}</p>
                  <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                    <span>{service.latency}ms</span>
                    <span>•</span>
                    <span>{service.uptime}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn("text-xs hidden sm:block", config.color)}>
                  {config.label}
                </span>
                <div className={cn("p-1.5 rounded-lg", config.bgColor)}>
                  <StatusIcon className={cn("w-3 h-3", config.color)} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-glass-border dark:border-glass-border-dark bg-background-secondary/30">
        <div className="flex items-center justify-between text-xs text-foreground-secondary">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span>{services.filter(s => s.status === 'healthy').length} Healthy</span>
            </div>
            {services.some(s => s.status === 'warning') && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{services.filter(s => s.status === 'warning').length} Warning</span>
              </div>
            )}
            {services.some(s => s.status === 'error') && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>{services.filter(s => s.status === 'error').length} Error</span>
              </div>
            )}
          </div>
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

export default SystemHealthMonitor;
