## Blockers (must fix before merge)

- [ ] **Daemon source does not compile (`tsc` fails) due duplicate supervisor methods**
  - **Why it’s a blocker**
    - Phase 0 must be mergeable and reproducible in dev; currently `npm run -w apps/daemon build` fails.
    - This blocks reliable boot from source and indicates conflicting supervisor behavior at runtime.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/supervisor.ts` defines `listRuns` twice and `cleanupRuns` twice (duplicate class method implementations).
  - **Exact fix suggestion**
    - Remove duplicate method pairs and keep a single canonical implementation for each.
    - Add CI/typecheck gate to prevent duplicate method regressions.

- [ ] **Signal handling can bypass supervisor shutdown, leaving process cleanup unreliable**
  - **Why it’s a blocker**
    - `audit.ts` registers its own `SIGINT`/`SIGTERM` handlers that call `process.exit(0)` immediately.
    - This can preempt `index.ts` graceful shutdown flow (`await supervisor.shutdown()`), violating Phase 0 process-supervision reliability (orphan/stale process risk).
  - **Where it is in code (file/function)**
    - `apps/daemon/src/audit.ts` (`process.on('SIGINT'|'SIGTERM', () => { audit.shutdown(); process.exit(0); })`).
    - `apps/daemon/src/index.ts` graceful shutdown handlers assume they will run and await supervisor cleanup.
  - **Exact fix suggestion**
    - Remove process-level signal handlers from `audit.ts`; keep shutdown orchestration in one place (`index.ts`).
    - Leave `audit.shutdown()` as a callable cleanup primitive and invoke it from centralized shutdown path only.

- [ ] **Supervisor run-detail endpoint leaks internal process state and massive buffers**
  - **Why it’s a blocker**
    - `GET /supervisor/runs/:id` returns the raw `RunRecord`, including `process` internals, full `outputBuffer`, and `logStream` metadata.
    - In adversarial runs this can produce multi-megabyte responses and expose execution internals/env-derived data, harming audit/security boundaries.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/supervisor.ts` `getRun()` returns stored `RunRecord` object directly.
    - `apps/daemon/src/routes/supervisor.ts` `GET /runs/:id` returns `run` verbatim.
  - **Exact fix suggestion**
    - Return a sanitized DTO only (`id`, `projectId`, `type`, `status`, `pid`, timing, exitCode, summary, logsPath, timeoutMs).
    - Keep output retrieval on `/runs/:id/output` with explicit line/size caps.

## High priority (fix now if quick)

- [ ] **Kill-state race: killed runs are later marked as `error`**
  - **Why it’s high priority**
    - `killRun()` sets status `killed`, but `child.on('close')` overwrites status to `error` when exit code is non-zero/null.
    - This corrupts supervisor state semantics and weakens incident/audit interpretation.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/supervisor.ts` (`killRun()` + `child.on('close')` in `spawnCommand()`).
  - **Exact fix suggestion**
    - In `close` handler, preserve terminal states (`killed`, `timeout`) and avoid overwriting them.
    - Add a regression test for user kill and timeout kill state transitions.

- [ ] **Audit redaction is key-name based only; command arguments can still leak secrets**
  - **Why it’s high priority**
    - `RUN_SPAWN` logs raw `cmd`/`args`; secrets embedded positionally (tokens in CLI args) are not redacted because only object keys are matched.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/routes/supervisor.ts` logs `{ runId, cmd, args }`.
    - `apps/daemon/src/audit.ts` `redactPayload()` redacts by key names only.
  - **Exact fix suggestion**
    - Add value-pattern redaction for common token formats/flags (`--token=`, `Authorization`, etc.) before append.
    - Prefer logging command metadata safely (command basename + arg count) unless debug mode is explicitly enabled.

- [ ] **No automated adversarial test coverage for bind/auth/sandbox invariants in CI path**
  - **Why it’s high priority**
    - Manual checks pass now, but these are security boundaries likely to regress.
  - **Where it is in code (file/function)**
    - Existing tests under `apps/daemon/src/test/*` do not enforce the full acceptance matrix in automated build/test script.
  - **Exact fix suggestion**
    - Add a single integration suite that asserts: loopback bind only, auth required on all protected routes, traversal/symlink escapes blocked, ws upgrade denied, and soft-delete audit emitted.

## Nice-to-haves / follow-up tickets

- [ ] **Return structured error codes for policy denials**
  - **Why it’s a follow-up**
    - Messages are human-readable, but clients would benefit from stable machine-readable error codes.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/sandbox.ts`, `apps/daemon/src/routes/filesystem.ts`, `apps/daemon/src/middleware/auth.ts`.
  - **Exact fix suggestion**
    - Add `code` fields (`AUTH_REQUIRED`, `PATH_TRAVERSAL`, `ABSOLUTE_PATH_DENIED`, `OUTSIDE_SANDBOX`, etc.).

- [ ] **Trim health payload to minimum operational info**
  - **Why it’s a follow-up**
    - `/health` currently includes `sandbox` absolute path; not required for liveness and increases disclosure.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/routes/health.ts`.
  - **Exact fix suggestion**
    - Keep `{status, version, uptime, daemonPort, timestamp}` and move detailed config to authenticated diagnostics endpoint.

- [ ] **Clarify and document restart recovery contract**
  - **Why it’s a follow-up**
    - Stale marking works, but expected operator workflow for cleanup/retry is undocumented.
  - **Where it is in code (file/function)**
    - `apps/daemon/src/supervisor.ts` (`loadPersistedRuns`, `cleanupRuns`) and `apps/daemon/src/routes/supervisor.ts` (`/cleanup`).
  - **Exact fix suggestion**
    - Add a short runbook: stale-state meaning, cleanup command, and expected audit events.
