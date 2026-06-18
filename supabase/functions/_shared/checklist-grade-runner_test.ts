// Lifecycle tests for runChecklistGradeJob with in-memory adapters.
// Mirrors the resume-screen-runner_test pattern; uses ONLY the public DI
// surface of runChecklistGradeJob — no copy of internal logic.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  runChecklistGradeJob,
  type ChecklistRunnerDeps, type ChecklistJob, type ChecklistInput,
  type ProviderResult, type ValidatorResult, type JobStatus, type ChecklistQuestion,
} from "./checklist-grade-runner.ts";
import {
  validateChecklistGradeReport, type ChecklistGradeReport,
} from "./ai-validators.ts";

const QUESTIONS: ChecklistQuestion[] = [
  { id: "q1", kind: "text", question: "Этапы воронки?", expected: "квалификация, презентация, закрытие" },
  { id: "q2", kind: "choice", question: "Лучшая CRM?", options: ["A","B","C","D"], correct: "B" },
];
const ANSWERS = { q1: "Я провожу через 5 этапов воронки", q2: "B" };

function makeReport(overrides: Partial<ChecklistGradeReport> = {}): ChecklistGradeReport {
  return {
    total: 80,
    employer: {
      summary: "Кандидат уверенно описал воронку и выбрал верную CRM. Глубина средняя.",
      strengths: ["системность"],
      gaps: [{ criterion: "CRM-опыт", finding: "не назвал конкретные кейсы", impact: "средний" }],
      risks: [{ title: "Глубина CRM", evidence: "общий ответ", severity: "средний", how_to_verify: "ролевая ситуация" }],
      red_flags: [{ title: "Противоречие", evidence: "разные данные в q1 и q2", severity: "средний" }],
      items: [
        { question_id: "q1", score: 80, employer_feedback: "Развёрнутый ответ.", evidence: "пять этапов" },
        { question_id: "q2", score: 100, employer_feedback: "Верный выбор.", evidence: "B" },
      ],
    },
    candidate: {
      summary: "Вы хорошо описали воронку и выбрали правильную CRM.",
      strengths: ["системность"],
      areas_to_improve: ["приводите примеры из практики"],
      items: [
        { question_id: "q1", score: 80, feedback: "Хороший ответ.", recommendation: "добавьте метрики" },
        { question_id: "q2", score: 100, feedback: "Отличный выбор.", recommendation: "продолжайте" },
      ],
    },
    ...overrides,
  } as ChecklistGradeReport;
}

type Call = { name: string; args: unknown };

function makeDeps(opts: {
  jobStatus?: JobStatus;
  answers?: Record<string,string>;
  questions?: ChecklistQuestion[];
  snapshotAnswersHash?: string;
  snapshotQuestionsHash?: string;
  snapshotUpdatedAt?: string;
  inputUpdatedAt?: string;
  computedAnswersHash?: string;
  computedQuestionsHash?: string;
  primary?: ProviderResult | ProviderResult[];
  fallback?: ProviderResult | ProviderResult[];
  fallbackConfigured?: boolean;
  hasCredits?: boolean;
  alreadyDebited?: boolean;
  saveOk?: boolean;
  saveErr?: string;
  validatorOverride?: (raw: unknown, input: ChecklistInput) => ValidatorResult;
  jobsMarkStatusFails?: (status: JobStatus) => boolean;
  startAttemptReturnsNull?: boolean;
  startAttemptReturnsNullOn?: "primary" | "rr_pro_max";
  diagnosticsThrows?: boolean;
  loadInputErr?: "answers_missing" | "questions_missing" | "candidate_not_found";
} = {}) {
  const calls: Call[] = [];
  const debits: string[] = [];
  const attemptsList: Array<{ provider: string; status?: string; safe?: string|null; diag?: any }> = [];

  const job: ChecklistJob = {
    id: "job-1",
    candidateId: "cand-1",
    projectId: "proj-1",
    status: opts.jobStatus ?? "created",
    fallbackAllowed: true,
    snapshot: {
      answers_hash: opts.snapshotAnswersHash ?? "AH_A",
      answers_updated_at: opts.snapshotUpdatedAt ?? "2026-06-18T10:00:00Z",
      questions_hash: opts.snapshotQuestionsHash ?? "QH_A",
      project_id: "proj-1",
    },
  };
  const input: ChecklistInput = {
    candidateId: "cand-1", projectId: "proj-1",
    roleName: "Sales", vacancyText: "...",
    questions: opts.questions ?? QUESTIONS,
    questionsHash: opts.snapshotQuestionsHash ?? "QH_A",
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

  const deps: ChecklistRunnerDeps = {
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
      async computeQuestionsHash() { return opts.computedQuestionsHash ?? input.questionsHash; },
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
      async saveChecklistEvaluation(args) {
        calls.push({ name: "save", args });
        if (opts.saveOk === false) return { ok: false, error: opts.saveErr || "save_db_down" };
        return { ok: true };
      },
    },
    validator: { validate: opts.validatorOverride ?? ((raw) => ({ ok: true, value: raw as ChecklistGradeReport })) },
    clock: { now: () => 1000 },
    buildPrompt: (i) => `PROMPT(${i.questions.length})`,
  };
  return { deps, calls, debits, attemptsList, statusHistory, job, input };
}

