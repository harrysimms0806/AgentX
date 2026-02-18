# AgentX

The Local OpenClaw Communication Terminal — a single workspace for multi-agent chat, terminals, file editing, and project management.

## Structure

```
agentx/
├── apps/
│   ├── ui/              # Next.js frontend (Phase 1)
│   └── daemon/          # Local system service (Phase 0 ✅)
├── packages/
│   ├── shared/          # Shared utilities
│   └── api-types/       # Request/response schemas
├── docs/                # Documentation
├── scripts/             # Build and dev scripts
└── README.md            # This file
```

## Quick Start

```bash
# Install dependencies
npm install

# Build packages
cd packages/api-types && npm run build
cd packages/shared && npm run build

# Build and run daemon
cd apps/daemon && npm run build && npm start

# Run smoke tests (another terminal)
node apps/daemon/dist/test/smoke.js
```

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Complete | Daemon foundations (auth, sandbox, audit, supervisor) |
| 1 | 🔄 Next | UI Shell (Next.js layout, navigation) |
| 2 | ⏳ | Files + Editor (Monaco, file tree) |
| 3 | ⏳ | Terminal + Streaming (node-pty, WebSockets) |
| 4 | ⏳ | Multi-Agent Chat + OpenClaw adapter |
| 5 | ⏳ | Context Pack + Memory retrieval |
| 6 | ⏳ | Git + Runbooks + Polish |

## Architecture

- **UI**: Next.js on localhost:3000
- **Daemon**: Node.js service on localhost:3001
- **Communication**: REST API + WebSockets
- **Security**: Token auth, filesystem sandbox, audit logging

See `PROJECTBRIEF.md` for full specification.
