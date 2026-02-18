# Phase 4 Review — Multi-Agent Chat + OpenClaw Adapter

## 1) Blockers (must fix before merge)

### 1. Missing Chat UX (`@agentName`, `@all`) and persistence
- **Severity:** Blocker
- **Why it matters:** Acceptance criterion **A** requires mention routing, explicit no-mention behavior, and project-scoped persisted chat messages. The current UI has no chat view, no mention parser, and no chat persistence surface.
- **Where in code:**
  - `apps/ui/src/components/Layout/Sidebar.tsx` only exposes Dashboard/Workspace/Audit/Settings routes (no chat route).
  - `apps/ui/src/app/workspace/page.tsx` implements file tree + editor only.
  - No chat routes/components/services exist under `apps/ui/src/app` or daemon chat routes.
- **Exact fix suggestion:**
  1. Add `/chat` page with project-scoped thread list and composer.
  2. Implement mention parser (`@agentName`, `@all`) in UI, mapping mentions -> agent IDs.
  3. Add daemon chat storage routes (`POST /chat/messages`, `GET /chat/messages?projectId=...`) backed by SQLite table keyed by `project_id`.
  4. Define explicit fallback when message has no mention (default agent, or prompt user before send).
- **Minimal repro/test steps:**
  1. Start UI.
  2. Attempt to navigate to a chat page from sidebar.
  3. Observe no chat UX exists; no mention routing can be exercised.

### 2. Required Runs API shape not implemented (`POST /runs/agent`)
- **Severity:** Blocker
- **Why it matters:** Acceptance criterion **B** explicitly requires `POST /runs/agent` through supervisor-managed Run records with lifecycle fields. Current API exposes `/supervisor/runs` and `/agents/spawn`, not the required Phase 4 contract.
- **Where in code:**
  - `apps/daemon/src/routes/supervisor.ts` exposes `POST /supervisor/runs` and `POST /supervisor/runs/:id/spawn`.
  - `apps/daemon/src/routes/agents.ts` exposes `POST /agents/spawn`.
- **Exact fix suggestion:**
  1. Introduce `POST /runs/agent` (or versioned equivalent) as canonical entrypoint.
  2. Internally create Run via supervisor and attach agent metadata.
  3. Deprecate/bound older spawn endpoints so all agent execution flows through one orchestrated path.
- **Minimal repro/test steps:**
  1. `curl -X POST http://127.0.0.1:<port>/runs/agent ...`
  2. Confirm 404/route missing.

### 3. No OpenClaw adapter and no real execution path
- **Severity:** Blocker
- **Why it matters:** Acceptance criteria **C/D/F** require a dedicated OpenClaw adapter, safe command construction, explicit cwd/env, and timeout-enforced execution. The current agent run path is a placeholder and never executes OpenClaw.
- **Where in code:**
  - `apps/daemon/src/supervisor.ts` `spawnAgentRun(...)` marks run as `pending` with placeholder summary and comments that real execution is Phase 5.
  - No `openclawAdapter.ts` (or equivalent) module exists in daemon source.
- **Exact fix suggestion:**
  1. Add `apps/daemon/src/openclawAdapter.ts` with a single `runTask({projectId, agentId, prompt, timeoutMs, cwd, env})` API.
  2. Use `spawn(cmd, args, {cwd, env, shell:false})`; disallow shell-string construction.
  3. Integrate adapter into supervisor agent-run lifecycle.
  4. Enforce timeout + kill escalation in adapter/supervisor boundary.
- **Minimal repro/test steps:**
  1. Call `/agents/spawn`.
  2. Fetch run record and output.
  3. Observe run stays placeholder/pending and no OpenClaw output stream exists.

### 4. Cross-project run data leakage via unscoped run listing
- **Severity:** Blocker
- **Why it matters:** Acceptance criterion **A/F + project isolation adversarial test #6** requires strict project isolation. `/supervisor/runs` returns all runs when `projectId` is omitted.
- **Where in code:**
  - `apps/daemon/src/routes/supervisor.ts` `GET /runs` forwards optional `projectId`.
  - `apps/daemon/src/supervisor.ts` `listRuns(projectId?)` returns all runs if no filter.
- **Exact fix suggestion:**
  1. Require `projectId` on list/read routes unless actor is privileged admin.
  2. Validate project membership/authorization before returning run metadata.
  3. Add integration test asserting Project B cannot list Project A runs.
- **Minimal repro/test steps:**
  1. Create runs in two projects.
  2. Call `GET /supervisor/runs` without `projectId`.
  3. Observe cross-project run metadata in one response.

### 5. Run status model does not match required lifecycle
- **Severity:** Blocker
- **Why it matters:** Acceptance criterion **B** requires `queued/running/succeeded/failed/killed`; API types currently expose `pending/running/completed/error/killed`, and agent run placeholder transitions are inconsistent.
- **Where in code:**
  - `packages/api-types/src/index.ts` `Run.status` type.
  - `apps/daemon/src/supervisor.ts` sets statuses to `pending`, `completed`, `error`.
- **Exact fix suggestion:**
  1. Normalize status enum to required values (`queued`, `running`, `succeeded`, `failed`, `killed`).
  2. Add translation shim for backward compatibility if needed.
  3. Ensure UI consumes only normalized status values.
- **Minimal repro/test steps:**
  1. Spawn and complete a command run.
  2. Observe status values differ from acceptance contract.

## 2) High priority

### 6. Capability gate missing for agent/OpenClaw path
- **Severity:** High
- **Why it matters:** Acceptance criterion **F** requires `OPENCLAW_RUN` gating (and safe mode policy enforcement). Current `/agents/spawn` does not check either project capability or safe mode before creating run/instance.
- **Where in code:**
  - `apps/daemon/src/routes/agents.ts` `POST /spawn`.
  - `apps/daemon/src/agents.ts` `spawn(...)`.
