# Codex Review — AgentX Phase 3 (Terminal + Supervisor Streaming)

This review is scoped to Phase 3 requirements only and is based on direct code inspection plus targeted command checks.

## 1) Blockers (must fix before merge)

### 1. WebSocket accepts unauthenticated connection handshake
- **Severity:** Blocker
- **Why it matters:** The `/ws` endpoint accepts a socket first and only enforces auth in a later in-band message (`type: 'auth'`). This violates acceptance criterion **C (Auth enforcement including WebSockets)** and the auto-fail condition **"WS accepts connections without auth"**.
- **Where in code:** `apps/daemon/src/websocket.ts` (`initialize`, `handleConnection`, `handleMessage`, `handleAuth`).
- **Exact fix suggestion:**
  - Move auth to the HTTP upgrade step using `verifyClient` (or `server.on('upgrade')`) and require a valid bearer token from headers before the WS is established.
  - Reject upgrade with `401` when token missing/invalid.
  - Keep message-level auth checks as defense-in-depth, but never allow an unauthenticated socket to open.
- **Minimal repro/test steps:**
  1. Open `ws://127.0.0.1:<daemonPort>/ws` with no token headers.
  2. Observe successful connect + `{"type":"connected"...}` welcome message.
  3. Expected behavior should be upgrade rejection (HTTP 401), not post-connect error.

### 2. Terminal CWD sandbox escape is possible
- **Severity:** Blocker
- **Why it matters:** Terminal creation computes `workingDir` via `path.join(projectRoot, cwd)` without canonicalization/boundary check. Inputs like `cwd=../../..` can escape project root. This violates acceptance criterion **D (sandbox + safety alignment)** and auto-fail **"Any path/cwd escapes sandbox"**.
- **Where in code:** `apps/daemon/src/terminal.ts` (`create`), compared to robust sandbox checks in `apps/daemon/src/sandbox.ts` (`validatePath`).
- **Exact fix suggestion:**
  - Reuse `sandbox.validatePath(projectId, cwd || '.')` for terminal cwd validation (including realpath/symlink boundary checks).
  - Reject absolute paths and traversal with explicit 400/403 errors.
  - Use the resolved canonical path (`check.realPath`) as pty cwd.
- **Minimal repro/test steps:**
  1. POST `/terminals` with `{ "projectId":"<id>", "cwd":"../../.." }`.
  2. Verify terminal is created and `cwd` resolves outside project.
  3. Expected behavior should be refusal with sandbox error.

### 3. PTY spawning bypasses Supervisor ownership
- **Severity:** Blocker
- **Why it matters:** Terminal processes are spawned directly in `terminalManager` (`node-pty spawn`) instead of via Supervisor. This violates acceptance criterion **B (Supervisor is the only process owner)** and auto-fail **"Terminal spawn not tracked by Supervisor"**.
- **Where in code:** `apps/daemon/src/terminal.ts` (direct `spawn`), `apps/daemon/src/supervisor.ts` (separate process model for runs only).
- **Exact fix suggestion:**
  - Add a Supervisor terminal registry API (e.g., `createTerminal`, `writeTerminal`, `resizeTerminal`, `killTerminal`) and route all pty lifecycle operations through Supervisor only.
  - Include required metadata: `sessionId`, `pid`, `projectId`, `cwd`, `createdAt`, `lastActiveAt`, `status`.
- **Minimal repro/test steps:**
  1. Search daemon source for pty spawn call sites.
  2. Confirm terminal spawn originates outside Supervisor.
  3. Confirm terminal sessions are not part of persisted supervisor run/session state.

### 4. Safe mode is not enforced for terminal creation/execution
- **Severity:** Blocker
- **Why it matters:** Filesystem write routes block in safe mode, but terminal creation has no safe mode check. This violates acceptance criterion **D (safe mode behavior)** and auto-fail **"Safe mode is ignored for terminal/exec operations"**.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`canWrite` checks `project.settings.safeMode`) vs. `apps/daemon/src/routes/terminals.ts` and `apps/daemon/src/websocket.ts` terminal create path (no safe mode gate).
- **Exact fix suggestion:**
  - Add centralized policy helper (e.g., `canOpenTerminal(projectId)`) that enforces safe mode and project capability policy.
  - Apply it to both REST and WS terminal creation paths.
  - Return human-readable error with explicit code (e.g., `SAFE_MODE_BLOCK`).
- **Minimal repro/test steps:**
  1. Set project safe mode on.
  2. Call POST `/terminals` or WS `terminal:create`.
  3. Observe terminal still created.
  4. Expected behavior should be a blocked request with clear safe-mode error.

### 5. Terminal output path has no explicit bounded buffering/backpressure
- **Severity:** Blocker
- **Why it matters:** `onData` forwards raw chunks to all attached handlers with no per-terminal byte cap, queue cap, or flow control when consumers are slow. This violates acceptance criterion **E (output bounding + stability)**.
- **Where in code:** `apps/daemon/src/terminal.ts` (`pty.onData` broadcast loop), `apps/daemon/src/websocket.ts` (`send` directly forwards every chunk).
- **Exact fix suggestion:**
  - Add byte-bounded ring buffer per terminal for recent output (stdout/stderr-equivalent PTY stream).
  - Add per-client outbound queue limit and drop/close policy on overflow.
  - Batch/coalesce chunks (time- or size-based) before WS send.
