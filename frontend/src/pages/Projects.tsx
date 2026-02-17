import { useEffect, useState } from 'react';
import { Plus, FolderGit2, GitBranch, Clock, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useRecentStore } from '../stores/recentStore';
import { getProjects, createProject, deleteProject } from '../utils/api';
import { cn } from '../utils/cn';
import type { Project } from '../types/index.js';

export function Projects() {
  const { projects, activeProject, setProjects, setActiveProject, addProject, removeProject } = useAppStore();
  const { addRecentItem } = useRecentStore();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    description: '',
    color: '#3b82f6',
  });

  const colors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#ef4444', '#06b6d4', '#6366f1',
  ];

  // Track page view
  useEffect(() => {
    addRecentItem({
      id: 'page-projects',
      type: 'project',
      title: 'Projects',
      subtitle: `${projects.length} projects`,
      path: '/projects',
    });
  }, [addRecentItem, projects.length]);

  useEffect(() => {
    setLoading(true);
    getProjects().then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, [setProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const project = await createProject({
        name: formData.name,
        path: formData.path || `/workspace/${formData.name.replace(/\s+/g, '-').toLowerCase()}`,
        description: formData.description,
      });
      addProject(project);
      setShowModal(false);
      setFormData({ name: '', path: '', description: '', color: '#3b82f6' });
    } catch (err) {
      alert('Failed to create project: ' + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteProject(id);
      removeProject(id);
      if (activeProject?.id === id) {
        setActiveProject(null);
      }
    } catch (err) {
      alert('Failed to delete project: ' + (err as Error).message);
    }
  };

  const handleLock = (project: Project) => {
    if (activeProject?.id === project.id) {
      setActiveProject(null);
    } else {
      setActiveProject(project);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-foreground-secondary mt-1">
            Manage workspace projects and folders
          </p>
        </div>
        <button
          className="btn-apple flex items-center gap-2"
          onClick={() => setShowModal(true)}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <FolderGit2 className="w-12 h-12 mx-auto text-foreground-secondary mb-3" />
          <p className="text-foreground-secondary">No projects yet</p>
          <button
            className="btn-apple mt-4"
            onClick={() => setShowModal(true)}
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => {
            const isLocked = activeProject?.id === project.id;
            return (
              <div
                key={project.id}
                className={cn(
                  'glass-card p-4 transition-all',
                  isLocked && 'ring-2 ring-accent'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: project.color + '20' }}
                    >
                      <FolderGit2
                        className="w-5 h-5"
                        style={{ color: project.color }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold">{project.name}</h3>
                      <p className="text-sm text-foreground-secondary">{project.path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className={cn(
                        'p-1.5 rounded-lg transition-colors',
                        isLocked
                          ? 'bg-accent/20 text-accent'
                          : 'hover:bg-background-secondary dark:hover:bg-background-secondary-dark text-foreground-secondary'
                      )}
                      onClick={() => handleLock(project)}
                      title={isLocked ? 'Unlock project' : 'Lock project'}
                    >
                      {isLocked ? 'Locked' : 'Lock'}
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-secondary hover:text-red-500 transition-colors"
                      onClick={() => handleDelete(project.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {project.description && (
                  <p className="text-sm text-foreground-secondary mt-3">{project.description}</p>
                )}

                <div className="mt-4 pt-4 border-t border-glass-border dark:border-glass-border-dark">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-foreground-secondary">
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{project.gitRoot ? 'Git tracked' : 'No git'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground-secondary">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(project.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Create Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  className="input-apple w-full"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., My Awesome App"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Path</label>
                <input
                  type="text"
                  className="input-apple w-full"
                  value={formData.path}
                  onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                  placeholder="/workspace/my-awesome-app (auto-generated if empty)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description (optional)</label>
                <textarea
                  className="input-apple w-full h-20 resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the project..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        'w-8 h-8 rounded-lg transition-all',
                        formData.color === color && 'ring-2 ring-white scale-110'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
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
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
