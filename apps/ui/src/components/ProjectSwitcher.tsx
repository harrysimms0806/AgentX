'use client';

interface ProjectSwitcherProps {
  collapsed?: boolean;
}

export default function ProjectSwitcher({ collapsed }: ProjectSwitcherProps) {
  if (collapsed) return null;

  return (
    <div className="project-switcher">
      <div className="section-title">PROJECTS</div>
      <button className="project-btn">+ New Project</button>
      <style jsx>{`
        .project-switcher { padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
        .section-title { font-size: 13px; font-weight: 500; color: var(--text-tertiary); margin-bottom: 8px; }
        .project-btn {
          width: 100%; height: 32px; background: var(--bg-tertiary); border: none; border-radius: 8px;
          color: var(--text-secondary); text-align: left; padding: 0 10px; cursor: pointer;
        }
        .project-btn:hover { background: rgba(255, 255, 255, 0.08); }
      `}</style>
    </div>
  );
}
