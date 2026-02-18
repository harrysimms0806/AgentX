# Codex Review Checklist — AgentX Phase 1 (UI Shell)

## 1) Blockers (must fix before merge)

1. **UI cannot build due JSX syntax errors in shell components.**
   - `ProjectSwitcher` and `AgentList` both include malformed conditionals (`{!collapsed && (>`) which breaks Next.js compilation.
   - Impact: Phase 1 shell is not runnable, so manual smoke checks cannot pass.

2. **Daemon discovery mechanism is not implemented in UI.**
   - Daemon writes discovery data to `~/.agentx/runtime.json`, but UI does not read discovery data from that file (or any equivalent agreed discovery mechanism).
   - Current UI uses hardcoded relative fetches to `/api/daemon/*`.
   - There are no UI app route handlers/proxy routes present under `apps/ui/src/app/api/...` to make these paths valid.

3. **Connectivity state model is incomplete (“mystery state” risk).**
   - UI tracks only boolean `connected`; it does not expose distinct states for daemon starting/retrying, runtime missing, or auth failure.
   - This violates Phase 1 UX requirement for explicit, human-readable state handling.

4. **Auth handling is incomplete for non-health routes.**
   - UI obtains token in-memory (`setToken`) but does not centralize daemon requests or guarantee attaching bearer token to all non-health daemon calls.
   - No explicit 401/403 state handling path is implemented to show “Not authorised / session expired”.

5. **Required smoke gate currently fails (`next build`).**
   - Build fails in `apps/ui` due the syntax issues above, so Phase 1 baseline quality gate is red.

## 2) High priority

1. **Surface daemon endpoint/port clearly in persistent UI status.**
   - Status bar shows `health.daemonPort` if health exists, but no explicit “connected to X endpoint” banner/state when discovery differs or fails.

2. **Add centralized daemon client module + typed request wrapper.**
   - Move fetch + token attachment + retry/backoff into one module to enforce boundary and auth consistency.

3. **Replace fixed 5s interval polling with backoff-based retry strategy.**
   - Current constant interval is acceptable for MVP but does not distinguish “starting” vs “offline” and can feel noisy.

4. **Implement graceful discovery/runtime-file error messaging.**
   - Missing/invalid runtime metadata should produce a dedicated user-facing error state instead of generic disconnected status.

## 3) Nice-to-haves

1. **Add a dedicated connection panel on Dashboard.**
   - Include: discovery source, resolved daemon URL, last successful health timestamp, last auth refresh.

2. **Add minimal UI smoke tests for shell routes and connection-state rendering.**
   - This would protect Phase 1 shell against regressions like malformed JSX and missing status states.

3. **Show explicit placeholder value for current project in status bar.**
   - Spec asks for current project placeholder; currently it renders only when a real value exists.

