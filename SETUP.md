# AgentX Setup Instructions

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/bud/BUD BOT/projects/AgentX
npm run setup
```

This installs:
- Root dependencies (concurrently)
- Frontend dependencies (React, Tailwind, Framer Motion)
- Backend dependencies (Express, SQLite, WebSocket)

### 2. Initialize Database

```bash
npm run db:init
```

Creates `database/agentx.db` with:
- Projects table
- Agents table (pre-populated with Bud, Codex, Local)
- Tasks table
- Workspace locks table
- Integrations table
- Workflows table

### 3. Configure Environment

Create `.env` in `backend/`:

```env
PORT=3001
OPENAI_API_KEY=your_key_here
NODE_ENV=development
```

### 4. Start Development

```bash
npm run dev
```

This starts:
- Backend API on http://localhost:3001
- Frontend on http://localhost:5173
- WebSocket for real-time updates

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENTX PLATFORM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      HTTP/WS      ┌──────────────────┐       │
│  │   FRONTEND   │ ◄────────────────► │     BACKEND      │       │
│  │   React      │                    │   Express        │       │
│  │   Tailwind   │                    │   SQLite         │       │
│  │   Framer     │                    │   WebSocket      │       │
│  └──────────────┘                    └────────┬─────────┘       │
│         │                                      │                │
│         │         ┌────────────────────────────┘                │
│         │         │                                             │
│         │    ┌────▼────┐    ┌──────────┐    ┌──────────┐       │
│         │    │  BUD    │    │  CODEX   │    │  LOCAL   │       │
│         │    │  🌱     │    │  🤖      │    │  💻      │       │
│         │    └─────────┘    └────┬─────┘    └──────────┘       │
│         │                        │                             │
│         └────────────────────────┘                             │
│                    Agent Protocol                               │
│              (Failure handling, locks, logs)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Context Locking
Prevents the root .git issue:
```
Task assigned → Workspace locked to specific folder
Agent can only touch files in that folder
Git operations use verified git root
No accidental cross-project contamination
```

### 2. Failure Handling
```
Agent encounters error
→ STOP immediately
→ Log failure
→ Broadcast to dashboard
→ Set agent status to ERROR
→ WAIT for user direction
→ NEVER auto-retry
```

### 3. Real-time Updates
WebSocket broadcasts:
- Agent status changes
- Task progress
- New logs
- Workspace locks/unlocks

### 4. Multi-Project Support
- Switch between projects via sidebar
- Each project has isolated workspace
- Tasks are project-scoped
- Locks prevent concurrent access

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List all agents |
| `/api/agents/:id/status` | PATCH | Update agent status |
| `/api/tasks` | GET/POST | List/create tasks |
| `/api/tasks/:id/status` | PATCH | Update task status |
| `/api/projects` | GET/POST | List/create projects |
| `/api/locks` | GET/POST | Manage workspace locks |
| `/api/integrations` | GET/POST | Manage integrations |
| `/ws` | WebSocket | Real-time updates |

## CLI Usage

```bash
# Run Codex on current directory
node agents/codex/cli.js --agent codex --task "Fix sidebar" --prompt "Make the sidebar blue"

# Run with specific project
node agents/codex/cli.js --agent codex --task "JB RUBBER migration" --project "/Users/bud/BUD BOT/projects/JB RUBBER/app"
```

## Next Steps

1. **Connect your OpenAI API key** in `.env`
2. **Install Codex CLI**: `npm install -g @openai/codex`
3. **Test the dashboard**: Open http://localhost:5173
4. **Create first project**: Use the Projects page
5. **Assign task to Codex**: Watch the failure handling in action

## Troubleshooting

**Port already in use:**
```bash
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

**Database locked:**
```bash
rm database/agentx.db database/agentx.db-shm database/agentx.db-wal
npm run db:init
```

**Codex not found:**
```bash
npm install -g @openai/codex
# Or use npx
npx @openai/codex --version
```

## Design System

- **Colors**: Apple-inspired neutrals with blue accent
- **Typography**: System fonts (SF Pro, -apple-system)
- **Spacing**: 4px base grid
- **Radius**: 12px-24px for cards
- **Shadows**: Subtle depth (Apple-style)
- **Animations**: Smooth, purposeful (Framer Motion)

---

Built by Bud 🌱 for Harry's AI workforce management.