- **Exact fix suggestion:**
  1. Before spawn, fetch project settings.
  2. Deny with clear human-readable message when `OPENCLAW_RUN=false`.
  3. Apply safe-mode policy explicitly (allowlist/denylist) and return deterministic error codes.
- **Minimal repro/test steps:**
  1. Set project `OPENCLAW_RUN=false`.
  2. Call `/agents/spawn`.
  3. Observe run/instance still created.

### 7. No run output streaming channel for agent runs
- **Severity:** High
- **Why it matters:** Acceptance criterion **C** requires live streaming (WS/SSE), partial output while running, and final summary in UI.
- **Where in code:**
  - `apps/daemon/src/routes/supervisor.ts` only provides pull endpoint `GET /runs/:id/output`.
  - `apps/daemon/src/websocket.ts` only supports terminal message types; no run output stream messages.
- **Exact fix suggestion:**
  1. Add SSE (`/runs/:id/stream`) or WS run channel (`run:attach`, `run:data`, `run:end`).
  2. Bind stream auth + project authorization checks.
  3. Add chunk batching/backpressure and close semantics on run completion/kill.
- **Minimal repro/test steps:**
  1. Start long run.
  2. Verify no SSE/WS run subscription API exists.

### 8. Monitor view (active runs + status + kill) missing in UI
- **Severity:** High
- **Why it matters:** Phase 4 scope explicitly includes monitor view; currently there is no monitor route/page.
- **Where in code:**
  - `apps/ui/src/components/Layout/Sidebar.tsx` (no monitor nav).
  - `apps/ui/src/app/*` pages include dashboard/workspace/audit/settings only.
- **Exact fix suggestion:**
  1. Add `/monitor` page with active run list, status pill, and kill action.
  2. Subscribe to run events (stream) instead of aggressive polling.
- **Minimal repro/test steps:**
  1. Open UI nav.
  2. Confirm monitor page/action absent.

### 9. Audit logging misses required run lifecycle events for agent orchestration
- **Severity:** High
- **Why it matters:** Acceptance criterion **G** requires at least run created, run killed, and denied capability events (metadata only). Existing logs track generic actions, but there is no dedicated `/runs/agent` lifecycle coverage and capability-denied logging for OPENCLAW path.
- **Where in code:**
  - `apps/daemon/src/routes/supervisor.ts` logs `RUN_CREATE`, `RUN_KILL` for supervisor routes.
  - `apps/daemon/src/routes/agents.ts` lacks capability-denied audit path because gate is absent.
- **Exact fix suggestion:**
  1. Add `RUN_AGENT_CREATE`, `RUN_AGENT_KILL`, `CAPABILITY_DENIED` events.
  2. Ensure payload excludes full prompts/model output.
  3. Include actorId, projectId, agentId, runId consistently.
- **Minimal repro/test steps:**
  1. Trigger denied OpenClaw run.
  2. Confirm no capability-denied audit event emitted.

## 3) Nice-to-haves / follow-up tickets

### 10. Tighten token handling in audit payloads
- **Severity:** Nice
- **Why it matters:** Criterion **E** says no tokens in logs/audit payloads. Current code logs `tokenPrefix`; while redacted, safest policy is zero token material.
- **Where in code:**
  - `apps/daemon/src/routes/auth.ts` logs `tokenPrefix` on create/revoke.
- **Exact fix suggestion:**
  1. Remove token-derived fields entirely from audit payload.
  2. Keep only `clientId`, session ID, and timestamp.
- **Minimal repro/test steps:**
  1. Create/revoke session.
  2. Inspect audit events for token-derived fields.

### 11. Add adversarial integration tests for Phase 4 gates and isolation
- **Severity:** Nice
- **Why it matters:** The brief requires auth/capability bypass, flooding, kill reliability, and project isolation checks.
- **Where in code:**
  - `apps/daemon/src/test/` currently has generic smoke/supervisor tests only.
- **Exact fix suggestion:**
  1. Add phase-specific test suite for `/runs/agent` auth, capability gates, safe mode gates.
  2. Add long-output bounded-buffer tests for stdout/stderr.
  3. Add multi-project isolation tests for list/read/stream endpoints.
- **Minimal repro/test steps:**
  1. Run phase test suite in CI.
  2. Verify failures for any bypass.

### 12. Add UI performance guardrails for streaming chat/run output
- **Severity:** Nice
- **Why it matters:** Performance criteria require sensible chunking and avoiding full-history rerenders.
- **Where in code:**
  - No chat/monitor implementation yet, so no token-chunk rendering strategy exists.
- **Exact fix suggestion:**
  1. Build message virtualization + incremental append batching (e.g., requestAnimationFrame batching).
  2. Keep run-output ring buffers capped in UI state.
  3. Add perf test for long streaming sessions.
- **Minimal repro/test steps:**
  1. Stream large output.
  2. Validate FPS and memory under sustained throughput.

## Acceptance Criteria Snapshot

- **A (Chat UX + Routing):** ❌ Not implemented.
- **B (Runs API + Supervisor):** ❌ Missing required endpoint/contract and status model mismatch.
- **C (Streaming output):** ❌ No run streaming channel implemented.
- **D (OpenClaw adapter):** ❌ No adapter module or execution integration.
- **E (Auth & stream security):** ⚠️ Protected route baseline exists; no run stream endpoint to validate. Token-derived audit fields should be removed.
- **F (Capability gating):** ❌ OPENCLAW_RUN + safe mode policy not enforced on agent path.
- **G (Audit coverage):** ⚠️ Partial for generic runs, but not complete for required Phase 4 run/capability lifecycle.
