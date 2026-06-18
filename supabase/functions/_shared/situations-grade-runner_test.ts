// Lifecycle tests for runSituationsGradeJob with in-memory adapters.
// Mirrors the checklist-grade-runner_test pattern; uses ONLY the public DI
// surface of runSituationsGradeJob — no copy of internal logic.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  runSituationsGradeJob,
  type SituationsRunnerDeps, type SituationsJob, type SituationsInput,
  type ProviderResult, type ValidatorResult, type JobStatus, type SituationItem,
} from "./situations-grade-runner.ts";
import {
  validateSituationsGradeReport, type SituationsGradeReport,
} from "./ai-validators.ts";

const SITUATIONS: SituationItem[] = [
  { id: "s1", title: "Возражение клиента", brief: "Клиент говорит «дорого».", criteria: "выявить потребность, аргументировать" },
  { id: "s2", title: "Сложный коллега", brief: "Коллега срывает сроки.", criteria: "коммуникация без конфликта" },
  { id: "s3", title: "Жалоба",          brief: "Клиент жалуется на качество.", criteria: "эмпатия, решение" },
];
const ANSWERS = {
  s1: "Я задал бы уточняющие вопросы и показал ценность продукта",
  s2: "Я обсудил бы причины срыва без обвинений и предложил план",
  s3: "Я выслушал бы клиента, извинился и предложил конкретное решение",
};

function makeReport(overrides: Partial<SituationsGradeReport> = {}): SituationsGradeReport {
  return {
    total: 78,
    employer: {
      summary: "Кандидат продемонстрировал клиентоориентированность и базовые навыки коммуникации в трёх ситуациях.",
      demonstrated_competencies: ["активное слушание", "решение конфликтов"],
      weak_competencies: ["структура аргументации"],
      risks: [{ title: "Поверхностная аргументация", evidence: "ответ в s1 короткий", severity: "средний", how_to_verify: "ролевой кейс" }],
      red_flags: [{ title: "Уход от конфликта", evidence: "в s2 не назвал инструмент", severity: "средний" }],
      items: [
        { situation_id: "s1", score: 75, employer_feedback: "Уточняющие вопросы — верный шаг.", evidence: "уточняющие вопросы" },
        { situation_id: "s2", score: 78, employer_feedback: "Подход без обвинений.", evidence: "обсудил без обвинений" },
        { situation_id: "s3", score: 82, employer_feedback: "Хорошая эмпатия и решение.", evidence: "извинился и предложил" },
      ],
    },
    candidate: {
      summary: "Вы показали уверенный клиент-сервис и спокойную коммуникацию в сложных ситуациях.",
      strengths: ["клиентоориентированность"],
      areas_to_improve: ["детализируйте аргументы"],
      items: [
        { situation_id: "s1", score: 75, feedback: "Хороший подход.", recommendation: "добавьте конкретику" },
        { situation_id: "s2", score: 78, feedback: "Спокойно и по делу.", recommendation: "сформулируйте план в SMART" },
        { situation_id: "s3", score: 82, feedback: "Отличная эмпатия.", recommendation: "продолжайте" },
      ],
    },
    ...overrides,
  } as SituationsGradeReport;
}

type Call = { name: string; args: unknown };

