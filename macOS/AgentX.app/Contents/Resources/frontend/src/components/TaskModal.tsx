import { useState, type FormEvent } from 'react';
import type { Agent, Project, Task } from '../types';

interface TaskModalProps {
  open: boolean;
  agents: Agent[];
  projects: Project[];
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    priority: Task['priority'];
    agentId: string;
    projectId: string;
    workspacePath: string;
  }) => Promise<void>;
}

export function TaskModal({ open, agents, projects, onClose, onSubmit }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [agentId, setAgentId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const selectedProject = projects.find((project) => project.id === projectId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        title,
        description,
        priority,
        agentId,
        projectId,
        workspacePath: selectedProject?.path || '/workspace/AgentX',
      });
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAgentId('');
      setProjectId('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold">Create Task</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input className="w-full rounded-apple border bg-background-secondary p-2" placeholder="Task title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <textarea className="w-full rounded-apple border bg-background-secondary p-2" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select className="rounded-apple border bg-background-secondary p-2" value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select className="rounded-apple border bg-background-secondary p-2" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              <option value="">Unassigned agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <select className="rounded-apple border bg-background-secondary p-2" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-apple-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-apple" disabled={submitting}>{submitting ? 'Creating...' : 'Create task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
