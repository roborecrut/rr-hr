// Lifecycle tests for runResumeScreenJob with in-memory adapters.
// Run with: deno test --allow-env supabase/functions/_shared/resume-screen-runner_test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  runResumeScreenJob,
  type ResumeRunnerDeps, type ResumeJob, type ResumeInput, type ProviderResult,
  type ValidatorResult, type JobStatus,
} from "./resume-screen-runner.ts";
import type { ResumeScreenReport } from "./ai-validators.ts";

// --------------------------------------------------------------------------
// Fakes
// --------------------------------------------------------------------------

function makeReport(overrides: Partial<ResumeScreenReport> = {}): ResumeScreenReport {
  return {
    score: 77,
    employer: {
      verdict: "частичное соответствие",
      summary: "Достаточно опыта по большинству ключевых требований работодателя. Глубина по части критериев требует проверки на интервью.",
      matches: [{ criterion: "SQL", degree: "полностью", evidence: "Опыт 5 лет (см. опыт работы)" }],
      gaps: [{ criterion: "DWH", finding: "не упомянут", impact: "ограничивает архитектурные задачи" }],
      strengths: ["Опыт BI"],
      risks: [{ title: "Гэп 2022", evidence: "отсутствует подтверждение", severity: "средний", how_to_verify: "уточнить" }],
      red_flags: [],
      questions_to_verify: ["Покажите пример отчёта по продажам"],
    },
    candidate: {
      summary: "Опыт релевантный, есть точки для уточнения на интервью.",
      strengths: ["BI"],
      areas_to_clarify: ["DWH"],
      recommendations: ["Подготовить кейс по DWH"],
    },
    ...overrides,
  } as ResumeScreenReport;
}

type Call = { name: string; args: unknown };

function makeDeps(opts: {
  jobStatus?: JobStatus;
  resumeText?: string;
  resumeUpdatedAt?: string;
  snapshotHash?: string;
  snapshotUpdatedAt?: string;
  primary?: ProviderResult | ProviderResult[];
  fallback?: ProviderResult | ProviderResult[];
  fallbackConfigured?: boolean;
  hasCredits?: boolean;
  alreadyDebited?: boolean;
  saveOk?: boolean;
  saveErr?: string;
  validatorOverride?: (raw: unknown) => ValidatorResult;
  jobsMarkStatusFails?: (status: JobStatus) => boolean;
  startAttemptReturnsNull?: boolean;
} = {}) {
  const calls: Call[] = [];
  const debits: string[] = [];
  const attemptsList: Array<{ provider: string; status?: string; safe?: string|null; diag?: unknown }> = [];

  const job: ResumeJob = {
    id: "job-1",
    candidateId: "cand-1",
    projectId: "proj-1",
    status: opts.jobStatus ?? "created",
    fallbackAllowed: true,
    snapshot: {
      resume_hash: opts.snapshotHash ?? "HASH_A",
      resume_updated_at: opts.snapshotUpdatedAt ?? "2026-06-18T10:00:00Z",
      criteria_hash: "CRIT_A",
      project_id: "proj-1",
    },
  };
  const input: ResumeInput = {
    candidateId: "cand-1", projectId: "proj-1",
    resumeText: opts.resumeText ?? "x".repeat(200),
    resumeHash: opts.snapshotHash ?? "HASH_A",
    resumeUpdatedAt: opts.resumeUpdatedAt ?? (opts.snapshotUpdatedAt ?? "2026-06-18T10:00:00Z"),
    criteria: "SQL, DWH", criteriaHash: "CRIT_A",
    roleName: "Analyst", vacancyText: "...",
  };

  const primaryQueue: ProviderResult[] = Array.isArray(opts.primary)
    ? [...opts.primary]
    : opts.primary ? [opts.primary] : [{ ok: true, reportJson: makeReport(), chatId: "c1", durationMs: 12 }];
  const fallbackQueue: ProviderResult[] = Array.isArray(opts.fallback)
    ? [...opts.fallback]
    : opts.fallback ? [opts.fallback] : [{ ok: false, errorCode: "fb_fail" }];

  let statusHistory: JobStatus[] = [job.status];
  const startAttemptReturnsNull = !!opts.startAttemptReturnsNull;

  const deps: ResumeRunnerDeps = {
    jobs: {
      async getJob() { return job; },
      async markStatus(_id, status, completed) {
        calls.push({ name: "markStatus", args: { status, completed } });
        statusHistory.push(status);
        if (opts.jobsMarkStatusFails?.(status)) return { ok: false, error: "db_down" };
        job.status = status;
        return { ok: true };
      },
    },
    inputs: {
      async loadResumeInput() { return { ok: true, input }; },
      async computeResumeHash(_text) { return opts.resumeText ? "HASH_RECOMPUTED" : "HASH_A"; },
    },
    attempts: {
      async startAttempt(_id, provider) {
        if (startAttemptReturnsNull) return null;
        attemptsList.push({ provider });
        return `att-${attemptsList.length}`;
      },
      async finishAttempt(attemptId, patch) {
        const idx = Number(attemptId.split("-")[1]) - 1;
        if (attemptsList[idx]) { attemptsList[idx].status = patch.status; attemptsList[idx].safe = patch.safe_error_code ?? null; }
      },
      async saveDiagnostics(attemptId, diag) {
        if (attemptId) {
          const idx = Number(attemptId.split("-")[1]) - 1;
          if (attemptsList[idx]) attemptsList[idx].diag = diag;
        }
      },
    },
    billing: {
      async debitOnce(jobId, _cand) {
        debits.push(jobId);
        return { ok: true, already: !!opts.alreadyDebited, hasCredits: opts.hasCredits !== false };
      },
    },
    provider: {
      fallbackConfigured: () => opts.fallbackConfigured !== false,
      async callPrimary() { return primaryQueue.shift() || { ok: false, errorCode: "exhausted" }; },
      async callFallback() { return fallbackQueue.shift() || { ok: false, errorCode: "exhausted" }; },
    },
    results: {
      async saveResumeEvaluation(_args) {
        calls.push({ name: "save", args: _args });
        if (opts.saveOk === false) return { ok: false, error: opts.saveErr || "save_db_down" };
        return { ok: true };
      },
    },
    validator: { validate: opts.validatorOverride ?? ((raw) => ({ ok: true, value: raw as ResumeScreenReport })) },
    clock: { now: () => 1000 },
    buildPrompt: (i) => `PROMPT(${i.resumeText.length})`,
  };
  return { deps, calls, debits, attemptsList, statusHistory, job };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

Deno.test("primary success → primary_succeeded, save called once, single debit", async () => {
  const { deps, calls, debits, attemptsList, statusHistory } = makeDeps();
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  if (out.kind === "succeeded") assertEquals(out.via, "primary");
  assertEquals(debits.length, 1);
  assertEquals(attemptsList.length, 1);
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[0].status, "succeeded");
  assert(calls.some(c => c.name === "save"));
  assert(statusHistory.includes("primary_succeeded"));
});

