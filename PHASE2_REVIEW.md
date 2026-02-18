# Codex Review — AgentX Phase 2 (Files + Editor, Safe Read-First)

## 1) Blockers (must fix before merge)

### 1. Workspace UI for file tree/read/editor is not implemented
- **Severity:** Blocker
- **Why it matters:** Phase 2 acceptance criteria A/B/C require browsing files, reading files, and a lazy Monaco editor path. The current workspace route is a placeholder that explicitly defers file explorer/editor to Phase 3.
- **Where in code:** `apps/ui/src/app/workspace/page.tsx`.
- **Exact fix suggestion:**
  1. Replace placeholder content with a split-pane workspace (tree + editor).
  2. Wire tree and read operations through existing daemon proxy (`/api/daemon/...`) client wrapper.
  3. Add editor tab that lazy-loads Monaco via `next/dynamic(() => import(...), { ssr: false })` only after file open.
  4. Add lightweight virtualization/pagination for tree nodes and avoid eager full-tree expansion.
- **Minimal repro/test steps:**
  1. Start UI.
  2. Open `/workspace`.
  3. Observe no file explorer, no file open flow, no editor.

### 2. Write path does not enforce file lock requirement
- **Severity:** Blocker
- **Why it matters:** Criterion D/F requires writes to be blocked unless lock is acquired. `/fs/write`, `/fs/rename`, and `/fs/delete` only check safe mode + capability and never verify lock ownership.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`router.put('/write')`, `router.post('/rename')`, `router.post('/delete')`).
- **Exact fix suggestion:**
  1. Add shared `requireFileLock(projectId, filePath, actorId)` guard.
  2. Enforce it in write/rename/delete endpoints before mutating filesystem.
  3. For rename, require lock on source path and either a lock or non-existence check for destination path.
  4. Return explicit errors exactly matching policy: safe mode, capability disabled, no lock.
- **Minimal repro/test steps:**
  1. Create project with `safeMode=false` and `FS_WRITE=true`.
  2. Call `PUT /fs/write` without lock.
  3. Request succeeds currently; expected `403` with "no lock" style error.

### 3. File tree endpoint does full recursive synchronous scan (performance risk)
- **Severity:** Blocker
- **Why it matters:** Criterion A/performance requires responsiveness in large repos. `buildTree` recursively traverses everything synchronously from root on every `/fs/tree` request; this can block event loop and time out UI.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`buildTree`, recursive `readdirSync/statSync`).
- **Exact fix suggestion:**
  1. Convert tree API to shallow listing endpoint (`/fs/tree?path=<dir>`) for incremental expansion.
  2. Use async filesystem APIs and cap per-directory entries.
  3. Add max depth / max nodes hard limits and return truncation metadata.
- **Minimal repro/test steps:**
  1. Point project at large repo.
  2. Call `GET /fs/tree?projectId=<id>`.
  3. Observe long response time and potential daemon unresponsiveness.

### 4. `.git` is explicitly included in tree despite default ignore requirement
- **Severity:** Blocker
- **Why it matters:** Criterion A mandates default ignores including `.git`. Current filter skips hidden directories except `.git`, which is included.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`if (entry.name.startsWith('.') && entry.name !== '.git') continue;`).
- **Exact fix suggestion:**
  1. Replace current condition with explicit deny list including `.git`, `node_modules`, `dist`, `build`, `.next`, `out`, etc.
  2. Keep deny list centralized/configurable and shared by tree/read preview policies.
- **Minimal repro/test steps:**
  1. Open tree for a git repo.
  2. Observe `.git` appears in response.

### 5. Large file read has no size cap/preview mode
- **Severity:** Blocker
- **Why it matters:** Criterion B/performance requires safe handling for large files. `/fs/read` always `readFileSync(..., 'utf8')`, which can freeze daemon/UI for large files or binary content.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`router.get('/read')`).
- **Exact fix suggestion:**
  1. Check file size via `stat` before reading.
  2. Reject above threshold (e.g., 1–2MB) with explicit `FILE_TOO_LARGE` error.
  3. Optionally support chunked/preview reads and binary detection.
- **Minimal repro/test steps:**
  1. Request a multi-MB file through `/fs/read`.
  2. Observe full synchronous read and large payload.

### 6. Locks API sandbox validation is ineffective for invalid paths
- **Severity:** Blocker
- **Why it matters:** Adversarial traversal tests require consistent daemon blocking. `sandbox.validatePath` returns `{allowed:false}` but does not throw; locks route wraps call in `try/catch` and ignores returned `allowed` flag, so invalid paths proceed to lock acquisition.
- **Where in code:** `apps/daemon/src/routes/locks.ts` (`sandbox.validatePath(projectId, filePath)` inside `try/catch`).
- **Exact fix suggestion:**
  1. Replace `try/catch` with explicit result check:
     - `const check = sandbox.validatePath(...)`
     - if `!check.allowed` return `403`.
  2. Normalize lock key to canonical validated path to prevent alias lock bypass.