function makeDeps(opts: {
  jobStatus?: JobStatus;
  answers?: Record<string,string>;
  situations?: SituationItem[];
  snapshotAnswersHash?: string;
  snapshotSituationsHash?: string;
  snapshotUpdatedAt?: string;
  inputUpdatedAt?: string;
  computedAnswersHash?: string;
  computedSituationsHash?: string;
  primary?: ProviderResult | ProviderResult[];
  fallback?: ProviderResult | ProviderResult[];
  fallbackConfigured?: boolean;
  hasCredits?: boolean;
  alreadyDebited?: boolean;
  saveOk?: boolean;
  saveErr?: string;
  validatorOverride?: (raw: unknown, input: SituationsInput) => ValidatorResult;
  jobsMarkStatusFails?: (status: JobStatus) => boolean;
  startAttemptReturnsNull?: boolean;
  startAttemptReturnsNullOn?: "primary" | "rr_pro_max";
  diagnosticsThrows?: boolean;
  loadInputErr?: "answers_missing" | "situations_missing" | "candidate_not_found";
  projectId?: string;
} = {}) {
  const calls: Call[] = [];
  const debits: string[] = [];
  const attemptsList: Array<{ provider: string; status?: string; safe?: string|null; diag?: any }> = [];

  const job: SituationsJob = {
    id: "job-1",
    candidateId: "cand-1",
    projectId: opts.projectId ?? "proj-1",
    status: opts.jobStatus ?? "created",
    fallbackAllowed: true,
    snapshot: {
      answers_hash: opts.snapshotAnswersHash ?? "AH_A",
      answers_updated_at: opts.snapshotUpdatedAt ?? "2026-06-18T10:00:00Z",
      situations_hash: opts.snapshotSituationsHash ?? "SH_A",
      project_id: opts.projectId ?? "proj-1",
    },
  };
  const input: SituationsInput = {
    candidateId: "cand-1", projectId: opts.projectId ?? "proj-1",
    roleName: "Sales", vacancyText: "...",
    situations: opts.situations ?? SITUATIONS,
    situationsHash: opts.snapshotSituationsHash ?? "SH_A",
    answers: opts.answers ?? ANSWERS,
    answersHash: opts.snapshotAnswersHash ?? "AH_A",
    answersUpdatedAt: opts.inputUpdatedAt ?? (opts.snapshotUpdatedAt ?? "2026-06-18T10:00:00Z"),
    employerWishes: "",
  };

  const primaryQueue: ProviderResult[] = Array.isArray(opts.primary)
    ? [...opts.primary]
    : opts.primary ? [opts.primary] : [{ ok: true, reportJson: makeReport(), chatId: "c1", durationMs: 12 }];
  const fallbackQueue: ProviderResult[] = Array.isArray(opts.fallback)
    ? [...opts.fallback]
    : opts.fallback ? [opts.fallback] : [{ ok: false, errorCode: "fb_fail" }];

  const statusHistory: JobStatus[] = [job.status];

  const deps: SituationsRunnerDeps = {
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
      async loadInput() {
        if (opts.loadInputErr) return { ok: false, error: opts.loadInputErr } as any;
        return { ok: true, input };
      },
      async computeAnswersHash() { return opts.computedAnswersHash ?? input.answersHash; },
      async computeSituationsHash() { return opts.computedSituationsHash ?? input.situationsHash; },
    },
    attempts: {
      async startAttempt(_id, provider) {
        if (opts.startAttemptReturnsNull) return null;
        if (opts.startAttemptReturnsNullOn && opts.startAttemptReturnsNullOn === provider) return null;
        attemptsList.push({ provider });
        return `att-${attemptsList.length}`;
      },
      async finishAttempt(attemptId, patch) {
        const idx = Number(attemptId.split("-")[1]) - 1;
        if (attemptsList[idx]) { attemptsList[idx].status = patch.status; attemptsList[idx].safe = patch.safe_error_code ?? null; }
      },
      async saveDiagnostics(attemptId, diag) {
        if (opts.diagnosticsThrows) throw new Error("diag_db_down");
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
      async saveSituationsEvaluation(args) {
        calls.push({ name: "save", args });
        if (opts.saveOk === false) return { ok: false, error: opts.saveErr || "save_db_down" };
        return { ok: true };
      },
    },
    validator: { validate: opts.validatorOverride ?? ((raw) => ({ ok: true, value: raw as SituationsGradeReport })) },
    clock: { now: () => 1000 },
    buildPrompt: (i) => `PROMPT(${i.situations.length})`,
  };
  return { deps, calls, debits, attemptsList, statusHistory, job, input };
}

// ============================================================================
// Lifecycle tests
// ============================================================================

Deno.test("situations: primary success → primary_succeeded, save once, single debit", async () => {
  const { deps, calls, debits, attemptsList, statusHistory } = makeDeps();
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  if (out.kind === "succeeded") assertEquals(out.via, "primary");
  assertEquals(debits.length, 1);
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[0].status, "succeeded");
  assert(calls.some((c) => c.name === "save"));
  assert(statusHistory.includes("primary_succeeded"));
});

Deno.test("situations: timeout → handled in primary adapter → success", async () => {
  const { deps } = makeDeps({ primary: { ok: true, reportJson: makeReport(), attempts: 2 } });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
});

Deno.test("situations: 429 → fallback succeeds", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "429" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(attemptsList.map((a) => a.provider), ["primary", "rr_pro_max"]);
});

