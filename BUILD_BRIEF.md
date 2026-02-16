# AgentX Platform - Build Brief for External Review

**Project:** AgentX - Universal AI Agent Management Platform  
**Builder:** Bud (AI Assistant) for Harry  
**Date:** February 16, 2026  
**Location:** `/Users/bud/BUD BOT/projects/AgentX/`

---

## 1. What Was Built

A full-stack agent management platform with enterprise-grade security:

### Frontend (React + Vite + Tailwind)
- Apple-inspired UI with glass morphism
- Real-time dashboard showing agents, tasks, activity
- Collapsible sidebar navigation
- Dark/light mode support
- Agent cards with emoji avatars

### Backend (Express + SQLite + WebSocket)
- **Config Bridge:** Reads OpenClaw config, normalizes for dashboard
- **Policy Engine:** Enforces access control (read/write/exec/admin)
- **Approval Service:** 2-step workflow (propose → approve → execute)
- **Audit Logger:** Immutable trail of every policy check
- **Workspace Locking:** Prevents root .git issues via folder isolation

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENTX PLATFORM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND (React)              BACKEND (Express)                │
│  ────────────────              ────────────────                 │
│  • Dashboard UI                • Config Bridge                   │
│  • Agent Cards                 • Policy Engine                   │
│  • Real-time WS                • Approval Service                │
│  • Sidebar Nav                 • Audit Logger                    │
│  • Emoji Avatars               • SQLite DB                       │
│                                                                  │
│         │                              │                         │
│         └──────────┬───────────────────┘                         │
│                    │                                             │
│              WebSocket (real-time updates)                       │
│                    │                                             │
│         ┌──────────┴───────────┐                                 │
│         │    AGENT PROTOCOL    │                                 │
│         │  (execution layer)   │                                 │
│         └──────────┬───────────┘                                 │
│                    │                                             │
│    ┌───────────────┼───────────────┐                             │
│    │               │               │                             │
│   Bud 🌱        Codex 🤖       Local 💻                         │
│ (Coordinator)  (Cloud AI)   (Local LLM)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Components

### 3.1 Config Bridge (`services/ConfigBridge.js`)
**Purpose:** Read OpenClaw config as source of truth

**What it does:**
- Watches `openclaw.config.json` for changes (hot reload)
- Transforms to dashboard-friendly schema
- Validates with Zod schemas
- Provides settings pointers for UI navigation
- Redacts secrets before sending to frontend

**Key features:**
- Keeps last known-good config if validation fails
- Calculates config hash for versioning
- Supports overlay file for UI metadata

### 3.2 Policy Engine (`services/PolicyEngine.js`)
**Purpose:** Backend enforcement of permissions

**Security model:**
```javascript
// Default deny - must be explicitly allowed
const policy = {
  allow: ['read'],        // What's permitted
  deny: ['admin'],        // Explicit denials (override allow)
  requiresApproval: ['write'], // Needs human approval
  scopes: {
    folders: ['/projects/jb-rubber'], // Folder restrictions
    repos: ['jb-rubber', 'surveyx']   // Repo restrictions
  },
  budgets: {
    dailyCost: 50,
    maxConcurrent: 2
  }
}
```

**Directional permissions:**
- `read` — list, search, fetch
- `write` — create, update, delete
- `exec` — run commands, git operations
- `admin` — change config, manage agents

**How it works:**
1. Frontend requests action
2. PolicyEngine.check() validates
3. Returns: ALLOW / DENY / REQUIRES_APPROVAL
4. Every check logged to audit trail
5. Backend is single enforcement point

### 3.3 Approval Service (`services/ApprovalService.js`)
**Purpose:** Human-in-the-loop for high-risk actions

**Workflow:**
```
1. Agent proposes action
   → Creates approval request with payload hash
   → Status: PENDING
   → Expires in 30 min (configurable)

2. Human approves/denies
   → POST /approvals/:id/approve
   → Status: APPROVED or DENIED
   → Logged to audit trail

3. Execute (only if approved)
   → POST /approvals/:id/execute
   → Verifies payload hash matches
   → Status: EXECUTED (single-use)
   → Cannot be reused
```