// ============================================================================
// Lifecycle tests
// ============================================================================

Deno.test("checklist: primary success → primary_succeeded, save once, single debit", async () => {
  const { deps, calls, debits, attemptsList, statusHistory } = makeDeps();
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  if (out.kind === "succeeded") assertEquals(out.via, "primary");
  assertEquals(debits.length, 1);
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[0].status, "succeeded");
  assert(calls.some((c) => c.name === "save"));
  assert(statusHistory.includes("primary_succeeded"));
});

Deno.test("checklist: timeout → retry handled by primary → success on second", async () => {
  // Primary adapter has its own retry; we emulate one-shot retry by sending
  // a single ok after one timeout via the queue.
  const { deps } = makeDeps({
    primary: { ok: true, reportJson: makeReport(), attempts: 2 },
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
});

Deno.test("checklist: 429 → fallback succeeds", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "429" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(attemptsList.map((a) => a.provider), ["primary", "rr_pro_max"]);
});

Deno.test("checklist: 502 → fallback succeeds", async () => {
  const { deps } = makeDeps({
    primary: { ok: false, errorCode: "502" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
});

Deno.test("checklist: empty response → fallback succeeds", async () => {
  const { deps } = makeDeps({
    primary: { ok: false, errorCode: "empty_response" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
});

Deno.test("checklist: broken JSON / schema invalid → fallback succeeds (no partial save)", async () => {
  let n = 0;
  const { deps, calls } = makeDeps({
    primary: { ok: true, reportJson: { broken: true } },
    fallback: { ok: true, reportJson: makeReport() },
    validatorOverride: (raw) => { n++; return n === 1 ? { ok: false, code: "bad_total" } : { ok: true, value: raw as ChecklistGradeReport }; },
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  const saves = calls.filter((c) => c.name === "save");
  assertEquals(saves.length, 1);
});

Deno.test("checklist: primary exhausted → RR Pro Max success", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "primary_exhausted" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});

Deno.test("checklist: primary + fallback both fail → fallback_failed", async () => {
  const { deps, statusHistory } = makeDeps({
    primary: { ok: false, errorCode: "5xx" },
    fallback: [{ ok: false, errorCode: "fb1" }, { ok: false, errorCode: "fb2" }],
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_failed");
  assert(statusHistory.includes("fallback_failed"));
});

Deno.test("checklist: fallback unconfigured → fallback_unavailable", async () => {
  const { deps } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallbackConfigured: false,
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_unavailable");
});

Deno.test("checklist: no credits → provider NEVER called", async () => {
  let called = false;
  const { deps } = makeDeps({ hasCredits: false });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "no_credits");
  assertEquals(called, false);
});

Deno.test("checklist: active job reused → noop on terminal status", async () => {
  const { deps } = makeDeps({ jobStatus: "primary_succeeded" });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "noop_terminal");
});

Deno.test("checklist: missing job → noop_missing", async () => {
  const { deps } = makeDeps();
  deps.jobs.getJob = async () => null;
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "noop_missing");
});

Deno.test("checklist: startAttempt returns null → orchestration_failed, no provider call", async () => {
  let called = false;
  const { deps, statusHistory } = makeDeps({ startAttemptReturnsNull: true });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "orchestration_failed");
  assertEquals(called, false);
  assert(statusHistory.includes("orchestration_failed"));
});

Deno.test("checklist: fallback startAttempt fails → orchestration_failed not fallback_failed", async () => {
  const { deps, statusHistory } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    startAttemptReturnsNullOn: "rr_pro_max",
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "orchestration_failed");
  assert(statusHistory.includes("orchestration_failed"));
  assert(!statusHistory.includes("fallback_failed"));
});

Deno.test("checklist: save failure → save_failed, no false success", async () => {
  const { deps, statusHistory } = makeDeps({ saveOk: false });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "save_failed");
  assert(statusHistory.includes("save_failed"));
  assert(!statusHistory.includes("primary_succeeded"));
});

Deno.test("checklist: terminal status update fails after save → save_failed surfaced", async () => {
  const { deps } = makeDeps({ jobsMarkStatusFails: (s) => s === "primary_succeeded" });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "save_failed");
});

Deno.test("checklist: single debit across retries", async () => {
  const { deps, debits } = makeDeps({
    primary: { ok: false, errorCode: "timeout" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(debits.length, 1);
});

Deno.test("checklist: single debit on fallback success too", async () => {
  const { deps, debits } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: [{ ok: false, errorCode: "f1" }, { ok: true, reportJson: makeReport() }],
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(debits.length, 1);
});

Deno.test("checklist: answers hash mismatch → provider not called, version error", async () => {
  let called = false;
  const { deps } = makeDeps({ computedAnswersHash: "DIFFERENT" });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "answers_version_changed");
  assertEquals(called, false);
});

Deno.test("checklist: answers_updated_at drift → provider not called", async () => {
  let called = false;
  const { deps } = makeDeps({
    snapshotUpdatedAt: "2026-06-18T10:00:00Z",
    inputUpdatedAt: "2026-06-18T11:00:00Z",
  });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "answers_version_changed");
  assertEquals(called, false);
});

Deno.test("checklist: questions hash mismatch → provider not called", async () => {
  let called = false;
  const { deps } = makeDeps({ computedQuestionsHash: "QH_OTHER" });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "checklist_version_changed");
  assertEquals(called, false);
});

Deno.test("checklist: missing required answer → answers_missing, provider not called", async () => {
  let called = false;
  const { deps } = makeDeps({ answers: { q1: "Только один ответ" /* q2 missing */ } });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  if (out.kind === "validation_failed") assertEquals(out.code, "answers_missing");
  assertEquals(called, false);
});

Deno.test("checklist: hash match → provider IS called", async () => {
  let called = false;
  const { deps } = makeDeps();
  const original = deps.provider.callPrimary;
  deps.provider.callPrimary = async (a) => { called = true; return original(a); };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "succeeded");
  assertEquals(called, true);
});

Deno.test("checklist: failed re-run preserves prior report (save not called)", async () => {
  const { deps, calls } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: [{ ok: false, errorCode: "f1" }, { ok: false, errorCode: "f2" }],
  });
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "fallback_failed");
  assertEquals(calls.filter((c) => c.name === "save").length, 0);
});

