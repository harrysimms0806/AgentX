## Blockers (must fix before merge)

- [ ] **Safe mode / capability model is not enforced for mutating filesystem endpoints**
  - **Why it’s a blocker**
    - Phase 0 policy defaults projects to `safeMode: true` and `FS_WRITE: false`, but `PUT /fs/write`, `POST /fs/delete`, and `POST /fs/rename` still succeed under default settings.
    - This violates the local safety boundary and undermines least-privilege expectations for later phases.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/routes/filesystem.ts` (`canWrite()` always returns `{ allowed: true }` and is used by write route; delete/rename are effectively unchecked).
    - `apps/daemon/src/routes/projects.ts` (`defaultSettings` sets `FS_WRITE: false` / `safeMode: true`, but FS routes do not enforce it).
  - **Exact fix suggestion**
    - Replace `canWrite()` placeholder with real project settings lookup and enforce deny-by-default for write/delete/rename when `safeMode` is true or `capabilities.FS_WRITE` is false.
    - Return consistent `403` with explicit reason (`FS_WRITE disabled by policy`).

- [ ] **Supervisor safety controls are not verifiable end-to-end because no API path actually spawns processes**
  - **Why it’s a blocker**
    - Acceptance criterion **E** requires proving timeout, bounded output, kill escalation, and restart behavior on real spawned processes.
    - Current daemon API can create/list/kill metadata runs, but cannot start a command through HTTP; `spawnCommand()` is unreachable from routes.
    - As a result, runaway-process and log-rotation adversarial tests cannot be completed against the daemon boundary.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/supervisor.ts` implements `spawnCommand()` + limits.
    - `apps/daemon/src/routes/supervisor.ts` never calls `spawnCommand()`.
  - **Exact fix suggestion**
    - Add a minimal, auth-protected execution route for Phase 0 validation only (sandboxed cwd, strict allowlist, audit event).
    - Add integration tests that actually spawn long-running/noisy commands and assert timeout + SIGTERM→SIGKILL + buffer/log limits.

- [ ] **Audit durability gap: privileged actions are buffered and may be missing from immediate reads/crash windows**
  - **Why it’s a blocker**
    - Acceptance criterion **G** expects privileged actions to be recorded reliably.
    - `FILE_WRITE`/`FILE_DELETE` are not in the immediate-flush list; reading `/audit` immediately after action can miss events until periodic flush, and a crash can lose buffered records.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/audit.ts` (`log()` only immediate-flushes `WRITE`, `DELETE`, `EXEC`; filesystem routes emit `FILE_WRITE`, `FILE_DELETE`, etc.).
  - **Exact fix suggestion**
    - Flush immediately for all privileged action types (or write-through append for each event).
    - At minimum, align flush trigger with actual emitted action names (`FILE_WRITE`, `FILE_DELETE`, `RUN_*`, auth/session actions).

- [ ] **Auth coverage requirement is not fully met for potential websocket surface**
  - **Why it’s a blocker**
    - Acceptance criterion **B** explicitly includes websockets.
    - There is documented WS policy in comments, but no implemented WS upgrade guard.
    - This is a latent auth bypass risk once WS is introduced.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/index.ts` (WS policy comments only; no upgrade/auth enforcement code).
  - **Exact fix suggestion**
    - Implement explicit WS auth on upgrade (reject missing/invalid bearer), or gate WS feature entirely until guard is implemented and tested.

## High priority (fix now if quick)

- [ ] **Protected route internals reach private supervisor state via bracket access**
  - **Why it’s high priority**
    - `supervisor['runs']` / `supervisor['persistRuns']()` bypass class encapsulation and can break invariants as code evolves.
    - This is especially risky in privileged cleanup paths.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/routes/supervisor.ts` (list and cleanup routes).
  - **Exact fix suggestion**
    - Add public methods (`listRuns`, `cleanupRuns`, `persistState`) on supervisor and consume those from routes.

- [ ] **Bind-address verification is code-only, not test-enforced**
  - **Why it’s high priority**
    - Daemon appears to bind to loopback in code, but no automated guard prevents accidental regression to external bind.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/index.ts` (`app.listen(config.port, '127.0.0.1', ...)`).
  - **Exact fix suggestion**
    - Capture and assert listener address in smoke/integration tests; fail CI if non-loopback.

- [ ] **Auth consistency relies on mount discipline; no route-level lint/test guard**
  - **Why it’s high priority**
    - Current protection works, but accidental future route mounting outside middleware could expose endpoints.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/index.ts` route mount order and auth middleware composition.
  - **Exact fix suggestion**
    - Add route-auth coverage tests (all non-`/health` endpoints require bearer).

## Nice-to-haves / follow-up tickets

- [ ] **Standardize sandbox error taxonomy and status mapping**
  - **Why it’s a follow-up**
    - Errors are clear, but API consumers would benefit from stable machine-readable codes.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/sandbox.ts` and `apps/daemon/src/routes/filesystem.ts`.
  - **Exact fix suggestion**
    - Add `code` fields (`INVALID_PATH`, `ABSOLUTE_PATH_DENIED`, `OUTSIDE_SANDBOX`, etc.) and keep message text human-friendly.

- [ ] **Harden audit file permissions and tamper evidence**
  - **Why it’s a follow-up**
    - Append-only API is good baseline, but filesystem-level integrity can be improved.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/audit.ts`.
  - **Exact fix suggestion**
    - Create log with restrictive mode (`0600`) and optionally add chained hash per event line.

- [ ] **Supervisor stale-run cleanup UX could be clearer**
  - **Why it’s a follow-up**
    - Stale marking exists, but operator tooling for stale/orphan visibility can be improved.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/supervisor.ts` (`loadPersistedRuns`, `markStaleSessions`, `shutdown`).
  - **Exact fix suggestion**
    - Add a dedicated stale-runs endpoint/report and explicit cleanup summary in audit.
