# Phase 0 Notes — AgentX Daemon Foundations

## Summary

Phase 0 implements the core daemon infrastructure with security foundations:
- Express server with auth token system
- Sandbox filesystem enforcement (path traversal protection)
- Append-only audit logging
- Process supervisor skeleton
- Project management
- File operations with soft-delete

## Structure

```
apps/daemon/
├── src/
│   ├── index.ts           # Main entry point
│   ├── config.ts          # Configuration management
│   ├── auth.ts            # Token-based auth
│   ├── sandbox.ts         # Filesystem sandbox
│   ├── audit.ts           # Append-only audit log
│   ├── supervisor.ts      # Process management
│   ├── middleware/
│   │   └── auth.ts        # Auth middleware
│   └── routes/
│       ├── health.ts      # Health check (no auth)
│       ├── auth.ts        # Session management
│       ├── projects.ts    # CRUD operations
│       ├── filesystem.ts  # File ops
│       └── audit.ts       # Audit log access
└── src/test/smoke.ts      # Smoke tests

packages/api-types/        # Shared TypeScript types
packages/shared/           # Shared utilities (placeholder)
```

## How to Run

```bash
# Install dependencies
npm install

# Build packages
npm run build -w packages/api-types
npm run build -w apps/daemon

# Start daemon
npm run start -w apps/daemon
# Or for development with hot reload:
npm run dev -w apps/daemon

# Run smoke tests (in another terminal)
npm run test -w apps/daemon
```

## Acceptance Criteria

| Criteria | Status | Notes |
|----------|--------|-------|
| Daemon boots and listens on 127.0.0.1:3001 | ✅ | Verified |
| /health endpoint returns ok without auth | ✅ | Verified |
| All other endpoints require Bearer token | ✅ | Verified |
| Auth tokens generated via /auth/session | ✅ | Verified |
| Sandbox root enforced (~/BUD BOT/projects) | ✅ | Verified |
| Path traversal blocked (../etc/passwd) | ✅ | Verified |
| Soft delete to trash folder | ✅ | Implemented |
| Audit log append-only | ✅ | JSONL format |
| Project creation with template files | ✅ | Verified |
| File read/write through sandbox | ✅ | Verified |

## Known Limitations

1. **Auth tokens don't expire** — Phase 0 only, will add expiry in future
2. **Project settings not persisted** — Stored in memory, need SQLite
3. **No file write locks yet** — Will implement in Phase 2
4. **Safe mode check is placeholder** — Always allows writes in current implementation
5. **Process supervisor basic** — Full spawn/kill/streaming in Phase 3
6. **No WebSocket terminal yet** — Phase 3 deliverable
7. **Audit log uses JSONL** — May migrate to SQLite later
8. **Port auto-increment not implemented** — Will fail if 3001 taken

## TODOs for Future Phases

- [ ] SQLite database for persistence
- [ ] File write locks with timeout
- [ ] Full capability enforcement
- [ ] Safe mode toggle working
- [ ] WebSocket terminal streaming
- [ ] Git operations endpoints
- [ ] OpenClaw CLI adapter
- [ ] Context Pack generation
- [ ] Port discovery and runtime.json

## Security Notes

- ✅ Daemon binds to 127.0.0.1 only (verified)
- ✅ All protected routes require auth token
- ✅ Path traversal attempts blocked
- ✅ Sandbox validation before all file ops
- ✅ Soft delete prevents accidental data loss
- ✅ Audit log records all actions

## Test Results

All 8 smoke tests passed:
1. Health check (no auth) — ✅
2. Auth enforcement — ✅
3. Session creation — ✅
4. Project creation — ✅
5. Project listing — ✅
6. Path traversal blocked — ✅
7. File write/read — ✅
8. Audit log accessible — ✅

## Risks

| Risk | Mitigation |
|------|------------|
| In-memory project store loses data on restart | Move to SQLite in Phase 1 |
| No file locks yet | Implement before enabling FS_WRITE |
| Safe mode not enforced | Add capability checks before Phase 1 merge |

---

**Status:** ✅ COMPLETE
**Date:** 2026-02-18
**Branch:** phase-0
