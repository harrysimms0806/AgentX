import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer, KeyboardShortcutsHelp } from './components/Toast';
import { OnboardingTour } from './components/OnboardingTour';
import { NotificationCenter } from './components/NotificationCenter';
import { QuickActions } from './components/QuickActions';
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
import { useNotificationStore } from './stores/notificationStore';
import { useKeyboardShortcuts, useSystemTheme, getSystemTheme, type KeySequence } from './hooks/useKeyboardShortcuts';
import { getAgents, getProjects, getTasks } from './utils/api';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { togglePanel: toggleNotificationPanel } = useNotificationStore();
  
  const { 
    sidebarCollapsed, 
    theme, 
    setTheme, 
    setAgents, 
    setTasks, 
    setProjects 
  } = useAppStore();

  // Refresh data function
  const refreshData = useCallback(async () => {
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
      console.error('Failed to refresh data:', err);
    }
  }, [setAgents, setTasks, setProjects]);

  // Navigation sequences (G + key)
  const navigationSequences: KeySequence[] = [
    { firstKey: 'g', secondKey: 'd' },
    { firstKey: 'g', secondKey: 'a' },
    { firstKey: 'g', secondKey: 't' },
    { firstKey: 'g', secondKey: 'w' },
    { firstKey: 'g', secondKey: 'p' },
    { firstKey: 'g', secondKey: 'i' },
    { firstKey: 'g', secondKey: 'm' },
    { firstKey: 'g', secondKey: 'l' },
    { firstKey: 'g', secondKey: 's' },
  ];

  // Handle navigation sequences
  const handleSequence = useCallback((firstKey: string, secondKey: string) => {
    if (firstKey !== 'g') return;
    
    const routes: Record<string, string> = {
      d: '/',
      a: '/agents',
      t: '/tasks',
      w: '/workflows',
      p: '/projects',
      i: '/integrations',
      m: '/memory',
      l: '/logs',
      s: '/settings',
    };

    const route = routes[secondKey];
    if (route && location.pathname !== route) {
      navigate(route);
    }
  }, [navigate, location.pathname]);

  // Toggle command palette
  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev);
  }, []);

  // Toggle theme between light/dark/system
  const toggleTheme = useCallback(() => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
  }, [theme, setTheme]);

  // Keyboard shortcuts configuration
  const shortcuts = [
    // Command Palette
    { id: 'command-palette', keys: ['Meta', 'k'], handler: toggleCommandPalette, preventWhenTyping: true },
    { id: 'command-palette-ctrl', keys: ['Control', 'k'], handler: toggleCommandPalette, preventWhenTyping: true },
    
    // Theme Toggle
    { id: 'toggle-theme', keys: ['Meta', 'Shift', 'l'], handler: toggleTheme, preventWhenTyping: true },
    { id: 'toggle-theme-ctrl', keys: ['Control', 'Shift', 'l'], handler: toggleTheme, preventWhenTyping: true },
    
    // Refresh Data
    { id: 'refresh', keys: ['Meta', 'r'], handler: refreshData, preventWhenTyping: true },
    { id: 'refresh-ctrl', keys: ['Control', 'r'], handler: refreshData, preventWhenTyping: true },
    
    // Notification Panel
    { id: 'notifications', keys: ['Meta', 'Shift', 'n'], handler: toggleNotificationPanel, preventWhenTyping: true },
    { id: 'notifications-ctrl', keys: ['Control', 'Shift', 'n'], handler: toggleNotificationPanel, preventWhenTyping: true },
  ];

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts,
    sequences: navigationSequences,
    onSequence: handleSequence,
  });

  // Initialize system theme detection
  useSystemTheme();

  // Apply system theme when theme is set to 'system'
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      
      if (theme === 'system') {
        const systemTheme = getSystemTheme();
        if (systemTheme === 'dark') {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      } else if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    // Listen for system theme changes
    const handleSystemThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ isDark: boolean }>;
      if (theme === 'system') {
        const root = document.documentElement;
        if (customEvent.detail.isDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    window.addEventListener('system-theme-change', handleSystemThemeChange);
    return () => window.removeEventListener('system-theme-change', handleSystemThemeChange);
  }, [theme]);

  // Apply initial theme on mount
  useEffect(() => {
    const root = document.documentElement;
    const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
    
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []); // Run once on mount

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-foreground dark:text-foreground-dark transition-colors duration-300">
      <OnboardingTour />
      <Sidebar />
      <NotificationCenter />
      <QuickActions />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <ToastContainer />
      <KeyboardShortcutsHelp />
      <main className="min-h-screen transition-all duration-300" style={{ marginLeft: sidebarCollapsed ? 72 : 240 }}>
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