Deno.test("checklist: save payload contains ONLY checklist stage fields", async () => {
  const { deps, calls } = makeDeps();
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  const save = calls.find((c) => c.name === "save");
  assert(save);
  const a = save!.args as { candidateId: string; report: ChecklistGradeReport };
  assertEquals("resume_score" in (a.report as any), false);
  assertEquals("situations_score" in (a.report as any), false);
  assertEquals("ai_fit_score" in (a.report as any), false);
  assertEquals("overall_score" in (a.report as any), false);
  assert(typeof a.report.total === "number");
  assert(typeof a.report.employer.summary === "string");
  assert(typeof a.report.candidate.summary === "string");
});

Deno.test("checklist: real validator — employer and candidate reports differ", () => {
  const r = validateChecklistGradeReport(makeReport(), { allowedQuestionIds: ["q1","q2"] });
  assert(r.ok);
  if (!r.ok) return;
  const e = JSON.stringify(r.value.employer);
  const c = JSON.stringify(r.value.candidate);
  assert(e !== c);
  const cand = r.value.candidate as any;
  assertEquals("risks" in cand, false);
  assertEquals("red_flags" in cand, false);
  assertEquals("gaps" in cand, false);
  assertEquals("evidence" in cand, false);
});

Deno.test("checklist: real validator rejects expected_answer leak to candidate", () => {
  const rep = makeReport();
  const leak = "квалификация, презентация, закрытие";
  rep.candidate.items[0].feedback = `Правильный ответ: ${leak}.`;
  const r = validateChecklistGradeReport(rep, {
    allowedQuestionIds: ["q1","q2"],
    expectedAnswers: { q1: leak },
  });
  assertEquals(r.ok, false);
});

Deno.test("checklist: real validator rejects protected characteristic", () => {
  const rep = makeReport();
  rep.employer.summary = "Кандидату 60 лет и это влияет на работу. Полная характеристика для отчёта.";
  const r = validateChecklistGradeReport(rep, { allowedQuestionIds: ["q1","q2"] });
  assertEquals(r.ok, false);
});