Deno.test("primary returns invalid JSON → validation fails → fallback path", async () => {
  let n = 0;
  const { deps } = makeDeps({
    primary: { ok: true, reportJson: { not: "report" } },
    fallback: { ok: true, reportJson: makeReport() },
    validatorOverride: (raw) => {
      n++;
      if (n === 1) return { ok: false, code: "bad_score" };
      return { ok: true, value: raw as ResumeScreenReport };
    },
  });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  if (out.kind === "succeeded") assertEquals(out.via, "rr_pro_max");
});

Deno.test("primary network failure → fallback succeeds (fallback_succeeded)", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "timeout" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(attemptsList.map(a => a.provider), ["primary", "rr_pro_max"]);
  assertEquals(attemptsList[0].status, "failed");
  assertEquals(attemptsList[1].status, "succeeded");
});

Deno.test("primary fails, fallback exhausts both attempts → fallback_failed", async () => {
  const { deps, attemptsList, statusHistory } = makeDeps({
    primary: { ok: false, errorCode: "5xx" },
    fallback: [{ ok: false, errorCode: "fb1" }, { ok: false, errorCode: "fb2" }],
  });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_failed");
  assertEquals(attemptsList.length, 3); // 1 primary + 2 fallback
  assert(statusHistory.includes("fallback_failed"));
});

Deno.test("primary fails, fallback not configured → fallback_unavailable", async () => {
  const { deps, statusHistory } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallbackConfigured: false,
  });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_unavailable");
  assert(statusHistory.includes("fallback_unavailable"));
});

Deno.test("no credits → provider NEVER called, job cancelled", async () => {
  let primaryCalled = false;
  const { deps } = makeDeps({ hasCredits: false });
  deps.provider.callPrimary = async () => { primaryCalled = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "no_credits");
  assertEquals(primaryCalled, false);
});

Deno.test("job already terminal (succeeded) → noop, no provider call, no debit", async () => {
  let provCalled = false; let deb = 0;
  const { deps } = makeDeps({ jobStatus: "primary_succeeded" });
  deps.provider.callPrimary = async () => { provCalled = true; return { ok: true, reportJson: makeReport() }; };
  deps.billing.debitOnce = async () => { deb++; return { ok: true, already: true, hasCredits: true }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "noop_terminal");
  assertEquals(provCalled, false);
  assertEquals(deb, 0);
});

