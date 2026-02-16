import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { getProjects } from '../utils/api';

export function Projects() {
  const { projects, activeProject, setProjects, setActiveProject } = useAppStore();

  useEffect(() => {
    getProjects().then(setProjects);
  }, [setProjects]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Projects</h1>
      <div className="space-y-3">
        {projects.map((project) => (
          <button
            key={project.id}
            className="glass-card p-4 w-full text-left"
            onClick={() => setActiveProject(project)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{project.name}</p>
                <p className="text-sm text-foreground-secondary">{project.path}</p>
              </div>
              {activeProject?.id === project.id && <span className="context-lock locked">Locked</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