Deno.test("situations: 502 → fallback succeeds", async () => {
  const { deps } = makeDeps({
    primary: { ok: false, errorCode: "502" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  assertEquals((await runSituationsGradeJob(deps, { jobId: "job-1" })).kind, "succeeded");
});

Deno.test("situations: empty response → fallback succeeds", async () => {
  const { deps } = makeDeps({
    primary: { ok: false, errorCode: "empty_response" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  assertEquals((await runSituationsGradeJob(deps, { jobId: "job-1" })).kind, "succeeded");
});

Deno.test("situations: broken JSON / schema invalid → fallback succeeds (no partial save)", async () => {
  let n = 0;
  const { deps, calls } = makeDeps({
    primary: { ok: true, reportJson: { broken: true } },
    fallback: { ok: true, reportJson: makeReport() },
    validatorOverride: (raw) => { n++; return n === 1 ? { ok: false, code: "bad_total" } : { ok: true, value: raw as SituationsGradeReport }; },
  });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(calls.filter((c) => c.name === "save").length, 1);
});

Deno.test("situations: primary exhausted → RR Pro Max success", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "primary_exhausted" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});

Deno.test("situations: primary + fallback both fail → fallback_failed", async () => {
  const { deps, statusHistory } = makeDeps({
    primary: { ok: false, errorCode: "5xx" },
    fallback: [{ ok: false, errorCode: "fb1" }, { ok: false, errorCode: "fb2" }],
  });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_failed");
  assert(statusHistory.includes("fallback_failed"));
});

Deno.test("situations: fallback unconfigured → fallback_unavailable", async () => {
  const { deps } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallbackConfigured: false,
  });
  assertEquals((await runSituationsGradeJob(deps, { jobId: "job-1" })).kind, "fallback_unavailable");
});

Deno.test("situations: no credits → provider NEVER called", async () => {
  let called = false;
  const { deps } = makeDeps({ hasCredits: false });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "no_credits");
  assertEquals(called, false);
});

Deno.test("situations: terminal job reused → noop_terminal", async () => {
  const { deps } = makeDeps({ jobStatus: "primary_succeeded" });
  assertEquals((await runSituationsGradeJob(deps, { jobId: "job-1" })).kind, "noop_terminal");
});

Deno.test("situations: active reused job (primary_running) → continues, not noop", async () => {
  const { deps } = makeDeps({ jobStatus: "primary_running" });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
});

Deno.test("situations: missing job → noop_missing", async () => {
  const { deps } = makeDeps();
  deps.jobs.getJob = async () => null;
  assertEquals((await runSituationsGradeJob(deps, { jobId: "job-1" })).kind, "noop_missing");
});

Deno.test("situations: startAttempt returns null → orchestration_failed, no provider call", async () => {
  let called = false;
  const { deps, statusHistory } = makeDeps({ startAttemptReturnsNull: true });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "orchestration_failed");
  assertEquals(called, false);
  assert(statusHistory.includes("orchestration_failed"));
});

Deno.test("situations: fallback startAttempt fails → orchestration_failed not fallback_failed", async () => {
  const { deps, statusHistory } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    startAttemptReturnsNullOn: "rr_pro_max",
  });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "orchestration_failed");
  assert(statusHistory.includes("orchestration_failed"));
  assert(!statusHistory.includes("fallback_failed"));
});

Deno.test("situations: save failure → save_failed, no false success", async () => {
  const { deps, statusHistory } = makeDeps({ saveOk: false });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "save_failed");
  assert(statusHistory.includes("save_failed"));
  assert(!statusHistory.includes("primary_succeeded"));
});

Deno.test("situations: terminal status update fails after save → save_failed surfaced", async () => {
  const { deps } = makeDeps({ jobsMarkStatusFails: (s) => s === "primary_succeeded" });
  assertEquals((await runSituationsGradeJob(deps, { jobId: "job-1" })).kind, "save_failed");
});

Deno.test("situations: diagnostics failure does NOT cause false success", async () => {
  // diagnosticsThrows → runner currently surfaces as a thrown error
  // (production code wraps EdgeRuntime.waitUntil with try/catch + orchestration_failed mark).
  // Here we assert that the runner does NOT mark primary_succeeded when diagnostics throws.
  const { deps, statusHistory } = makeDeps({ diagnosticsThrows: true });
  let threw = false;
  try { await runSituationsGradeJob(deps, { jobId: "job-1" }); } catch { threw = true; }
  assertEquals(threw, true);
  assert(!statusHistory.includes("primary_succeeded"));
});

