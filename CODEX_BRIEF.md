# 📝 Codex Brief: Fix AgentX Platform

**Repository:** https://github.com/harrysimms0806/AgentX  
**Local Path:** `/Users/bud/BUD BOT/projects/AgentX/`  
**Branch:** `main`

---

## 1. WHAT AGENTX IS

**AgentX** is a universal AI agent management platform — "Mission Control" for AI agents. Native macOS app (Electron) that lets Harry:

- **See all agents** as live entities (Bud, Codex, Local LLMs)
- **Manage tasks** across different projects
- **Build workflows** — drag-and-drop automation chains
- **Monitor everything** in real-time (logs, costs, status)
- **Lock context** — prevent agents from working in wrong folders

---

## 2. CURRENT STATE

**✅ Working:**
- App launches in native Electron window
- Backend API starts (port 3001)
- Frontend loads (port 5173)
- Database initializes with default agents
- Sidebar renders with icons
- Dashboard shows basic layout

**❌ Broken:**
- **Pulsing animation** — All icons flash constantly (CSS issue)
- **Navigation broken** — Sidebar clicks don't change pages
- **Buttons don't work** — "New Task", "New Project" do nothing
- **Dashboard empty** — No real data, just placeholders
- **WebSocket not connected** — No real-time updates
- **Context locking UI** — Shows "Project Locked" but not functional

---

## 3. HOW IT SHOULD WORK

### Navigation
```
Sidebar Click → React Router navigation → Page component renders
Dashboard  → Show active agents, tasks, quick stats
Agents     → List all agents, add/edit/remove
Tasks      → Task queue, create new task, assign to agent
Workflows  → Visual builder (nodes/edges)
Projects   → Project list, context lock controls
Settings   → Config, API keys, preferences
```

### Dashboard Components
- **Header:** Title, search, notifications, user avatar
- **Quick Stats:** Active agents, pending tasks, recent activity
- **Active Agents Grid:** Live agent cards with status, current task, cost
- **Recent Tasks:** Task list with status, agent, project
- **Quick Actions:** "New Task", "New Project", "Run Workflow"

### Agent Cards
- Avatar + Name + Status indicator (online/busy/offline)
- Current task description
- Cost/time metrics
- Action buttons (pause, stop, view logs)

### Task Creation
- Modal/form with:
  - Task description
  - Agent selection (dropdown)
  - Project context (folder selector)
  - Priority slider
  - Submit → adds to task queue

---

## 4. SPECIFIC FIXES NEEDED

### A. Stop the Pulsing
**File:** `frontend/src/components/Sidebar.tsx`
- Remove `animate-pulse` from project indicator div
- Check for any other animation loops in Framer Motion

### B. Fix Navigation
**Files:** `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx`
- Sidebar items must use `useNavigate()` from react-router-dom
- Add `path` to each sidebar item
- Main content needs `ml-[72px]` (or dynamic) margin
- Active state should come from `useLocation()`, not local state

### C. Fix Dashboard
**File:** `frontend/src/pages/Dashboard.tsx`
- Currently empty/mocked — wire up to real backend
- Fetch from `/api/agents`, `/api/tasks`, `/api/stats`
- Display real agent cards with live status
- Show actual task list from database

### D. Make Buttons Work
**Files:** Various
- "New Task" → Open modal (create TaskModal component)
- "New Project" → Open project creation modal
- "Create Agent" → Navigate to /agents with add mode
- All buttons need actual onClick handlers

### E. Connect WebSocket
**File:** `frontend/src/hooks/useWebSocket.ts`
- Should connect to `ws://localhost:3001/ws`
- Handle real-time updates (agent status, new tasks, logs)
- Update Zustand store with incoming data

### F. Fix Context Locking
**File:** `frontend/src/stores/appStore.ts`
- `activeProject` should store full project object
- Lock/unlock should validate folder exists
- UI should show actual locked folder path

---

## 5. TECH STACK

- **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion, Zustand, React Router
- **Backend:** Express, SQLite (better-sqlite3), WebSocket (ws)
- **State:** Zustand for global state
- **Styling:** Custom design system with glass-morphism

---

## 6. KEY FILES TO MODIFY

```
frontend/src/
├── App.tsx                    # Fix routing + layout
├── components/
│   ├── Sidebar.tsx            # Fix navigation
│   ├── SidebarItem.tsx        # Add navigation support
│   ├── AgentCard.tsx          # Real data + actions
│   ├── TaskCard.tsx           # New component
│   └── TaskModal.tsx          # New component
├── pages/
│   ├── Dashboard.tsx          # Real data, working buttons
│   ├── Agents.tsx             # Agent management
│   ├── Tasks.tsx              # Task queue
│   └── Workflows.tsx          # Visual builder
├── hooks/
│   └── useWebSocket.ts        # Connect to backend
└── stores/
    └── appStore.ts            # Fix state management

backend/
├── server.js                  # Ensure all routes work
├── routes/
│   ├── agents.js              # CRUD agents
│   ├── tasks.js               # Task queue
│   └── projects.js            # Project management
└── services/
    └── TaskQueue.js           # Task execution
```

---

## 7. ACCEPTANCE CRITERIA

- [ ] No pulsing/flashing animations
- [ ] Sidebar navigation changes pages correctly
- [ ] Dashboard shows real agents from database
- [ ] "New Task" button opens working modal
- [ ] Tasks appear in task queue after creation
- [ ] Agent status updates in real-time (WebSocket)
- [ ] All pages have proper content (not "coming soon")
- [ ] Responsive layout (sidebar collapses, content adjusts)

---

## 8. STARTING POINT

The app launches and runs. Backend is healthy at `http://localhost:3001/api/health`. Database has default agents. Frontend loads but needs proper wiring.

**First step:** Run `npm run electron:dev` and observe current behavior. Then fix systematically starting with navigation.

---

## 9. RUNNING THE APP

```bash
# Development mode (fastest for fixing)
cd /Users/bud/BUD BOT/projects/AgentX
npm run electron:dev

# Or run separately
npm run server    # Terminal 1 - Backend
npm run dev       # Terminal 2 - Frontend
```

---

**Ready to start. Good luck!**
