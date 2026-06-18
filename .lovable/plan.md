## Phase 3B-2A.1 — Crash-safe resume job, lifecycle tests, safe runtime prep

Goal: make resume v2 worker independent of HTTP closure, add real DI-based lifecycle tests, find a safe test fixture, and prepare (NOT execute) one real paid run. No real AI calls, no debits, no publish, no checklist/situations changes.

---

### 1. Crash-safe orchestration (`ai-interview-screen-resume-v2`)

Refactor the function so the background worker reloads everything from DB by `job_id` only.

- Sync phase:
  1. validate candidate token, project, resume_text length/PII
  2. atomically save `resume_text` + `resume_hash` (full SHA-256 hex) + `resume_updated_at` via new RPC `save_candidate_resume_text` (SECURITY DEFINER, service_role only)
  3. compute `criteria_hash` from project criteria
  4. create job with **minimal** `request_snapshot`:
     ```json
     { "candidate_id", "project_id", "resume_hash", "resume_updated_at", "criteria_hash", "requested_at" }
     ```
  5. return `{ job_id, status, reused, terminal }`
- Background phase: `EdgeRuntime.waitUntil(runResumeJob(jobId))` — receives **only `job_id`**. No closure over `resumeText`, no closure over project/criteria.
- Worker reloads: ai_job → candidate (resume_text, resume_updated_at, resume_hash) → project → criteria → employer wishes.
- Worker recomputes resume_hash; compares with snapshot:
  - hash + version match → run provider
  - resume_text empty → `validation_failed` code `resume_text_missing`, no provider call, no debit, prior report preserved
  - hash/version mismatch → `validation_failed` code `resume_version_changed`, no provider call, no new debit, prior report preserved
- Strict no-leak: resume_text NEVER goes to snapshot, attempts, response_meta, logs, error_message, localStorage.

### 2. Resume version columns (additive migration)

Migration adds (if missing):
- `candidates.resume_hash text`
- `candidates.resume_updated_at timestamptz`
- RPC `save_candidate_resume_text(_candidate uuid, _resume_text text) returns jsonb`
  - SECURITY DEFINER, `SET search_path=public`
  - REVOKE all PUBLIC, GRANT EXECUTE to `service_role` only
  - atomically sets `resume_text`, `resume_hash`, `resume_updated_at = now()`
  - returns `{ ok, resume_hash, resume_updated_at }`
  - touches **only** resume fields

### 3. Status edge function audit (`ai-job-status-candidate-v2`)

Verify and harden:
- input: `{ job_id }` only — ignore any `candidate_id` in body
- require `x-candidate-token`, validate via `requireCandidateToken`
- UUID regex check (already present)
- enforce `job.candidate_id === session.candidate_id` (already present)
- explicit status codes for: invalid_uuid (400), invalid_token (401), expired_token (401), not_found (404), forbidden (403), ok (200)
- CORS: tighten `Access-Control-Allow-Origin` from `*` to an allowlist of current app origins (preview, published, hr-rr.ru, hr-rr.online + localhost dev) — **only for this function** to avoid breaking other endpoints in this pass
- verify_jwt stays false (already correct — candidates have no JWT)

### 4. Extract testable lifecycle service

New file `supabase/functions/_shared/resume-screen-runner.ts` with the interfaces listed in the request:
- `ResumeJobRepository`, `ResumeInputRepository`, `ResumeAttemptRepository`, `ResumeBillingAdapter`, `ResumeProviderAdapter`, `ResumeResultRepository`, `ResumeClock`
- Pure orchestrator `runResumeScreenJob(deps, { jobId })` containing all branching: load → hash check → debit → primary loop with retries → fallback → validate → save → terminal status.
- Production adapters live in `ai-interview-screen-resume-v2/index.ts` and wrap Supabase + ProTalk + RR Pro Max + existing helpers (`debit_ai_job_once`, `save_candidate_resume_evaluation_v2`, `markJobStatusStrict`, `recordAttemptDiagnostics`, validators).
- Other functions (checklist/situations) **not touched** in this pass.

### 5. Real lifecycle tests

New file `supabase/functions/_shared/resume-screen-runner_test.ts` using in-memory fakes for every interface. All 32 scenarios from the request, e.g.:

