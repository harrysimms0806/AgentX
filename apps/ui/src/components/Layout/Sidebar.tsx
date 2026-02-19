'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProjectSwitcher from '@/components/ProjectSwitcher';
import AgentList from '@/components/AgentList';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/workspace', label: 'Workspace' },
  { path: '/workflows', label: 'Workflows' },
  { path: '/audit', label: 'Audit' },
  { path: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <span className="logo-text">AgentX</span>}
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '→' : '←'}</button>
      </div>

      <ProjectSwitcher collapsed={collapsed} />

      <nav className="nav">
        {navItems.map((item) => (
          <Link key={item.path} href={item.path} className={`nav-item ${pathname === item.path ? 'active' : ''}`}>
            {!collapsed && <span className="nav-label">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <AgentList collapsed={collapsed} />

      <style jsx>{`
        .sidebar {
          width: 240px; height: 100vh; position: fixed; left: 0; top: 0;
          background: var(--bg-glass); backdrop-filter: blur(16px); border-right: 1px solid rgba(255, 255, 255, 0.08);
          display: flex; flex-direction: column; transition: width var(--transition-normal);
        }
        .sidebar.collapsed { width: 72px; }
        .sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); min-height: 48px; }
        .logo-text { font-size: 15px; font-weight: 600; }
        .collapse-btn { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; }
        .nav { padding: 12px; display: flex; flex-direction: column; gap: 4px; }
        .nav-item { height: 32px; border-radius: 8px; display: flex; align-items: center; padding: 0 10px; text-decoration: none; color: var(--text-secondary); transition: background var(--transition-fast); }
        .nav-item:hover, .nav-item.active { background: rgba(255, 255, 255, 0.08); color: var(--text-primary); }
      `}</style>
    </aside>
  );
}
