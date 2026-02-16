# AgentX

**Universal AI Agent Management Platform**

A premium, Apple-inspired command center for orchestrating multiple AI agents across all your projects.

## Features

- 🎛️ **Visual Command Centre** — Digital office where agents appear as live entities
- 🤖 **Multi-Agent Support** — Bud (coordinator), Codex (builder), Local agents (future)
- 🔒 **Context Locking** — Prevents root .git issues via workspace isolation
- 📊 **Real-time Monitoring** — Status, logs, costs, performance metrics
- 🔄 **Workflow Builder** — Visual drag-and-drop automation
- 🔌 **Integrations Hub** — Connect Codex, OpenAI, local LLMs
- 🌓 **Light/Dark Mode** — Premium aesthetic from day one

## Architecture

```
AgentX/
├── frontend/          # React + Vite + Tailwind + Framer Motion
├── backend/           # Express API + WebSocket for real-time
├── database/          # SQLite (task queue, agent registry, locks)
├── agents/            # Agent protocol implementations
├── shared/            # Types and constants
└── docs/              # Design system, wireframes
```

## Quick Start

```bash
# Install dependencies
npm install

# Start backend
npm run server

# Start frontend (new terminal)
npm run dev

# Open http://localhost:5173
```

## Project Context Locking

The key innovation: Every task is locked to a specific workspace folder.

```
Task: "Fix JB RUBBER sidebar"
├── Workspace: projects/JB RUBBER/app/
├── Git Root: projects/JB RUBBER/app/.git/
├── Agent: Codex
└── Status: 🟡 In Progress (locked)
```

No agent can touch files outside the locked folder without explicit unlock.

## License
Private — For Harry's personal use.
