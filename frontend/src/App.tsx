import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/Toast';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Tasks } from './pages/Tasks';
import { Workflows } from './pages/Workflows';
import { Projects } from './pages/Projects';
import { Integrations } from './pages/Integrations';
import { Memory } from './pages/Memory';
import { Logs } from './pages/Logs';
import { Analytics } from './pages/Analytics';
import { SettingsPage } from './pages/Settings';
import { useAppStore } from './stores/appStore';
import { getAgents, getProjects, getTasks } from './utils/api';

function AppContent() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  
  const { 
    sidebarCollapsed, 
    theme,
    setAgents, 
    setTasks, 
    setProjects 
  } = useAppStore();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [agentsData, tasksData, projectsData] = await Promise.all([
          getAgents(),
          getTasks(),
          getProjects(),
        ]);
        setAgents(agentsData);
        setTasks(tasksData);
        setProjects(projectsData);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };

    loadData();
  }, []);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Keyboard shortcut for command palette only
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-foreground dark:text-foreground-dark">
      <Sidebar />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <ToastContainer />
      <main 
        className="min-h-screen transition-all duration-300" 
        style={{ marginLeft: sidebarCollapsed ? 72 : 240 }}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
