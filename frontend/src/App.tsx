import { useEffect, useState, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer, KeyboardShortcutsHelp } from './components/Toast';
import { OnboardingTour } from './components/OnboardingTour';
import { NotificationCenter } from './components/NotificationCenter';
import { QuickActions } from './components/QuickActions';
import { RecentFavorites } from './components/RecentFavorites';
import { ContextualHelpWidget } from './components/ContextualHelpWidget';
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
import { useRecentStore } from './stores/recentStore';
import { useKeyboardShortcuts, useSystemTheme, getSystemTheme, type KeySequence } from './hooks/useKeyboardShortcuts';
import { getAgents, getProjects, getTasks } from './utils/api';

function AppContent() {
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Use individual selectors to avoid unnecessary re-renders
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  // Use stable store references for setters (not from hook destructuring)
  const setAgents = useAppStore.getState().setAgents;
  const setTasks = useAppStore.getState().setTasks;
  const setProjects = useAppStore.getState().setProjects;

  // Stable panel toggle callbacks (use getState to avoid subscribing)
  const toggleNotificationPanel = useCallback(() => {
    useNotificationStore.getState().togglePanel();
  }, []);

  const toggleRecentPanel = useCallback(() => {
    useRecentStore.getState().togglePanel();
  }, []);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply theme (including system theme changes)
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      const isDark = theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark');
      root.classList.toggle('dark', isDark);
    };

    applyTheme();

    // Listen for system theme changes when set to 'system'
    const handleSystemThemeChange = () => {
      if (useAppStore.getState().theme === 'system') {
        applyTheme();
      }
    };

    window.addEventListener('system-theme-change', handleSystemThemeChange);
    return () => window.removeEventListener('system-theme-change', handleSystemThemeChange);
  }, [theme]);

  // Initialize system theme detection
  useSystemTheme();

  // Toggle command palette
  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev);
  }, []);

  // Toggle theme between light/dark/system
  const toggleTheme = useCallback(() => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const current = useAppStore.getState().theme;
    const currentIndex = themes.indexOf(current);
    setTheme(themes[(currentIndex + 1) % themes.length]);
  }, [setTheme]);

  // Refresh data
  const refreshData = useCallback(async () => {
    try {
      const [agentsData, tasksData, projectsData] = await Promise.all([
        getAgents(),
        getTasks(),
        getProjects(),
      ]);
      useAppStore.getState().setAgents(agentsData);
      useAppStore.getState().setTasks(tasksData);
      useAppStore.getState().setProjects(projectsData);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  }, []);

  // Handle navigation sequences (G + key)
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
    if (route) {
      navigate(route);
    }
  }, [navigate]);

  // Stable keyboard shortcuts (memoized to prevent re-creating on every render)
  const shortcuts = useMemo(() => [
    { id: 'command-palette', keys: ['Meta', 'k'], handler: toggleCommandPalette, preventWhenTyping: true },
    { id: 'command-palette-ctrl', keys: ['Control', 'k'], handler: toggleCommandPalette, preventWhenTyping: true },
    { id: 'toggle-theme', keys: ['Meta', 'Shift', 'l'], handler: toggleTheme, preventWhenTyping: true },
    { id: 'toggle-theme-ctrl', keys: ['Control', 'Shift', 'l'], handler: toggleTheme, preventWhenTyping: true },
    { id: 'refresh', keys: ['Meta', 'r'], handler: refreshData, preventWhenTyping: true },
    { id: 'refresh-ctrl', keys: ['Control', 'r'], handler: refreshData, preventWhenTyping: true },
    { id: 'notifications', keys: ['Meta', 'Shift', 'n'], handler: toggleNotificationPanel, preventWhenTyping: true },
    { id: 'notifications-ctrl', keys: ['Control', 'Shift', 'n'], handler: toggleNotificationPanel, preventWhenTyping: true },
    { id: 'recent-favorites', keys: ['Meta', 'Shift', 'r'], handler: toggleRecentPanel, preventWhenTyping: true },
    { id: 'recent-favorites-ctrl', keys: ['Control', 'Shift', 'r'], handler: toggleRecentPanel, preventWhenTyping: true },
  ], [toggleCommandPalette, toggleTheme, refreshData, toggleNotificationPanel, toggleRecentPanel]);

  // Stable navigation sequences
  const navigationSequences: KeySequence[] = useMemo(() => [
    { firstKey: 'g', secondKey: 'd' },
    { firstKey: 'g', secondKey: 'a' },
    { firstKey: 'g', secondKey: 't' },
    { firstKey: 'g', secondKey: 'w' },
    { firstKey: 'g', secondKey: 'p' },
    { firstKey: 'g', secondKey: 'i' },
    { firstKey: 'g', secondKey: 'm' },
    { firstKey: 'g', secondKey: 'l' },
    { firstKey: 'g', secondKey: 's' },
  ], []);

  // Initialize keyboard shortcuts with stable references
  useKeyboardShortcuts({
    shortcuts,
    sequences: navigationSequences,
    onSequence: handleSequence,
  });

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-foreground dark:text-foreground-dark transition-colors duration-300">
      <OnboardingTour />
      <Sidebar />
      <NotificationCenter />
      <QuickActions />
      <RecentFavorites />
      <ContextualHelpWidget />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <ToastContainer />
      <KeyboardShortcutsHelp />
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