- **Minimal repro/test steps:**
  1. Start terminal; run `yes`.
  2. Detach or throttle frontend WS consumer.
  3. Observe server memory growth / no explicit backpressure policy.
  4. Expected behavior should keep memory bounded and remain stable.

## 2) High priority

### 6. Terminal session lifecycle does not preserve stale sessions across restart
- **Severity:** High
- **Why it matters:** On daemon restart, terminals are just shut down and in-memory map is cleared; there is no persisted terminal registry and no stale markers exposed to UI. This partially violates acceptance criterion **F (restart behavior)**.
- **Where in code:** `apps/daemon/src/terminal.ts` (in-memory `Map`, `shutdown` clears all), `apps/daemon/src/index.ts` (no terminal session restoration/stale marking workflow).
- **Exact fix suggestion:**
  - Persist terminal session metadata similarly to supervisor runs.
  - On startup, mark previously-active sessions as `stale` and expose via `/terminals`.
  - Add cleanup/recreate action in API/UI.
- **Minimal repro/test steps:**
  1. Create terminal and keep it active.
  2. Restart daemon.
  3. Call `/terminals`.
  4. Expected behavior should show stale session(s), not disappearance.

### 7. Kill path lacks explicit TERM→KILL escalation for terminal PTYs
- **Severity:** High
- **Why it matters:** `terminalManager.kill()` invokes `pty.kill()` once; there is no explicit escalation or timeout strategy equivalent to Supervisor’s kill logic. This risks unreliable termination for runaway child trees (criterion **B/E**, adversarial test #3).
- **Where in code:** `apps/daemon/src/terminal.ts` (`kill`, `killByProject`), contrast with `apps/daemon/src/supervisor.ts` (`killRun` escalation).
- **Exact fix suggestion:**
  - Implement kill escalation policy for terminals: SIGTERM + bounded wait + SIGKILL fallback.
  - Record kill reason and final status transition.
- **Minimal repro/test steps:**
  1. Run long-lived command in terminal.
  2. Trigger kill.
  3. Verify process tree termination reliably under load.

### 8. Monitor/Status UI lacks terminal session visibility and controls
- **Severity:** High
- **Why it matters:** Status UI shows daemon health and active runs only; terminal count/status/kill controls are not exposed, violating acceptance criterion **G (UX monitor + status)**.
- **Where in code:** `apps/ui/src/components/Layout/StatusBar.tsx` (no terminal fields), `apps/ui/src/contexts/DaemonContext.tsx` (`activeRuns: 0` placeholder, no terminal state wiring).
- **Exact fix suggestion:**
  - Add terminal session state in context, subscribe via WS/event stream, and render counts/status (`running/stale/exited`).
  - Add kill/close actions and clear error badges.
- **Minimal repro/test steps:**
  1. Open UI, create terminals via API.
  2. Observe no terminal count/status/actions in monitor/status surfaces.

## 3) Nice-to-haves / follow-up tickets

### 9. Normalize terminal error status codes and human-readable messages
- **Severity:** Nice
- **Why it matters:** Some failures return generic 500 (`Failed to create terminal`) where policy errors should be 4xx with explicit machine codes; better UX/debuggability for criteria **D/G**.
- **Where in code:** `apps/daemon/src/routes/terminals.ts` error handler; WS error payload conventions in `apps/daemon/src/websocket.ts`.
- **Exact fix suggestion:**
  - Introduce typed terminal errors with code map (`SAFE_MODE_BLOCK`, `PATH_OUTSIDE_SANDBOX`, `AUTH_REQUIRED`, etc.) and consistent HTTP/WS mapping.
- **Minimal repro/test steps:**
  1. Trigger invalid `cwd` and safe mode block.
  2. Confirm structured error and user-friendly message.

### 10. Add focused adversarial integration tests for Phase 3 guarantees
- **Severity:** Nice
- **Why it matters:** Current test files target earlier phases; Phase 3-specific security/perf regressions are likely without dedicated tests.
- **Where in code:** Existing tests in `apps/daemon/src/test/*` don’t cover terminal WS auth/cwd escape/backpressure end-to-end.
- **Exact fix suggestion:**
  - Add automated tests for:
    - WS upgrade auth rejection.
    - CWD traversal/absolute/symlink escape rejection.
    - Runaway output memory bounds + kill reliability.
    - Restart stale session marking.
- **Minimal repro/test steps:**
  1. Implement test harness with daemon boot + WS client.
  2. Assert policy outcomes for each adversarial case.

---

## Acceptance Criteria Coverage Summary
- **A) Terminal sessions work reliably:** Partially met (basic create/attach/write/resize/kill present) but stability/backpressure concerns remain.
- **B) Supervisor only owner:** **Not met**.
- **C) Auth enforcement incl. WS handshake:** **Not met**.
- **D) Sandbox + safe mode alignment:** **Not met**.
- **E) Output bounding + stability:** **Not met** for terminal streaming path.
- **F) Restart behavior stale strategy:** Partially met for supervisor runs; **not met for terminal sessions**.
- **G) Monitor + status UX:** **Not met** for terminal visibility/actions.

