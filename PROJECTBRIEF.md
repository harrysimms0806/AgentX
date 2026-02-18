# AgentX Terminal — PROJECT BRIEF v2.0
## The Local OpenClaw Communication Terminal + "See What's Going On" Dev Console

---

## 0) Executive Summary (What we're building)

AgentX is a locally-hosted control terminal for OpenClaw agents that combines: multi-agent chat (@mentions), a real terminal (pty), a project-scoped file explorer, and a code editor (Monaco) inside a single workspace — with a visible "Context Pack" so you can always see exactly what the agents were given.

This revised plan merges the original UI/UX spec (glassmorphism macOS-native vibe) with the Master Plan, and adds missing foundations: sandboxing, auth, process supervision, context retrieval budgets, file write locks, and a proper audit trail.

---

## 1) Non-Negotiable Principles (to avoid future refactors)

1. **Everything is project-scoped:** chat history, terminals, agent sessions, context, runbooks, audit, locks.
2. **Safe-by-default:** read-only and no-exec unless explicitly enabled per project or per agent.
3. **No hidden context:** every agent call shows a "Context Pack" preview and what was injected.
4. **One supervisor for all processes:** terminals, agent runs, background jobs must be managed, logged, killable, and restart-safe.
5. **Sandbox filesystem:** AgentX never writes outside a defined root.
6. **UI must feel like a native macOS tool:** clean, glassy, dark, fast.

---

## 2) Scope (What v1 ships / what is deferred)

### v1 (ship this)
- Projects (create/open/switch), stored locally
- Multi-agent chat with @mentions and @all
- Terminal tabs backed by node-pty
- File explorer + Monaco editor (lazy-loaded)
- Git status (cached, on-demand refresh)
- Audit log (append-only)
- Runbook buttons (common commands per project)
- Context Pack (minimal + retrieval-based; visible)
- Process Supervisor (spawn/stream/kill + limits + log rotation)
- File write locks (one writer per file path)

### Deferred (v2+)
- Cloud sync / collaboration
- Remote access beyond localhost
- Full plugin marketplace
- Complex "agent team workflows" UI (kanban, etc.) beyond basic tasks
- Packaging as Tauri/Electron (optional upgrade path)

---

## 3) Architecture (Revised: fewer foot-guns, clearer boundaries)

### Recommended topology (web app + local daemon)

- **AgentX UI**: Next.js (port 3000) — renders UI, holds state, calls daemon.
- **AgentX Daemon**: Node service (port 3001 or unix socket) — the only process allowed to:
  - spawn pty terminals / run commands
  - call OpenClaw (CLI wrapper or adapter)
  - read/write within sandbox root
  - compute git status
  - manage websockets + streaming

UI never touches filesystem directly. Daemon enforces all rules.

### Why this structure
- Prevents Next.js route handlers becoming a "god API"
- Makes process supervision reliable
- Creates a future upgrade path to Tauri/Electron with minimal changes

---

## 4) Security + Safety Model (Must-do foundation)

### 4.1 Local-only access
- Daemon binds to **127.0.0.1 only** (never 0.0.0.0).
- All requests require an **auth token** (generated at UI start, stored in memory).
- Strict CORS allowlist (only UI origin).

### 4.2 Filesystem sandbox
- Define a single sandbox root: `~/BUD BOT/projects/`
- All file operations must:
  - resolve realpath
  - hard-refuse anything outside sandbox
  - denylist: `.ssh`, `.env` outside project, system paths, etc.
- Delete = **soft delete** to a project trash folder first.
- Default mode is **read-only** for agents; explicit toggle required to allow writes.

### 4.3 Capability flags (per project + per agent)
Capabilities are explicit toggles:
- FS_READ, FS_WRITE
- EXEC_SHELL
- NETWORK (optional, default off)
- GIT_WRITE (commit/push)
- OPENCLAW_RUN

### 4.4 Audit log is append-only
Every operation writes an audit record:
- who/what triggered it (user/agent)
- action type
- file paths affected
- command lines run
- timestamps + duration

Audit log is not editable from UI (only exportable).

---

