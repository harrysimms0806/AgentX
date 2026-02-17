import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Tasks } from './pages/Tasks';
import { Workflows } from './pages/Workflows';
import { Projects } from './pages/Projects';
import { useAppStore } from './stores/appStore';

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-foreground-secondary">{description}</p>
    </div>
  );
}

function AppLayout() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark text-foreground dark:text-foreground-dark transition-colors duration-300">
      <Sidebar />
      <main className="min-h-screen transition-all duration-300" style={{ marginLeft: sidebarCollapsed ? 72 : 240 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/integrations" element={<PlaceholderPage title="Integrations" description="Manage API providers and external services." />} />
          <Route path="/memory" element={<PlaceholderPage title="Memory" description="Inspect memory snapshots, embeddings, and retrieval quality." />} />
          <Route path="/logs" element={<PlaceholderPage title="Logs" description="Live execution and system logs." />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" description="Configure preferences, credentials, and defaults." />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}

export default App;