**Safety features:**
- Payload hash prevents tampering after approval
- Single-use approvals (can't replay)
- Expiration prevents stale approvals
- Force-release for emergencies

### 3.4 Audit Logger (`services/AuditLogger.js`)
**Purpose:** Immutable record of all policy decisions

**Logged for every attempt:**
- Agent ID, integration, action type
- Result (allowed/denied/requires_approval)
- Reason code (POLICY_ALLOW, POLICY_DENY_SCOPE, etc.)
- Timestamp, request ID, user ID
- Approval ID (if applicable)
- Duration (performance tracking)

**Storage:**
- SQLite table with indexes
- Batched writes (5-second flush interval)
- Queryable via API with filters

### 3.5 Emoji Avatar System
**Purpose:** Consistent visual identity for agents

**Resolution priority:**
1. Overlay file (dashboard.overlay.json)
2. OpenClaw config (agent.avatar.emoji)
3. Deterministic fallback (hash-based)

**Deterministic fallback:**
```javascript
hash = md5(agentId)
index = hash[0:8] % 16
emoji = fallbackSet[index]  // Same agent = same emoji always
```

**Settings pointers:**
```json
{
  "agentAvatarModePath": "/ui/avatars/mode",
  "agentEmojiPath": "/agents/*/avatar/emoji",
  "fallbackEmojiPath": "/ui/avatars/fallbackSet"
}
```

---

## 4. API Endpoints

### Config & Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Full normalized config |
| GET | `/api/config/health` | Config loaded status |
| GET | `/api/config/ui-settings` | Lightweight UI settings |
| GET | `/api/config/settings-pointers` | Navigation paths |
| POST | `/api/config/reload` | Manual reload (admin) |

### Policy
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/policy/check` | Check if action permitted |
| GET | `/api/policy/agents/:id/capabilities` | Get agent permissions |
| POST | `/api/policy/validate` | Full validation |

### Approvals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/approvals` | List approval requests |
| POST | `/api/approvals` | Create approval request |
| POST | `/api/approvals/:id/approve` | Approve request |
| POST | `/api/approvals/:id/deny` | Deny request |
| POST | `/api/approvals/:id/execute` | Execute approved action |
| GET | `/api/approvals/pending-count` | Dashboard badge count |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit` | Query audit log |
| GET | `/api/audit/summary` | Statistics |
| POST | `/api/audit/export` | Export for compliance |

---

## 5. Configuration Files

### OpenClaw Config (`config/openclaw.example.json`)
Source of truth with security policies:
```json
{
  "agents": [{
    "id": "codex",
    "permissions": {
      "read": true,
      "write": true,
      "exec": false,
      "admin": false,
      "requiresApproval": ["write"],
      "scopes": {
        "folders": ["/projects"]
      }
    }
  }]
}
```

### Overlay File (`config/dashboard.overlay.json`)
UI-only metadata (can't override security):
```json
{
  "agents": {
    "bud": {
      "emoji": "🌱",
      "displayName": "Bud (Coordinator)"
    }
  }
}
```

---

## 6. How It Works (User Flow)

### Scenario: Agent wants to write to filesystem

```
1. Agent (Codex) requests: write file to /projects/jb-rubber

2. Backend receives request
   └── PolicyEngine.check({
         agentId: 'codex',
         integration: 'filesystem',
         actionType: 'write',
         context: { folder: '/projects/jb-rubber' }
       })

3. Policy Engine evaluates:
   ├── Is agent allowed 'write'? → YES
   ├── Is folder in allowed scopes? → YES
   ├── Does action require approval? → YES
   └── Result: REQUIRES_APPROVAL

4. System response:
   └── { allowed: false, requiresApproval: true }

5. Agent creates approval request
   └── POST /api/approvals
   └── User sees notification in dashboard

6. User approves via UI
   └── POST /approvals/:id/approve
   └── Audit log records approval

7. Agent executes with approval ID
   └── POST /approvals/:id/execute
   └── Backend verifies payload hash
   └── Action executes
   └── Audit log records execution

8. If anything fails:
   └── STOP immediately
   └── Log error
   └── Alert user
   └── NEVER auto-retry
```

---

## 7. Current Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion, Zustand |
| Backend | Express.js, WebSocket (ws), SQLite (better-sqlite3) |
| Validation | Zod schemas |
| Build | TypeScript, ES Modules |
| Styling | Apple-inspired design system |

---

## 8. Known Limitations / Areas for Improvement

### Current Gaps
1. **No authentication system** — Uses simple token middleware, needs proper auth
2. **No encryption at rest** — Secrets in SQLite are plaintext
3. **Single-node architecture** — No horizontal scaling
4. **No rate limiting** — API endpoints unprotected from abuse
5. **Basic WebSocket auth** — No session validation on WS connections

### Security Enhancements Needed
1. **Signed config** — Config changes should require cryptographic signature
2. **Secret management** — Integration with macOS Keychain or similar
3. **Network isolation** — Agent processes should run in sandboxed environment
4. **Command whitelist validation** — Shell command validation is regex-based, should be stricter
5. **Audit log tamper protection** — Hash chain or append-only log

### Scalability Concerns
1. **SQLite limitations** — Will bottleneck with high concurrency
2. **In-memory state** — ConfigBridge holds state in memory, not shared across instances
3. **No message queue** — Tasks processed synchronously

### UX Improvements
1. **Approval notifications** — No push/email notifications for pending approvals
2. **Real-time agent logs** — WebSocket streams logs but no persistence for replay
3. **Mobile responsiveness** — Dashboard desktop-first, needs mobile optimization
4. **Agent discovery** — New agents must be manually added to config

---

## 9. Questions for Reviewer

1. **Security:** Is the default-deny + explicit-allow model sufficient? Should we add role-based access control (RBAC) on top?

2. **Policy enforcement:** Should the Policy Engine be extracted to a separate service (sidecar pattern) for defense in depth?

3. **Approval workflow:** Is 30-minute expiration appropriate? Should approvals be time-based or session-based?

4. **Audit logging:** Should we support export to external SIEM (Splunk, ELK)? Is SQLite sufficient for compliance?

5. **Config management:** Should we support config versioning (Git-backed) with rollback capability?

6. **Agent isolation:** Should agents run in separate processes with IPC, or is the current shared-memory model acceptable?

7. **Emoji system:** Should we support custom SVG icons uploaded by users, or stick to emoji/initials only?

---

## 10. Files Structure

```
AgentX/
├── frontend/
│   ├── src/
│   │   ├── components/     # AgentCard, Sidebar, etc.
│   │   ├── pages/          # Dashboard
│   │   ├── stores/         # Zustand state
│   │   └── styles/         # Tailwind + globals
│   └── package.json
├── backend/
│   ├── services/           # ConfigBridge, PolicyEngine, etc.
│   ├── routes/             # API endpoints
│   ├── middleware/         # Auth, policy enforcement
│   ├── models/             # Database schema
│   └── server.js
├── shared/
│   └── types/              # TypeScript interfaces
├── config/
│   ├── openclaw.example.json
│   └── dashboard.overlay.json
├── docs/
│   ├── CONFIG_BRIDGE.md
│   └── EMOJI_AVATARS.md
└── package.json
```

---

## 11. How to Run

```bash
cd "/Users/bud/BUD BOT/projects/AgentX"

# Install dependencies
npm run setup

# Initialize database
npm run db:init

# Start development
npm run dev

# Access:
# - Dashboard: http://localhost:5173
# - API: http://localhost:3001
# - WebSocket: ws://localhost:3001/ws
```

---

**Request:** Please review this architecture and suggest improvements, security enhancements, or missing features. Focus on:
1. Security posture (is default-deny sufficient?)
2. Scalability (will SQLite bottleneck?)
3. UX (what's missing from the approval workflow?)
4. Code organization (should components be structured differently?)

Built by Bud 🌱 for Harry's AI workforce management.