## 5) Process Supervisor (Fixes the "spawn chaos" problem)

A single supervisor manages:
- terminal sessions (pty)
- agent runs (OpenClaw tasks)
- background jobs (git status refresh, indexing)

Supervisor responsibilities:
- assign stable IDs for each run/session
- store minimal state in SQLite (recommended) or JSON store:
  - pid, cwd, env, ownerAgent, startedAt, lastOutputAt, status
- enforce limits:
  - max output buffer per process
  - timeouts per run type
  - kill escalation (SIGTERM then SIGKILL)
- log rotation per process / per project
- restart resilience: on daemon restart, mark sessions "stale" and allow cleanup

---

## 6) Context Engine v1 (Realistic, retrieval-based, visible)

### 6.1 Context Pack (shown in UI)
Every agent call displays a Context Pack panel:
- Project summary (short, 5–10 lines)
- Active task + acceptance criteria
- Open files list
- Recent changes (git diff summary or modified files list)
- Retrieved memory snippets (top N)
- Explicit user-provided attachments/snippets

### 6.2 Budget rules (prevents truncation)
- Hard cap for injected context (configurable, e.g. 12k chars)
- Retrieval chooses the best N snippets to fit budget
- Never inject huge MEMORY.md raw
- Use pointers:
  - "Relevant files: [A.ts, B.ts]"
  - "Retrieved snippets: …"

### 6.3 Memory storage
Store:
- chat messages (per project)
- context packs (per agent call)
- key project docs (PROJECT.md, RULES.md)
- Embedding index optional for v1; can start with keyword + recency scoring, then add embeddings.

---

## 7) Data Models (Revised + complete)

### Project
- id, name, rootPath (within sandbox), createdAt, lastOpenedAt
- settings: capabilities, safeMode, runbooks, preferredAgents
- docs: PROJECT.md, RULES.md (paths or content)

### AgentConfig
- id, name, emoji, adapterType (openclaw-cli), model/profile, capabilities
- status: idle/running/error, lastRunAt

### Message
- id, projectId, agentId?, role (user/agent/system), content, createdAt

### Run (Agent run / command run)
- id, projectId, type (agent|command|git|index), ownerAgentId?, status
- startedAt, endedAt, exitCode, logsPath, summary

### TerminalSession
- id, projectId, cwd, pid, createdAt, lastActiveAt, title

### ContextPack
- id, projectId, runId, createdAt
- injectedSections: summary, files, diffs, memories, userNotes
- sizeChars

### FileLock
- projectId, filePath, lockedBy (user|agentId), lockedAt

### AuditEvent (append-only)
- id, projectId, actorType, actorId?, actionType, payloadJSON, createdAt

---

## 8) API Contract (Daemon endpoints; UI uses these only)

### Auth
- POST /auth/session -> returns session token
- All other endpoints require Authorization: Bearer <token>

### Projects
- GET /projects
- POST /projects (create)
- POST /projects/:id/open
- GET /projects/:id/settings
- PUT /projects/:id/settings

### Filesystem (sandboxed)
- GET /fs/tree?projectId=
- GET /fs/read?path=
- PUT /fs/write (path, content) [requires FS_WRITE + lock]
- POST /fs/rename
- POST /fs/delete (soft delete)
- POST /fs/restore

### Locks
- POST /locks/acquire (path)
- POST /locks/release (path)

### Terminal (pty)
- POST /terminal/create (cwd)
- WS /terminal/stream/:sessionId
- POST /terminal/kill/:sessionId

### Runs / Supervisor
- POST /runs/command (cmd, cwd, env)
- POST /runs/agent (agentId, prompt, contextPackId?)
- GET /runs/:id
- POST /runs/:id/kill

### Git
- GET /git/status?projectId=
- GET /git/diff?projectId=
- POST /git/commit (optional, gated)
- POST /git/push (optional, gated)

### Audit
- GET /audit?projectId=&limit=
- GET /audit/export?projectId=

---

## 9) UI/UX Spec (Merged + tightened for build)