Deno.test("job missing → noop_missing", async () => {
  const { deps } = makeDeps();
  deps.jobs.getJob = async () => null;
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "noop_missing");
});

Deno.test("resume_text missing → validation_failed:resume_text_missing, no provider call", async () => {
  let provCalled = false;
  const { deps } = makeDeps({ resumeText: "" });
  deps.provider.callPrimary = async () => { provCalled = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "resume_text_missing");
  assertEquals(provCalled, false);
});

Deno.test("resume hash mismatch → validation_failed:resume_version_changed, no provider", async () => {
  let provCalled = false;
  // computeResumeHash returns HASH_RECOMPUTED when resumeText is set;
  // snapshot hash is HASH_A so they differ → version-changed branch.
  const { deps } = makeDeps({ resumeText: "y".repeat(200) });
  deps.provider.callPrimary = async () => { provCalled = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "resume_version_changed");
  assertEquals(provCalled, false);
});

Deno.test("resume hash matches → provider IS called", async () => {
  // No resumeText override: snapshotHash defaults to HASH_A and
  // computeResumeHash returns HASH_A → match.
  let provCalled = false;
  const { deps } = makeDeps();
  deps.provider.callPrimary = async () => { provCalled = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(provCalled, true);
});

Deno.test("resume_updated_at drift → validation_failed:resume_version_changed", async () => {
  let provCalled = false;
  const { deps } = makeDeps({
    snapshotUpdatedAt: "2026-06-18T10:00:00Z",
    resumeUpdatedAt: "2026-06-18T10:00:05Z", // edited after job created
  });
  deps.provider.callPrimary = async () => { provCalled = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  assertEquals(provCalled, false);
});

Deno.test("save_failed → no false success returned, status=save_failed", async () => {
  const { deps, statusHistory } = makeDeps({ saveOk: false, saveErr: "fk_violation" });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "save_failed");
  assert(statusHistory.includes("save_failed"));
});

Deno.test("terminal status update fails after save → returned as save_failed (no false success)", async () => {
  const { deps } = makeDeps({
    jobsMarkStatusFails: (s) => s === "primary_succeeded",
  });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "save_failed");
});

Deno.test("debit only happens once per run (single startAttempt → single debit)", async () => {
  const { deps, debits } = makeDeps();
  await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(debits.length, 1);
});

Deno.test("retry/fallback do NOT trigger a second debit", async () => {
  const { deps, debits } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(debits.length, 1);
});

Deno.test("startAttempt returns null → primary_failed without provider call or false success", async () => {
  let provCalled = false;
  const { deps, statusHistory } = makeDeps({ startAttemptReturnsNull: true });
  deps.provider.callPrimary = async () => { provCalled = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "primary_failed");
  assertEquals(provCalled, false);
  assert(statusHistory.includes("primary_failed"));
});

Deno.test("diagnostics are recorded for primary attempt (chatId + duration + provider tag)", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: true, reportJson: makeReport(), chatId: "chat-XYZ", durationMs: 999 },
  });
  await runResumeScreenJob(deps, { jobId: "job-1" });
  const diag = attemptsList[0].diag as any;
  assertEquals(diag.chatId, "chat-XYZ");
  assertEquals(diag.durationMs, 999);
  assertEquals((diag.responseMeta as any).provider, "primary");
});

Deno.test("primary attempt recorded as provider=primary, fallback as rr_pro_max", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});

Deno.test("saveResumeEvaluation receives ONLY resume payload (no checklist/situations keys)", async () => {
  const { deps, calls } = makeDeps();
  await runResumeScreenJob(deps, { jobId: "job-1" });
  const save = calls.find(c => c.name === "save");
  assert(save);
  const args = (save!.args as any);
  assert("candidateId" in args);
  assert("report" in args);
  const keys = Object.keys(args);
  assertEquals(keys.sort(), ["candidateId", "report"]);
  // The report itself must contain only employer + candidate + score.
  const rk = Object.keys(args.report).sort();
  assertEquals(rk, ["candidate", "employer", "score"]);
});

Deno.test("failed re-run does not call save (old report on disk is preserved)", async () => {
  const { deps, calls } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: [{ ok: false, errorCode: "y" }, { ok: false, errorCode: "z" }],
  });
  const out = await runResumeScreenJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_failed");
  assertEquals(calls.filter(c => c.name === "save").length, 0);
});

Deno.test("strict validator rejects red_flag without evidence (re-export check)", async () => {
  const { validateResumeScreenReport } = await import("./ai-validators.ts");
  const bad = makeReport({ employer: { ...makeReport().employer, red_flags: [{ title: "T", evidence: "", severity: "высокий" }] as any } });
  const v = validateResumeScreenReport(bad);
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.code, "red_flag_without_evidence");
});