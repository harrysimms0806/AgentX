# AgentX Config Bridge + Policy Engine

## Overview

This backend system provides a secure bridge between OpenClaw's configuration and the AgentX Dashboard, with strict policy enforcement.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONFIG BRIDGE + POLICY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐      Transform      ┌─────────────────┐   │
│  │  OpenClaw       │ ───────────────────► │  Dashboard      │   │
│  │  Config         │      + Validate     │  Config Schema  │   │
│  │  (Source of     │                     │  (Normalized)   │   │
│  │   Truth)        │                     │                 │   │
│  └─────────────────┘                     └─────────────────┘   │
│         │                                          │             │
│         │ Watch (hot reload)                       │ API         │
│         ▼                                          ▼             │
│  ┌─────────────────┐                     ┌─────────────────┐   │
│  │  File System    │                     │  Frontend       │   │
│  │  (JSON files)   │                     │  (Dashboard UI) │   │
│  └─────────────────┘                     └─────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     POLICY ENFORCEMENT                           │
│                                                                  │
│  Every Action → Policy Check → [Allow / Deny / Require Approval] │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   READ       │    │   WRITE      │    │    EXEC      │      │
│  │  (list/fetch)│    │ (create/upd) │    │  (commands)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │                │
│         └───────────────────┴───────────────────┘                │
│                             │                                    │
│                             ▼                                    │
│                    ┌─────────────────┐                          │
│                    │  Policy Engine  │                          │
│                    │  (Backend Only) │                          │
│                    └─────────────────┘                          │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              ▼              ▼              ▼                    │
│           Allow          Deny       Requires                    │
│              │              │       Approval                    │
│              ▼              ▼              ▼                    │
│          Execute       403 Error    Create Request              │
│         + Audit          + Audit    Wait for Human              │
│                                                        Approval │
└─────────────────────────────────────────────────────────────────┘
```

## Files

### Core Services

| File | Purpose |
|------|---------|
| `services/ConfigBridge.js` | Ingests OpenClaw config, validates, transforms to dashboard schema |
| `services/PolicyEngine.js` | Enforces access control (read/write/exec/admin) |
| `services/ApprovalService.js` | Manages 2-step approval workflow |
| `services/AuditLogger.js` | Records every policy check attempt |

### Routes

| Endpoint | Purpose |
|----------|---------|
| `GET /api/config` | Normalized dashboard config |
| `GET /api/config/health` | Config loading status + validation |
| `POST /api/policy/check` | Check if action is permitted |
| `POST /api/policy/validate` | Full validation before execution |
| `GET/POST /api/approvals` | Approval workflow |
| `GET /api/audit` | Audit log queries |

## Security Model

### Default Deny

```javascript
// If permission is not explicitly granted → DENY
const policy = {
  allow: ['read'],      // Only read allowed
  deny: [],             // Nothing explicitly denied
  requiresApproval: [], // Nothing requires approval
};

// This agent CANNOT write, exec, or admin
// Even if the UI shows a write button, backend will 403
```

### Directional Permissions

| Capability | Description | Example |
|------------|-------------|---------|
| `read` | List, search, fetch | View files, read config |
| `write` | Create, update, delete | Modify code, update tasks |
| `exec` | Run commands | Git operations, shell commands |
| `admin` | Change config, manage agents | Add/remove agents, rotate keys |

### Scope Restrictions

```javascript
// Agent can ONLY access these folders/repos
scopes: {
  folders: ['/Users/bud/BUD BOT/projects'],
  repos: ['jb-rubber', 'surveyx']
}

// Any access outside these scopes → DENY
```

## Approval Workflow

### 1. Propose

```bash
POST /api/approvals
{
  "agentId": "codex",
  "integration": "shell",
  "actionType": "exec",
  "action": "Run database migration",
  "payload": { "command": "npm run migrate" },
  "context": { "folder": "/projects/jb-rubber/app" }
}

Response: { "id": "approval-123", "status": "pending", ... }
```

### 2. Approve (Human in Loop)

```bash
POST /api/approvals/approval-123/approve

Response: { "id": "approval-123", "status": "approved", ... }
```

### 3. Execute

```bash
POST /api/approvals/approval-123/execute
{
  "payload": { "command": "npm run migrate" }  // Must match hash
}

// Backend verifies payload hash matches approval
// Then executes and marks approval as "executed" (single-use)
```

## Audit Log

Every policy check is logged:

```javascript
{
  id: "audit-uuid",
  timestamp: "2026-02-16T16:00:00Z",
  agentId: "codex",
  integration: "filesystem",
  actionType: "write",
  result: "allowed",  // or "denied", "requires_approval"
  reason: "POLICY_ALLOW",
  requestId: "req-123",
  userId: "harry",
  approvalId: null,
  durationMs: 12
}
```

## Configuration Files

### OpenClaw Config (`openclaw.config.json`)

Source of truth. Defines:
- Agents and their capabilities
- Integrations/tools
- Permissions (allow/deny/requiresApproval)
- Scopes and budgets

### Dashboard Overlay (`dashboard.overlay.json`)

UI metadata ONLY. Can add:
- Display names
- Icons
- Categories
- Descriptions

Cannot override:
- Security policies
- Permission grants
- Scope restrictions

## Environment Variables

```bash
# Required
OPENCLAW_CONFIG_PATH=/path/to/openclaw.config.json

# Optional
DASHBOARD_OVERLAY_PATH=/path/to/dashboard.overlay.json
NODE_ENV=development
PORT=3001
```

## Usage Example

### Check Permission

```javascript
const response = await fetch('/api/policy/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: 'codex',
    integration: 'filesystem',
    actionType: 'write',
    context: { folder: '/projects/jb-rubber/app' }
  })
});

const result = await response.json();
// { allowed: false, requiresApproval: true, reason: "POLICY_REQUIRES_APPROVAL" }
```

### Execute With Approval

```javascript
// 1. Create approval
const approval = await fetch('/api/approvals', {
  method: 'POST',
  body: JSON.stringify({
    agentId: 'codex',
    integration: 'shell',
    actionType: 'exec',
    action: 'Run tests',
    payload: { command: 'npm test' }
  })
}).then(r => r.json());

// 2. User approves via UI
// POST /api/approvals/{approval.id}/approve

// 3. Execute
await fetch(`/api/approvals/${approval.id}/execute`, {
  method: 'POST',
  body: JSON.stringify({ payload: { command: 'npm test' } })
});
```

## Hot Reload

Config Bridge watches for file changes:

1. OpenClaw config changes
2. Validation runs
3. If valid → dashboard updates automatically
4. If invalid → keeps last known-good config, logs error

## Integration with Frontend

The frontend receives:
- Normalized config (redacted secrets)
- Agent capabilities (for showing/hiding UI elements)
- Real-time updates via WebSocket

The frontend CANNOT:
- Bypass policy checks
- Execute unauthorized actions
- See secrets (API keys, tokens)

All security decisions happen on the backend.

---

Built by Bud 🌱 for Harry's AI workforce security.