### 9.1 Visual Design System (from Original UI Spec)
- Dark, premium, macOS-native feel (glassmorphism, subtle blur)
- Color palette:
  - background: deep charcoal
  - panels: translucent dark glass
  - accent: single primary accent (configurable)
  - status: green/amber/red for agent health
- Typography:
  - system font (SF-like) with clear hierarchy
- Spacing:
  - consistent grid (8px base)
- Radius:
  - medium rounding across cards/panels (consistent)

### 9.2 Layout (Default Workspace)
Three-column core with optional bottom bar:

1. **Left Sidebar (collapsible):**
   - Project switcher
   - Navigation: Dashboard, Workspace, Audit, Settings
   - Agent list (emoji + status)

2. **Main Center:**
   - Chat panel (top)
   - Context Pack panel (dockable: right side of chat or collapsible drawer)

3. **Right Panel (dockable tabs):**
   - Files
   - Editor
   - Terminal
   - Monitor

**Bottom Status Bar:**
- current project, safe mode, active agent, running processes count, git state

### 9.3 Key Screens

#### A) Dashboard
- Agent Status Cards grid:
  - emoji + name + state
  - last task summary
  - "Run" quick action
- Project cards:
  - open recent / create new
- Activity feed (last 20 audit events)

#### B) Workspace (core)
- Chat with @mentions + @all + slash commands
- Inline "Runbook buttons" above chat (Start dev server / Test / Build / Lint)
- Right dock: File Explorer + Editor + Terminal as tabs
- Monitor panel:
  - active runs list
  - CPU/mem optional
  - streaming logs per run

#### C) Audit Log
- filter by actor (user/agent), action type, date
- click event to see structured payload
- export button

#### D) Settings
- sandbox root (read-only display)
- capabilities toggles per project and per agent
- safe mode default
- OpenClaw adapter settings
- context budgets

### 9.4 Interactions & Micro-Interactions
- Agent status pulses subtly while running
- Toasts for:
  - "Write blocked (no lock)"
  - "Write blocked (safe mode)"
  - "Outside sandbox path refused"
- Drag divider between panels
- Quick search (Cmd+K) for:
  - files, commands, agents, recent runs

### 9.5 Keyboard Shortcuts (v1 set)
- Cmd+K: command palette
- Cmd+P: open file
- Cmd+/: focus chat input
- Cmd+T: new terminal tab
- Cmd+Enter: send chat
- Cmd+Shift+L: toggle file locks panel
- Cmd+Shift+A: open audit log

---

## 10) User Flows (Updated + safer)

### Flow 1: Create Project
User selects folder within sandbox or creates new project folder. AgentX generates:
- PROJECT.md (template)
- RULES.md (template)
- runbooks.json (optional)

Project opens into Workspace with safe mode ON.

### Flow 2: Delegate Task to Agent
User types: "@kimi fix failing tests in /api"

UI builds a Context Pack draft (preview shown). User clicks "Run". Supervisor starts run, streams logs, locks files when applying edits.

### Flow 3: Terminal Coding While Watching Changes
User opens terminal tab; runs dev server. Monitor shows process + logs. Editor shows modified files; git status cached.

### Flow 4: Switch Projects
Switching preserves:
- open tabs
- last terminals (marked stale if not alive)
- chat state per project

---

## 11) Phased Build Plan (Revised with proper order + acceptance criteria)

### Phase 0: Safety + Foundations (Do first, no UI polish yet)
**Deliverables:**
- daemon skeleton + auth token
- sandbox root enforcement + path realpath checks
- audit log writer (append-only)
- supervisor skeleton + run registry

**Acceptance:**
- cannot read/write outside sandbox even with crafted paths
- every endpoint requires token
- commands can be spawned and killed reliably; logs rotate

### Phase 1: UI Shell (from original spec, but functional)
**Deliverables:**
- Next.js app layout: sidebar, top nav, workspace panes, status bar
- Dashboard cards + navigation
- connect to daemon health endpoint

**Acceptance:**
- UI loads and shows projects + agents list + status
- no filesystem writes yet

### Phase 2: Files + Editor (safe read first)
**Deliverables:**
- file tree (ignore node_modules/.git by default)
- file read + Monaco lazy load
- soft delete flow (trash)