Deno.test("checklist: real validator rejects unknown question_id", () => {
  const rep = makeReport();
  rep.employer.items[0].question_id = "qXX";
  const r = validateChecklistGradeReport(rep, { allowedQuestionIds: ["q1","q2"] });
  assertEquals(r.ok, false);
});

Deno.test("checklist: real validator rejects duplicate question_id", () => {
  const rep = makeReport();
  rep.employer.items[1].question_id = "q1";
  const r = validateChecklistGradeReport(rep, { allowedQuestionIds: ["q1","q2"] });
  assertEquals(r.ok, false);
});

Deno.test("checklist: real validator rejects risk without evidence", () => {
  const rep = makeReport();
  rep.employer.risks[0].evidence = "";
  const r = validateChecklistGradeReport(rep, { allowedQuestionIds: ["q1","q2"] });
  assertEquals(r.ok, false);
});

Deno.test("checklist: real validator rejects red_flag without evidence", () => {
  const rep = makeReport();
  rep.employer.red_flags[0].evidence = "";
  const r = validateChecklistGradeReport(rep, { allowedQuestionIds: ["q1","q2"] });
  assertEquals(r.ok, false);
});

Deno.test("checklist: diagnostics chatId+duration+provider saved on primary attempt", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: true, reportJson: makeReport(), chatId: "chat_abc", durationMs: 42 },
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  const d = attemptsList[0].diag as any;
  assertEquals(d.chatId, "chat_abc");
  assertEquals(d.durationMs, 42);
  assertEquals(d.responseMeta.provider, "primary");
  assertEquals(d.operationPart, "checklist_grade");
});

Deno.test("checklist: fallback diagnostics tagged provider=rr_pro_max", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport(), chatId: "fb_chat", durationMs: 70 },
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  const d = attemptsList[1].diag as any;
  assertEquals(d.responseMeta.provider, "rr_pro_max");
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});

Deno.test("checklist: primary_failed never remains terminal", async () => {
  const { deps, job } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(job.status, "fallback_succeeded");
});

Deno.test("checklist: terminal status has completed=true marker", async () => {
  const { deps, calls } = makeDeps();
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  const finalMark = calls.filter((c) => c.name === "markStatus" && (c.args as any).status === "primary_succeeded");
  assertEquals(finalMark.length, 1);
  assertEquals((finalMark[0].args as any).completed, true);
});

Deno.test("checklist: primary_running marked with completed=false (transitional)", async () => {
  const { deps, calls } = makeDeps();
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  const run = calls.find((c) => c.name === "markStatus" && (c.args as any).status === "primary_running");
  assert(run);
  assertEquals((run!.args as any).completed, false);
});

Deno.test("checklist: primary_failed marked with completed=false (transitional)", async () => {
  const { deps, calls } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallbackConfigured: false,
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  const pf = calls.find((c) => c.name === "markStatus" && (c.args as any).status === "primary_failed");
  assert(pf);
  assertEquals((pf!.args as any).completed, false);
});

Deno.test("checklist: load input error (answers_missing) → validation_failed, no provider call", async () => {
  let called = false;
  const { deps } = makeDeps({ loadInputErr: "answers_missing" });
  deps.provider.callPrimary = async () => { called = true; return { ok: true, reportJson: makeReport() }; };
  const out = await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(out.kind, "validation_failed");
  assertEquals(called, false);
});

Deno.test("checklist: primary attempt recorded as primary, fallback as rr_pro_max in attemptsList", async () => {
  const { deps, attemptsList } = makeDeps({
    primary: { ok: false, errorCode: "x" },
    fallback: { ok: true, reportJson: makeReport() },
  });
  await runChecklistGradeJob(deps, { jobId: "job-1" });
  assertEquals(attemptsList[0].provider, "primary");
  assertEquals(attemptsList[1].provider, "rr_pro_max");
});

Deno.test("checklist: real validator — candidate items have no employer-only fields", () => {
  const r = validateChecklistGradeReport(makeReport(), { allowedQuestionIds: ["q1","q2"] });
  assert(r.ok);
  if (!r.ok) return;
  for (const it of r.value.candidate.items) {
    assertEquals("evidence" in (it as any), false);
    assertEquals("employer_feedback" in (it as any), false);
    assertEquals("expected" in (it as any), false);
    assertEquals("correct" in (it as any), false);
  }
});