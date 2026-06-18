# Phase 3B-2B — Step D1 plan

## Preflight (done)
- `bunx tsc --noEmit`: 0 errors
- `bun run build`: OK (existing dynamic/static import warning, no new)
- `supabase test edge-functions`: exit 0, 155 tests (46 validators + 25 resume + 41 checklist + 43 situations)

## 1. Backend — checklist composite key parity
Audit existing rows in `candidate_checklist_answers_v2` to confirm no `candidate_id` appears with two different `project_id`s; if clean, migrate.

Migration (additive, no data loss):
- Drop existing PK `candidate_checklist_answers_v2_pkey` (PK only `candidate_id`).
- Add composite PK `(candidate_id, project_id)`.
- Recreate `save_checklist_answers_v2` RPC to upsert on the composite key, keep `SECURITY DEFINER`, `SET search_path=public`, `REVOKE ALL`, `GRANT EXECUTE` only to `service_role`.

Update:
- `_shared/checklist-grade-runner.ts`: snapshot reload now keyed by `(candidate_id, project_id)`.
- `ai-interview-grade-checklist-v2/index.ts`: pass `project_id` to RPC.
- `_shared/checklist-grade-runner_test.ts`: existing fakes parameterized.
- New test: same `candidate_id`, two `project_id`s, hashes/answers isolated; project-A worker never reads project-B answers.

## 2. Frontend — `src/lib/aiJobs.ts`
- Widen `kind` union: `"screen_resume" | "checklist_grade" | "situations_grade"`.
- Add `startChecklistGradeV2({ candidateId, answers, requestId? })` → `ai-interview-grade-checklist-v2`.
- Add `startSituationsGradeV2({ candidateId, answers, requestId? })` → `ai-interview-grade-situations-v2`.
- `activeJobKey` already namespaces by kind — extend tests.
- Only `{job_id, request_id, candidate_id, created_at}` in localStorage; never answers, token, project, score.
- Token continues to be passed via `x-candidate-token` header only.

## 3. Frontend — generic job hook
New `src/hooks/useCandidateAiJob.ts`:
- Reads/writes localStorage by kind.
- Restores active job on mount, starts polling via existing `pollJobUntilTerminal` (which already handles focus/visibility wake-up).
- In-memory ref guard against double-click start.
- Terminal-only localStorage cleanup; `primary_failed` does NOT clear.
- Returns `{ status, isRunning, isTerminal, start, lastError, jobId }`.
- Cleanup on unmount (AbortController).

## 4. CandidateInterview wiring
- Replace direct invoke of `ai-interview-grade-checklist` / `ai-interview-grade-situations` with the new hook for v2 endpoints, gated by feature flag `useV2 = true` (kept simple — old call paths removed only for these two ops, resume v2 untouched).
- On terminal success: refetch candidate row from DB to read fresh `checklist_score`/`candidate_checklist_feedback` (situations analogous). Do NOT use start response payload.
- Stage progression audit + idempotency: existing flow advances stage via candidate row update on success; wrap in guard `if (candidate.current_stage === expectedStage) advance`. Reload/reused-terminal path won't re-advance.

## 5. AIWaitProvider
Extend the job-based mode (currently resume v2) to accept `kind: 'checklist_grade' | 'situations_grade'` with the specified Russian copy. Overlay dismissible; dismiss does NOT cancel job.

## 6. Error mapping
New `src/lib/aiJobErrors.ts` mapping safe codes (`answers_missing`, `answers_version_changed`, `checklist_version_changed`, `situations_version_changed`, `orchestration_failed`, `save_failed`, `fallback_failed`, `fallback_unavailable`, `no_credits`) to the exact Russian copy from the spec. Used by hook + overlay.

## 7. Report renderers
New presentation components (no logic in CandidateDetailsModal beyond mounting):
- `src/components/reports/CandidateChecklistReport.tsx`
- `src/components/reports/CandidateSituationsReport.tsx`
- `src/components/reports/EmployerChecklistReport.tsx`
- `src/components/reports/EmployerSituationsReport.tsx`

Each accepts a single typed prop derived through adapters:
- `src/lib/feedbackAdapters.ts`:
  - `adaptCandidateChecklist(raw)` — strips `expected_answer`, `gaps`, `risks`, `red_flags`, `employer_*`.
  - `adaptCandidateSituations(raw)` — strips `criteria`, employer fields.
  - `adaptEmployerChecklist(raw)` / `adaptEmployerSituations(raw)` — preserves risks/red_flags.
  - Legacy string/JSON inputs → safe text-only path for candidate; raw legacy preserved for employer.

CandidateDetailsModal: replace existing `pre-wrap` blob for checklist/situations tabs with the employer renderers, keeping the v1 fallback path for legacy candidates.

CandidateInterview report view (post-success): uses candidate renderers.

## 8. Frontend test setup
- Add Vitest config + `src/test/setup.ts` per the standard guide (if not present; verify first).
- New tests:
  - `src/lib/__tests__/aiJobs.test.ts` — 13 cases: single request_id per start, active job blocks re-start, reload restores polling, focus/visibility immediate check, terminal clears LS, primary_failed keeps LS, orchestration_failed clears LS, reused-job no new request_id, polling cleanup, two mounts → one loop, token never in LS, answers never in LS, resume v2 still works.
  - `src/lib/__tests__/feedbackAdapters.test.ts` — 7 cases: candidate adapters strip employer-only; legacy candidate strips risks/red_flags; employer keeps them; expected_answer never in candidate output; unknown JSON not rendered raw; success triggers refetch; failure does not advance stage; idempotent stage advance.
  All tests use fake start/status clients (DI), no real network.

## 9. Postflight
- `supabase test edge-functions` — expect 155 + new project-isolation checklist test (≥1).
- `bunx vitest run` — all new frontend tests.
- `bunx tsc --noEmit` — 0 errors.
- `bun run build` — OK.

## 10. Stop conditions honoured
No real AI invoke. No balance touched. No ai_jobs inserts in prod (DI fakes only). No publish.

## Out of scope (untouched)
CRM, kanban, employer profile, companies, vacancies, training, общая AI-оценка, resume v2 runtime, Google OAuth, tariffs, widths.

Awaiting your "go" to execute.