**Acceptance:**
- open/edit file in UI, but write blocked unless enabled + locked
- large repos remain responsive

### Phase 3: Terminal + Supervisor Streaming
**Deliverables:**
- node-pty terminal tabs
- WS streaming
- active runs panel + kill buttons

**Acceptance:**
- multiple terminals run without orphan processes
- kill works every time; stale sessions handled after restart

### Phase 4: Multi-Agent Chat + OpenClaw Adapter
**Deliverables:**
- chat with @mentions and @all routing
- OpenClaw CLI adapter wrapper (run + stream output + capture result)
- per-agent capability gating

**Acceptance:**
- agent run is fully logged, killable, and visible in Monitor
- safe mode blocks writes unless explicitly enabled

### Phase 5: Context Pack v1 + Memory Retrieval
**Deliverables:**
- Context Pack panel with preview + injected payload
- retrieval of top N snippets (start with recency/keyword, upgrade to embeddings later)
- context budget enforcement

**Acceptance:**
- no huge injections; context size cap respected
- user can see exactly what was injected for each run

### Phase 6: Git + Runbooks + Polish
**Deliverables:**
- git status cached + on-demand refresh
- diff viewer (summary + file-level)
- runbook buttons per project
- command palette

**Acceptance:**
- "What changed?" is obvious: modified files + diffs + audit trail
- runbooks work and stream output into monitor

---

## 12) Build Guardrails (Rules for your bot)

- Do not implement write endpoints without sandbox enforcement + locks already in place.
- Never allow raw path writes; always resolve against project root.
- All agent edits must: 1) acquire lock 2) write 3) record audit event 4) release lock
- Default safe mode ON for every new project.
- Do not store secrets in chat logs; redact .env-like patterns in audit payloads.

---

## 13) Definition of Done (v1 "ship it" checklist)

- [ ] Local-only daemon with token auth
- [ ] Sandbox enforced + soft delete
- [ ] Supervisor reliable + kill + log rotation
- [ ] Workspace: chat + terminal + files + editor
- [ ] Context Pack visible per run
- [ ] Audit log exportable
- [ ] Looks/feels like the original glassmorphism macOS spec

---

## Build Decisions (LOCKED IN)

### 1) Sandbox root:
- Default sandbox root = `~/BUD BOT/projects/`
- Implement sandbox root as configurable, but do NOT migrate projects automatically.
- Store project.rootPath absolute; validate all FS ops via realpath + must be within sandbox.
- Add soft-delete (trash folder) for deletes.

### 2) Port conflicts:
- Prefer UI:3000, Daemon:3001.
- If taken, choose next free port within small range (3000–3010 UI, 3001–3010 daemon).
- Do NOT silently randomize without surfacing it.
- Write runtime discovery file: `~/.agentx/runtime.json` containing `{ uiPort, daemonPort, startedAt }`.
- UI reads runtime.json to find daemon; UI displays banner if ports differ from defaults.
- (Optional later) add Unix domain socket support.

### 3) Context Pack:
- Must be visible BEFORE sending (preview + budget meter + 1-click confirm).
- Must also be stored AFTER sending with the run record for audit/replay.
- Add per-project toggle: "Auto-send without confirm" (default OFF).

### 4) Monaco editor:
- Use full Monaco editor from v1.
- Enforce safe mode + capabilities + file locks on writes:
  - If safe mode ON -> block writes
  - If FS_WRITE not enabled -> block writes
  - If no lock -> block writes
- UI still allows typing; server rejects write with clear toast reason.

### 5) Start now:
- Begin Phase 0 immediately: daemon skeleton + auth + sandbox + audit + supervisor.
- Deliver Phase 0 as the first working milestone before expanding UI.

**Phase 0 task order:**
1. Daemon boot + /health
2. Auth token handshake (POST /auth/session)
3. Sandbox enforcement utility (resolve path + refuse outside root)
4. Audit log append-only writer
5. Supervisor registry + spawn/kill + log rotation skeleton

---

**Status:** BRIEF LOCKED — Ready for build
**Last Updated:** 2026-02-18
**Version:** 2.0
