import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background dark:bg-background-dark text-foreground dark:text-foreground-dark transition-colors duration-300">
        <Sidebar />
        <main className="ml-[72px] min-h-screen">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<div className="p-10"><h1 className="text-2xl font-bold">Agents</h1><p className="mt-4 text-foreground-secondary">Agent management coming soon...</p></div>} />
            <Route path="/tasks" element={<div className="p-10"><h1 className="text-2xl font-bold">Tasks</h1><p className="mt-4 text-foreground-secondary">Task management coming soon...</p></div>} />
            <Route path="/workflows" element={<div className="p-10"><h1 className="text-2xl font-bold">Workflows</h1><p className="mt-4 text-foreground-secondary">Workflow builder coming soon...</p></div>} />
            <Route path="/projects" element={<div className="p-10"><h1 className="text-2xl font-bold">Projects</h1><p className="mt-4 text-foreground-secondary">Project management coming soon...</p></div>} />
            <Route path="/integrations" element={<div className="p-10"><h1 className="text-2xl font-bold">Integrations</h1><p className="mt-4 text-foreground-secondary">Integrations coming soon...</p></div>} />
            <Route path="/memory" element={<div className="p-10"><h1 className="text-2xl font-bold">Memory</h1><p className="mt-4 text-foreground-secondary">Memory browser coming soon...</p></div>} />
            <Route path="/logs" element={<div className="p-10"><h1 className="text-2xl font-bold">Logs</h1><p className="mt-4 text-foreground-secondary">System logs coming soon...</p></div>} />
            <Route path="/settings" element={<div className="p-10"><h1 className="text-2xl font-bold">Settings</h1><p className="mt-4 text-foreground-secondary">Settings coming soon...</p></div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
