import { useEffect, useState } from 'react';
import { TaskCard } from '../components/TaskCard';
import { TaskModal } from '../components/TaskModal';
import { useAppStore } from '../stores/appStore';
import { createTask, getAgents, getProjects, getTasks } from '../utils/api';

export function Tasks() {
  const { tasks, agents, projects, setTasks, setAgents, setProjects, addTask } = useAppStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    Promise.all([getTasks(), getAgents(), getProjects()]).then(([tasksData, agentsData, projectsData]) => {
      setTasks(tasksData);
      setAgents(agentsData);
      setProjects(projectsData);
    });
  }, [setAgents, setProjects, setTasks]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Task Queue</h1>
        <button className="btn-apple" onClick={() => setOpen(true)}>New Task</button>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} agentName={agents.find((agent) => agent.id === task.agentId)?.name} />
        ))}
      </div>
      <TaskModal
        open={open}
        agents={agents}
        projects={projects}
        onClose={() => setOpen(false)}
        onSubmit={async (data) => {
          const task = await createTask(data);
          addTask(task);
        }}
      />
    </div>
  );
}
