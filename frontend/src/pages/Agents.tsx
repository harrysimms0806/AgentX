import { useEffect } from 'react';
import { AgentCard } from '../components/AgentCard';
import { useAppStore } from '../stores/appStore';
import { getAgents } from '../utils/api';

export function Agents() {
  const { agents, setAgents } = useAppStore();

  useEffect(() => {
    getAgents().then(setAgents);
  }, [setAgents]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Agents</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