```text
primary_success, timeout_retry_success, http_429_retry, http_502_retry,
empty_response_retry, broken_json_repair, schema_invalid_retry,
primary_exhausted_fallback_success, both_fail_terminal,
no_credits_skips_provider, reused_request_id_running,
reused_request_id_terminal, new_request_id_new_job,
retry_no_double_debit, concurrent_debit_single_spend,
save_failure_save_failed, status_update_failure_no_false_success,
diagnostics_update_failure_no_false_success,
failed_rerun_preserves_old_report,
resume_save_isolated_from_checklist/situations/overall/ai_fit,
hash_match_calls_provider, hash_mismatch_skips_provider,
empty_resume_skips_provider, candidate_report_no_employer_fields,
red_flag_without_evidence_rejected, protected_chars_rejected,
chat_id_duration_stored, primary_attempt_provider_tag,
fallback_attempt_provider_tag
```

Tests exercise the **actual** `runResumeScreenJob`, not duplicate logic.

Report will show: validator-tests count, lifecycle-tests count, total, and pass/fail per suite separately.

### 6. Billing SQL static review

No real debit. Inspect `debit_ai_job_once`, `spend_pack`, related uniques. Document evidence for:
- row lock on ai_jobs / debit row
- UNIQUE (job_id, charge_kind) → idempotent
- spend_pack failure → debit row rollback in same transaction
- concurrent calls serialize (FOR UPDATE)
- business key `pack:interview:{candidate_id}` so one interview pack = one charge across stages

If gaps found, **report them** — do not change pricing in this pass.

### 7. Safe test-fixture search

SELECT (masked) over `candidates` + `companies` + `projects`:
- name LIKE '%test%'/'%тест%'/'%demo%'
- email domain test/example/demo or +test/+demo
- company name suggesting test
- no recent real activity

For each candidate: `public_id`, masked email (`a***@d***.com`), project_id, company, vacancy, current scores, employer interview credits. Report findings without PII. If nothing safe → recommend creating a dedicated fixture (do NOT auto-create in production).

### 8. Environment identification

Check: which Supabase project ref, whether preview and production share DB, whether v2 functions are live, whether real candidates exist on this DB. Report classification (production / shared-preview / dev).

### 9. Real-run plan (NOT executed)

Written plan only:
- pick the safe fixture from §7
- snapshot before: wallet balance, candidate_scores row, ai_jobs/attempts/debits row counts for that candidate
- single primary call, no forced fallback, max 1 interview credit
- snapshot after, diff
- success criteria & rollback note
- separate fallback test described as **server-side env-flag** (e.g. `RESUME_V2_FORCE_PRIMARY_FAIL` for one specific job_id) — no public param, no public URL, no UI button

### 10. Checks

Run in this order, report each separately:
- `bunx tsc --noEmit`
- `bun run build`
- validator tests: `supabase test edge-functions --filter ai-validators_test`
- lifecycle tests: `supabase test edge-functions --filter resume-screen-runner_test`

### 11. Out of scope

No real ProTalk/RR Pro Max call. No debit. No balance change. No candidate creation. No checklist v2. No situations v2. No training. No overall score. No publish. No extra UX.

### 12. Final report

Will cover every bullet listed in the request: worker source of resume_text, closure usage, hash/version storage, behavior on resume change/missing, status fn audit, CORS allowlist, changed files, migrations, test counts and per-suite results, typecheck, build, debit SQL review, environment type, preview/prod DB sharing, test fixture (public_id + project_id + masked PII), current interview credits, real-run plan, max possible debit, fallback-test plan, and explicit confirmations: no real AI calls, no balance change, checklist/situations untouched, app not published.

---

### Execution order

1. Migration (resume_hash, resume_updated_at, `save_candidate_resume_text` RPC) — needs approval before the worker can use it.
2. Build `resume-screen-runner.ts` + lifecycle tests in parallel with adapter rewrite of `ai-interview-screen-resume-v2/index.ts`.
3. Harden `ai-job-status-candidate-v2` CORS allowlist.
4. Run typecheck + build + both test suites.
5. Read-only DB queries for fixture + environment + billing review.
6. Write final report. Stop. **Do not run a real paid AI call.**