- **Minimal repro/test steps:**
  1. `POST /locks/acquire` with traversal path like `../../etc/passwd`.
  2. Observe lock can still be created today.

### 7. Feature-creep guardrail violated: process spawning + git commit endpoint present
- **Severity:** Blocker
- **Why it matters:** “No feature creep” guardrails explicitly fail if process spawning beyond Phase 2 or git commit/push is implemented. This branch includes `spawn('git', ...)` and `POST /git/commit/:projectId`.
- **Where in code:** `apps/daemon/src/routes/git.ts`.
- **Exact fix suggestion:**
  1. Remove `POST /git/commit/:projectId` entirely for Phase 2.
  2. Remove or defer process-spawning git integration until allowed phase.
  3. Keep only scope-approved filesystem + lock + audit APIs.
- **Minimal repro/test steps:**
  1. Inspect routes and call `POST /git/commit/:projectId`.
  2. Endpoint is active and attempts to mutate repo state.

## 2) High priority

### 8. Lock lifecycle lacks timeout/recovery (deadlock risk)
- **Severity:** High
- **Why it matters:** Criterion F requires timeout or recovery mechanism. Lock rows include `locked_at` but acquisition/release logic never expires stale locks.
- **Where in code:** `apps/daemon/src/database.ts` (`file_locks` schema + `lockDb.acquire/release`), `apps/daemon/src/routes/locks.ts`.
- **Exact fix suggestion:**
  1. Add lock TTL policy (e.g., 5–15 minutes) and heartbeat/renew endpoint.
  2. Expire stale locks during acquire attempt (transactionally).
  3. Add admin/system recovery endpoint with audit trail.
- **Minimal repro/test steps:**
  1. Acquire lock as actor A.
  2. Simulate actor disconnect/no release.
  3. Actor B remains blocked indefinitely.

### 9. Error strings do not match required policy wording
- **Severity:** High
- **Why it matters:** Criterion D asks clear reasons (“Write blocked: safe mode”, “no lock”, “capability disabled”). Current messages are verbose/non-standard and there is no “no lock” branch.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`canWrite`, write/delete/rename handlers).
- **Exact fix suggestion:**
  1. Standardize machine-readable error codes and user-facing messages.
  2. Return deterministic `code` values: `SAFE_MODE_BLOCK`, `FS_WRITE_DISABLED`, `LOCK_REQUIRED`.
- **Minimal repro/test steps:**
  1. Trigger write rejection in safe mode/capability off.
  2. Compare response with required policy wording.

### 10. Tree ignore list is incomplete for build outputs/binary-heavy dirs
- **Severity:** High
- **Why it matters:** Criterion A requires default ignores beyond `node_modules` and `.git` (e.g., build outputs). Current implementation only skips `node_modules` and most dotfiles.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (tree filter block).
- **Exact fix suggestion:**
  1. Add configurable ignore patterns (`dist`, `build`, `.next`, `coverage`, `target`, `.cache`, etc.).
  2. Apply ignores before `statSync` to reduce syscalls.
- **Minimal repro/test steps:**
  1. Add large `dist` folder.
  2. Call `/fs/tree`; folder still traversed.

## 3) Nice-to-haves / follow-up tickets

### 11. Reduce audit sensitivity by minimizing path detail for read events
- **Severity:** Nice
- **Why it matters:** Criterion G allows read logging optionally. Current read logs path metadata only (good), but adding event sampling/rate limiting would reduce noise and log growth.
- **Where in code:** `apps/daemon/src/routes/filesystem.ts` (`FILE_READ` audit log).
- **Exact fix suggestion:**
  1. Make read logging opt-in or sampled.
  2. Keep privileged actions fully audited.
- **Minimal repro/test steps:**
  1. Open many files quickly.
  2. Audit volume grows rapidly.

### 12. Add explicit adversarial integration tests for traversal/symlink/capability matrix
- **Severity:** Nice
- **Why it matters:** Security checks are partly implemented in sandbox, but current regressions (lock validation) show need for automated adversarial tests.
- **Where in code:** Add under `apps/daemon/src/test/`.
- **Exact fix suggestion:**
  1. Add tests for `../../`, absolute path, symlink escape, safeMode/capability/lock matrix.
  2. Validate all privileged routes (`write/rename/delete/restore`) share same enforcement.
- **Minimal repro/test steps:**
  1. Run daemon tests.
  2. Ensure failing cases reject with deterministic codes.