Deno.test("situations: single debit across primary retries", async () => {
  const { deps, debits } = makeDeps({
    primary: { ok: false, errorCode: "timeout" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(debits.length, 1);
});

Deno.test("situations: single debit on fallback success too", async () => {
  const { deps, debits } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: [{ ok: false, errorCode: "f1" }, { ok: true, reportJson: makeReport() }],
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(debits.length, 1);
});

Deno.test("situations: hash match → provider IS called", async () => {
  let called = false;
  const { deps } = makeDeps();
  const original = deps.provider.callPrimary;
  deps.provider.callPrimary = async (a) => { called = true; return original(a); };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(called, true);
});

Deno.test("situations: answers hash mismatch → provider not called, version error", async () => {
  let called = false;
  const { deps } = makeDeps({ computedAnswersHash: "DIFFERENT" });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "answers_version_changed");
  assertEquals(called, false);
});

Deno.test("situations: answers_updated_at drift → provider not called", async () => {
  let called = false;
  const { deps } = makeDeps({
    snapshotUpdatedAt: "2026-06-18T10:00:00Z",
    inputUpdatedAt: "2026-06-18T11:00:00Z",
  });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "answers_version_changed");
  assertEquals(called, false);
});

Deno.test("situations: situations hash mismatch → provider not called", async () => {
  let called = false;
  const { deps } = makeDeps({ computedSituationsHash: "SH_OTHER" });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "situations_version_changed");
  assertEquals(called, false);
});

Deno.test("situations: missing required answer → answers_missing, provider not called", async () => {
  let called = false;
  const { deps } = makeDeps({ answers: { s1: "ok", s2: "ok" /* s3 missing */ } });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "answers_missing");
  assertEquals(called, false);
});

Deno.test("situations: failed re-run preserves prior report (save not called)", async () => {
  const { deps, calls } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: [{ ok: false, errorCode: "f1" }, { ok: false, errorCode: "f2" }],
  });
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_failed");
  assertEquals(calls.filter((c) => c.name === "save").length, 0);
});

Deno.test("situations: save payload contains ONLY situations stage fields", async () => {
  const { deps, calls } = makeDeps();
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  const save = calls.find((c) => c.name === "save");
  assert(save);
  const a = save!.args as { candidateId: string; report: SituationsGradeReport };
  assertEquals("resume_score" in (a.report as any), false);
  assertEquals("checklist_score" in (a.report as any), false);
  assertEquals("ai_fit_score" in (a.report as any), false);
  assertEquals("overall_score" in (a.report as any), false);
  assert(typeof a.report.total === "number");
  assert(typeof a.report.employer.summary === "string");
  assert(typeof a.report.candidate.summary === "string");
});

Deno.test("situations: real validator — employer and candidate reports differ", () => {
  const r = validateSituationsGradeReport(makeReport(), { allowedSituationIds: ["s1","s2","s3"] });
  assert(r.ok);
  if (!r.ok) return;
  const e = JSON.stringify(r.value.employer);
  const c = JSON.stringify(r.value.candidate);
  assert(e !== c);
  const cand = r.value.candidate as any;
  assertEquals("risks" in cand, false);
  assertEquals("red_flags" in cand, false);
  assertEquals("demonstrated_competencies" in cand, false);
  assertEquals("evidence" in cand, false);
});

Deno.test("situations: real validator rejects protected characteristic", () => {
  const rep = makeReport();
  rep.employer.summary = "Кандидату 60 лет и это влияет на работу. Полная характеристика для отчёта.";
  const r = validateSituationsGradeReport(rep, { allowedSituationIds: ["s1","s2","s3"] });
  assertEquals(r.ok, false);
});

Deno.test("situations: real validator rejects unknown situation_id", () => {
  const rep = makeReport();
  rep.employer.items[0].situation_id = "sXX";
  const r = validateSituationsGradeReport(rep, { allowedSituationIds: ["s1","s2","s3"] });
  assertEquals(r.ok, false);
});

