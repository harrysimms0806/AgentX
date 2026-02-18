'use client';

interface ProjectSwitcherProps {
  collapsed?: boolean;
}

export default function ProjectSwitcher({ collapsed }: ProjectSwitcherProps) {
  return (
    <div className="project-switcher">
      {!collapsed && (>
        <>
          <div className="section-title">Projects</div>
          <button className="project-btn">
            <span className="project-icon">+</span>
            <span>New Project</span>
          </button>
        </>
      )}
      
      <style jsx>{`
        .project-switcher {
          padding: var(--space-md);
          border-bottom: 1px solid var(--border);
        }
        
        .section-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
          margin-bottom: var(--space-sm);
        }
        
        .project-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm);
          background: transparent;
          border: 1px dashed var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .project-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        
        .project-icon {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
