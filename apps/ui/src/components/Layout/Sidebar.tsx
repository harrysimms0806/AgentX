'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProjectSwitcher from '@/components/ProjectSwitcher';
import AgentList from '@/components/AgentList';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '◆' },
  { path: '/workspace', label: 'Workspace', icon: '◇' },
  { path: '/audit', label: 'Audit', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">◈</span>
          {!collapsed && <span className="logo-text">AgentX</span>}
        </div>
        <button 
          className="collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      <ProjectSwitcher collapsed={collapsed} />

      <nav className="nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`nav-item ${pathname === item.path ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {!collapsed && <span className="nav-label">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <AgentList collapsed={collapsed} />

      <style jsx>{`
        .sidebar {
          width: 240px;
          height: 100vh;
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          border-right: 1px solid var(--glass-border);
          display: flex;
          flex-direction: column;
          transition: width 0.2s ease;
        }
        
        .sidebar.collapsed {
          width: 64px;
        }
        
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md);
          border-bottom: 1px solid var(--border);
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        
        .logo-icon {
          font-size: 24px;
          color: var(--accent);
        }
        
        .logo-text {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.5px;
        }
        
        .collapse-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: var(--space-xs);
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
        }
        
        .collapse-btn:hover {
          background: var(--accent-muted);
          color: var(--accent);
        }
        
        .nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
          padding: var(--space-md);
        }
        
        .nav-item {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.15s ease;
        }
        
        .nav-item:hover {
          background: var(--accent-muted);
          color: var(--text-primary);
        }
        
        .nav-item.active {
          background: var(--accent-muted);
          color: var(--accent);
        }
        
        .nav-icon {
          font-size: 16px;
          width: 24px;
          text-align: center;
        }
      `}</style>
    </aside>
  );
}