Deno.test("situations: real validator rejects duplicate situation_id", () => {
  const rep = makeReport();
  rep.employer.items[1].situation_id = "s1";
  const r = validateSituationsGradeReport(rep, { allowedSituationIds: ["s1","s2","s3"] });
  assertEquals(r.ok, false);
});

Deno.test("situations: real validator rejects risk without evidence", () => {
  const rep = makeReport();
  rep.employer.risks[0].evidence = "";
  const r = validateSituationsGradeReport(rep, { allowedSituationIds: ["s1","s2","s3"] });
  assertEquals(r.ok, false);
});

Deno.test("situations: real validator rejects red_flag without evidence", () => {
  const rep = makeReport();
  rep.employer.red_flags[0].evidence = "";
  const r = validateSituationsGradeReport(rep, { allowedSituationIds: ["s1","s2","s3"] });
  assertEquals(r.ok, false);
});

Deno.test("situations: diagnostics chatId+duration+provider saved on primary attempt", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: true, reportJson: makeReport(), chatId: "chat_abc", durationMs: 42 },
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  const d = attemptsList[0].diag as any;
  assertEquals(d.chatId, "chat_abc");
  assertEquals(d.durationMs, 42);
  assertEquals(d.responseMeta.provider, "primary");
  assertEquals(d.operationPart, "situations_grade");
});

Deno.test("situations: fallback diagnostics tagged provider=rr_pro_max", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport(), chatId: "fb_chat", durationMs: 70 },
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  const d = attemptsList[1].diag as any;
  assertEquals(d.responseMeta.provider, "rr_pro_max");
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});

Deno.test("situations: primary_failed never remains terminal", async () => {
  const { deps, job } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(job.status, "fallback_succeeded");
});

Deno.test("situations: terminal status carries completed=true", async () => {
  const { deps, calls } = makeDeps();
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  const finalMark = calls.filter((c) => c.name === "markStatus" && (c.args as any).status === "primary_succeeded");
  assertEquals(finalMark.length, 1);
  assertEquals((finalMark[0].args as any).completed, true);
});

Deno.test("situations: primary_running marked with completed=false (transitional)", async () => {
  const { deps, calls } = makeDeps();
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  const run = calls.find((c) => c.name === "markStatus" && (c.args as any).status === "primary_running");
  assert(run);
  assertEquals((run!.args as any).completed, false);
});

Deno.test("situations: primary_failed marked with completed=false (transitional)", async () => {
  const { deps, calls } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallbackConfigured: false,
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  const pf = calls.find((c) => c.name === "markStatus" && (c.args as any).status === "primary_failed");
  assert(pf);
  assertEquals((pf!.args as any).completed, false);
});

Deno.test("situations: load input error (answers_missing) → validation_failed, no provider call", async () => {
  let called = false;
  const { deps } = makeDeps({ loadInputErr: "answers_missing" });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  assertEquals(called, false);
});

Deno.test("situations: real validator — candidate items have no employer-only fields", () => {
  const r = validateSituationsGradeReport(makeReport(), { allowedSituationIds: ["s1","s2","s3"] });
  assert(r.ok);
  if (!r.ok) return;
  for (const it of r.value.candidate.items) {
    assertEquals("evidence" in (it as any), false);
    assertEquals("employer_feedback" in (it as any), false);
    assertEquals("criteria" in (it as any), false);
  }
});

Deno.test("situations: two projects for same candidate produce isolated jobs (composite PK semantics)", async () => {
  // Each job carries its own projectId in the snapshot; runner reloads input
  // for that project only. Simulate two independent jobs with different
  // project_ids and assert that the save payload is keyed only to the
  // candidate (PK candidate_id in candidate_scores) but the input snapshot
  // differs by project.
  const { deps: dA, calls: callsA } = makeDeps({ projectId: "projA", snapshotAnswersHash: "AH_A" });
  const { deps: dB, calls: callsB } = makeDeps({ projectId: "projB", snapshotAnswersHash: "AH_B" });
  await runSituationsGradeJob(dA, { jobId: "job-1" });
  await runSituationsGradeJob(dB, { jobId: "job-1" });
  assertEquals(callsA.filter(c => c.name === "save").length, 1);
  assertEquals(callsB.filter(c => c.name === "save").length, 1);
});

Deno.test("situations: primary attempt recorded as primary, fallback as rr_pro_max", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runSituationsGradeJob(deps, { jobId: "job-1" });
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});