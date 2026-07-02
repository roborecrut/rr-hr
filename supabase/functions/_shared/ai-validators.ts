// Strict validators for AI outputs. Each returns { ok, value } | { ok:false, code }.
// Used by edge functions to reject partial/broken generation BEFORE persisting,
// and to feed schema-failure back into the retry loop (see callProTalkWithRetry).

export type V<T> = { ok: true; value: T } | { ok: false; code: string };

function nonEmpty(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

export type ChoiceQ = { id: string; type: "choice"; question: string; options: string[]; correct: string };
export type TextQ = { id: string; type: "text"; question: string; expected_answer: string };
export type AnyQ = ChoiceQ | TextQ;

/** 10 multiple-choice questions, exactly 4 non-empty options, correct ∈ options. */
export function validateChecklistChoice10(raw: unknown): V<ChoiceQ[]> {
  if (!Array.isArray(raw)) return { ok: false, code: "not_array" };
  if (raw.length !== 10) return { ok: false, code: `expected_10_got_${raw.length}` };
  const out: ChoiceQ[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] as any;
    const id = nonEmpty(it?.id) || `q${i + 1}`;
    if (seen.has(id)) return { ok: false, code: `dup_id_${id}` };
    seen.add(id);
    const question = nonEmpty(it?.question);
    if (!question) return { ok: false, code: `empty_question_${id}` };
    const opts = Array.isArray(it?.options) ? it.options.map(nonEmpty) : [];
    if (opts.length !== 4 || opts.some((o: string) => !o)) return { ok: false, code: `bad_options_${id}` };
    const correct = nonEmpty(it?.correct);
    if (!correct || !opts.includes(correct)) return { ok: false, code: `bad_correct_${id}` };
    out.push({ id, type: "choice", question, options: opts, correct });
  }
  return { ok: true, value: out };
}

/** 10 free-text questions, each with non-empty expected_answer. */
export function validateChecklistText10(raw: unknown): V<TextQ[]> {
  if (!Array.isArray(raw)) return { ok: false, code: "not_array" };
  if (raw.length !== 10) return { ok: false, code: `expected_10_got_${raw.length}` };
  const out: TextQ[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] as any;
    const id = nonEmpty(it?.id) || `q${i + 11}`;
    if (seen.has(id)) return { ok: false, code: `dup_id_${id}` };
    seen.add(id);
    const question = nonEmpty(it?.question);
    if (!question) return { ok: false, code: `empty_question_${id}` };
    const expected = nonEmpty(it?.expected_answer);
    if (!expected) return { ok: false, code: `empty_expected_${id}` };
    out.push({ id, type: "text", question, expected_answer: expected });
  }
  return { ok: true, value: out };
}

/** Renumber/combine two halves into q1..q20 with stable ids. */
export function combineChecklist20(choice: ChoiceQ[], text: TextQ[]): AnyQ[] {
  const all: AnyQ[] = [];
  choice.forEach((q, i) => all.push({ ...q, id: `q${i + 1}` }));
  text.forEach((q, i) => all.push({ ...q, id: `q${i + 11}` }));
  return all;
}

export type Situation = { id: string; title: string; brief: string; criteria: string };

export function validateSituations3(raw: unknown): V<Situation[]> {
  if (!Array.isArray(raw)) return { ok: false, code: "not_array" };
  if (raw.length !== 3) return { ok: false, code: `expected_3_got_${raw.length}` };
  const out: Situation[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] as any;
    const id = nonEmpty(it?.id) || `s${i + 1}`;
    if (!/^s[1-3]$/.test(id)) return { ok: false, code: `bad_id_${id}` };
    if (seen.has(id)) return { ok: false, code: `dup_id_${id}` };
    seen.add(id);
    const title = nonEmpty(it?.title);
    const brief = nonEmpty(it?.brief);
    const criteria = nonEmpty(it?.criteria);
    if (!title || !brief || !criteria) return { ok: false, code: `empty_fields_${id}` };
    out.push({ id, title, brief, criteria });
  }
  return { ok: true, value: out };
}

/** Generic object-shape validator: required string keys must be present and non-empty. */
export function validateRequiredKeys<T extends Record<string, unknown>>(
  obj: unknown,
  keys: (keyof T)[],
): V<T> {
  if (!obj || typeof obj !== "object") return { ok: false, code: "not_object" };
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k as string];
    if (v === undefined || v === null) return { ok: false, code: `missing_${String(k)}` };
  }
  return { ok: true, value: o as T };
}

// =============================================================================
// Resume Screen Report v2 — strict schema with separated employer / candidate
// outputs. Used by ai-interview-screen-resume-v2.
// =============================================================================

const VERDICT_ENUM = new Set([
  "высокое соответствие",
  "частичное соответствие",
  "низкое соответствие",
  "недостаточно данных",
]);
const DEGREE_ENUM = new Set(["полностью", "частично", "не подтверждено"]);
const SEVERITY_RISK_ENUM = new Set(["низкий", "средний", "высокий"]);
const SEVERITY_RED_FLAG_ENUM = new Set(["средний", "высокий"]);

/** Patterns that indicate the model is leaking protected-characteristic
 *  reasoning into employer-visible report. We reject the whole report so the
 *  runner re-rolls. Keep narrow to avoid false positives on legitimate text. */
// NOTE: JavaScript's `\b` is ASCII-only, so it's unreliable around Cyrillic.
// We use lookaround on non-letter characters instead.
const PROTECTED_PATTERNS: RegExp[] = [
  // Age must be explicitly about the candidate, not duration like "3 года опыта".
  /(?:кандидат(?:у|а|ом)?|ему|ей)\s+\d{1,2}\s*(?:лет|года|год)/iu,
  /(?:возраст\s+кандидат|пожилой\s+кандидат|молод(?:ой|ая)\s+кандидат|преклонн)/iu,
  /(?:мужчин[аы]|женщин[аы]|пол\s+кандидата)/iu,
  /(?:национальност|раса|расов|еврей|татарин|узбек|таджик|армянин)/iu,
  /(?:религи|мусульман|христиан|православн|католик|иудей|атеист)/iu,
  /(?:беременн|декрет|материнств)/iu,
  /(?:инвалид|инвалидност|ограниченн[ыо].{0,3}возможност)/iu,
  /(?:гомосекс|ориентаци\s|ЛГБТ)/iu,
  /(?:политическ[ие][их]?\s+взгляд)/iu,
];

export function detectProtectedCharacteristic(text: string): string | null {
  if (!text) return null;
  for (const re of PROTECTED_PATTERNS) {
    if (re.test(text)) return re.source.slice(0, 32);
  }
  return null;
}

// =============================================================================
// Training stage report v2 — split employer / candidate, used by
// ai-grade-training-quiz (extended) and ai-evaluate-training-summary-v2.
// =============================================================================

const TRAINING_SEVERITY_RISK_ENUM = new Set(["низкий", "средний", "высокий"]);
const TRAINING_SEVERITY_RED_FLAG_ENUM = new Set(["средний", "высокий"]);
const TRAINING_VERDICT_ENUM = new Set([
  "готов",
  "частично готов",
  "требуется повторение",
  "недостаточно данных",
]);

export type TrainingStageEmployer = {
  summary: string;
  strengths: string[];
  gaps: string[];
  risks: { title: string; evidence: string; severity: string; how_to_verify: string }[];
  red_flags: { title: string; evidence: string; severity: string }[];
  items: { question_id: string; score: number; feedback: string; evidence: string }[];
  recommendation: string;
};

export type TrainingStageCandidate = {
  summary: string;
  strengths: string[];
  areas_to_improve: string[];
  items: { question_id: string; score: number; feedback: string; recommendation: string }[];
  next_steps: string[];
};

export type TrainingStageReport = {
  score: number;
  employer: TrainingStageEmployer;
  candidate: TrainingStageCandidate;
};

const TRAINING_CANDIDATE_FORBIDDEN_KEYS = new Set([
  "risks", "red_flags", "evidence", "how_to_verify",
  "verdict", "internal", "weight", "weights", "expected_answer",
]);

function strArr(x: unknown, max = 16): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean).slice(0, max);
}

function hasForbiddenKeysDeep(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  // Check only the top-level keys of the candidate object — nested per-item
  // fields like `recommendation` are legitimately part of the candidate shape.
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (TRAINING_CANDIDATE_FORBIDDEN_KEYS.has(k)) return k;
  }
  return null;
}

export function validateTrainingStageReport(
  raw: unknown,
  knownQuestionIds: string[],
): V<TrainingStageReport> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const r = raw as any;
  const score = Number(r.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return { ok: false, code: "bad_score" };

  const emp = r.employer;
  const cand = r.candidate;
  if (!emp || typeof emp !== "object") return { ok: false, code: "no_employer" };
  if (!cand || typeof cand !== "object") return { ok: false, code: "no_candidate" };

  const empSummary = nonEmpty(emp.summary);
  if (!empSummary) return { ok: false, code: "empty_employer_summary" };
  const candSummary = nonEmpty(cand.summary);
  if (!candSummary) return { ok: false, code: "empty_candidate_summary" };

  const known = new Set(knownQuestionIds);
  const empItemsRaw = Array.isArray(emp.items) ? emp.items : [];
  const empSeen = new Set<string>();
  const empItems = [];
  for (const it of empItemsRaw) {
    const qid = nonEmpty(it?.question_id);
    if (!qid || (known.size && !known.has(qid))) return { ok: false, code: `emp_bad_qid_${qid || "?"}` };
    if (empSeen.has(qid)) return { ok: false, code: `emp_dup_qid_${qid}` };
    empSeen.add(qid);
    const sc = Number(it?.score);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return { ok: false, code: `emp_bad_item_score_${qid}` };
    empItems.push({
      question_id: qid,
      score: sc,
      feedback: nonEmpty(it?.feedback),
      evidence: nonEmpty(it?.evidence),
    });
  }

  const candItemsRaw = Array.isArray(cand.items) ? cand.items : [];
  const candSeen = new Set<string>();
  const candItems = [];
  for (const it of candItemsRaw) {
    const qid = nonEmpty(it?.question_id);
    if (!qid || (known.size && !known.has(qid))) return { ok: false, code: `cand_bad_qid_${qid || "?"}` };
    if (candSeen.has(qid)) return { ok: false, code: `cand_dup_qid_${qid}` };
    candSeen.add(qid);
    const sc = Number(it?.score);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return { ok: false, code: `cand_bad_item_score_${qid}` };
    candItems.push({
      question_id: qid,
      score: sc,
      feedback: nonEmpty(it?.feedback),
      recommendation: nonEmpty(it?.recommendation),
    });
  }

  const risks = Array.isArray(emp.risks) ? emp.risks : [];
  const risksOut = [];
  for (const r0 of risks) {
    const title = nonEmpty(r0?.title);
    const evidence = nonEmpty(r0?.evidence);
    const sev = nonEmpty(r0?.severity);
    if (!title || !evidence) return { ok: false, code: "risk_no_evidence" };
    if (!TRAINING_SEVERITY_RISK_ENUM.has(sev)) return { ok: false, code: `risk_bad_sev_${sev}` };
    risksOut.push({ title, evidence, severity: sev, how_to_verify: nonEmpty(r0?.how_to_verify) });
  }

  const rfs = Array.isArray(emp.red_flags) ? emp.red_flags : [];
  const rfsOut = [];
  for (const r0 of rfs) {
    const title = nonEmpty(r0?.title);
    const evidence = nonEmpty(r0?.evidence);
    const sev = nonEmpty(r0?.severity);
    if (!title || !evidence) return { ok: false, code: "rf_no_evidence" };
    if (!TRAINING_SEVERITY_RED_FLAG_ENUM.has(sev)) return { ok: false, code: `rf_bad_sev_${sev}` };
    rfsOut.push({ title, evidence, severity: sev });
  }

  const guardBlob = JSON.stringify({ employer: emp, candidate: cand });
  if (detectProtectedCharacteristic(guardBlob)) return { ok: false, code: "protected_characteristic" };

  const leaked = hasForbiddenKeysDeep(cand);
  if (leaked) return { ok: false, code: `cand_forbidden_${leaked}` };

  const employer: TrainingStageEmployer = {
    summary: empSummary,
    strengths: strArr(emp.strengths),
    gaps: strArr(emp.gaps),
    risks: risksOut,
    red_flags: rfsOut,
    items: empItems,
    recommendation: nonEmpty(emp.recommendation),
  };
  const candidate: TrainingStageCandidate = {
    summary: candSummary,
    strengths: strArr(cand.strengths),
    areas_to_improve: strArr(cand.areas_to_improve),
    items: candItems,
    next_steps: strArr(cand.next_steps),
  };

  return { ok: true, value: { score: Math.round(score), employer, candidate } };
}

export type TrainingSummaryEmployer = {
  score: number;
  data_completeness: number;
  verdict: string;
  summary: string;
  completed_stages: string[];
  missing_stages: string[];
  mastered_topics: string[];
  weak_topics: string[];
  risks: { title: string; evidence: string; severity: string }[];
  red_flags: { title: string; evidence: string; severity: string }[];
  revision_plan: string[];
  readiness: string;
  recommendation: string;
};

export type TrainingSummaryCandidate = {
  summary: string;
  completed_stages: string[];
  missing_stages: string[];
  strengths: string[];
  topics_to_repeat: string[];
  revision_plan: string[];
  next_steps: string[];
};

export type TrainingSummaryReport = {
  employer: TrainingSummaryEmployer;
  candidate: TrainingSummaryCandidate;
};

export function validateTrainingSummary(raw: unknown): V<TrainingSummaryReport> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const r = raw as any;
  const emp = r.employer, cand = r.candidate;
  if (!emp || typeof emp !== "object") return { ok: false, code: "no_employer" };
  if (!cand || typeof cand !== "object") return { ok: false, code: "no_candidate" };

  const score = Number(emp.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return { ok: false, code: "bad_score" };
  const completeness = Number(emp.data_completeness);
  if (!Number.isFinite(completeness) || completeness < 0 || completeness > 100) return { ok: false, code: "bad_completeness" };
  const verdict = nonEmpty(emp.verdict);
  if (!TRAINING_VERDICT_ENUM.has(verdict)) return { ok: false, code: `bad_verdict_${verdict}` };
  const empSummary = nonEmpty(emp.summary);
  const candSummary = nonEmpty(cand.summary);
  if (!empSummary || !candSummary) return { ok: false, code: "empty_summary" };

  const risks: TrainingSummaryEmployer["risks"] = [];
  for (const r0 of (Array.isArray(emp.risks) ? emp.risks : [])) {
    const title = nonEmpty(r0?.title), evidence = nonEmpty(r0?.evidence), sev = nonEmpty(r0?.severity);
    if (!title || !evidence) return { ok: false, code: "risk_no_evidence" };
    if (!TRAINING_SEVERITY_RISK_ENUM.has(sev)) return { ok: false, code: `risk_bad_sev_${sev}` };
    risks.push({ title, evidence, severity: sev });
  }
  const redFlags: TrainingSummaryEmployer["red_flags"] = [];
  for (const r0 of (Array.isArray(emp.red_flags) ? emp.red_flags : [])) {
    const title = nonEmpty(r0?.title), evidence = nonEmpty(r0?.evidence), sev = nonEmpty(r0?.severity);
    if (!title || !evidence) return { ok: false, code: "rf_no_evidence" };
    if (!TRAINING_SEVERITY_RED_FLAG_ENUM.has(sev)) return { ok: false, code: `rf_bad_sev_${sev}` };
    redFlags.push({ title, evidence, severity: sev });
  }

  const guardBlob = JSON.stringify({ employer: emp, candidate: cand });
  if (detectProtectedCharacteristic(guardBlob)) return { ok: false, code: "protected_characteristic" };
  const leaked = hasForbiddenKeysDeep(cand);
  if (leaked) return { ok: false, code: `cand_forbidden_${leaked}` };

  return {
    ok: true,
    value: {
      employer: {
        score: Math.round(score),
        data_completeness: Math.round(completeness),
        verdict,
        summary: empSummary,
        completed_stages: strArr(emp.completed_stages),
        missing_stages: strArr(emp.missing_stages),
        mastered_topics: strArr(emp.mastered_topics),
        weak_topics: strArr(emp.weak_topics),
        risks,
        red_flags: redFlags,
        revision_plan: strArr(emp.revision_plan),
        readiness: nonEmpty(emp.readiness),
        recommendation: nonEmpty(emp.recommendation),
      },
      candidate: {
        summary: candSummary,
        completed_stages: strArr(cand.completed_stages),
        missing_stages: strArr(cand.missing_stages),
        strengths: strArr(cand.strengths),
        topics_to_repeat: strArr(cand.topics_to_repeat),
        revision_plan: strArr(cand.revision_plan),
        next_steps: strArr(cand.next_steps),
      },
    },
  };
}

export type ResumeMatch = { criterion: string; degree: string; evidence: string };
export type ResumeGap = { criterion: string; finding: string; impact: string };
export type ResumeRisk = { title: string; evidence: string; severity: string; how_to_verify: string };
export type ResumeRedFlag = { title: string; evidence: string; severity: string };

export type EmployerResumeReport = {
  verdict: string;
  summary: string;
  matches: ResumeMatch[];
  gaps: ResumeGap[];
  strengths: string[];
  risks: ResumeRisk[];
  red_flags: ResumeRedFlag[];
  questions_to_verify: string[];
};

export type CandidateResumeReport = {
  summary: string;
  strengths: string[];
  areas_to_clarify: string[];
  recommendations: string[];
};

export type ResumeScreenReport = {
  score: number;
  employer: EmployerResumeReport;
  candidate: CandidateResumeReport;
};

function arrOfStr(v: unknown, max = 12, maxLen = 600): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const it of v.slice(0, max)) {
    const s = nonEmpty(it);
    if (!s) return null;
    out.push(s.slice(0, maxLen));
  }
  return out;
}

/** Strict validator for the resume screen report (employer + candidate). */
export function validateResumeScreenReport(raw: unknown): V<ResumeScreenReport> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const o = raw as Record<string, any>;

  // score
  const score = Number(o.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return { ok: false, code: "bad_score" };
  }
  const scoreInt = Math.round(score);

  // employer block
  const emp = o.employer;
  if (!emp || typeof emp !== "object") return { ok: false, code: "missing_employer" };
  const verdict = nonEmpty(emp.verdict);
  if (!VERDICT_ENUM.has(verdict)) return { ok: false, code: "bad_verdict" };
  const empSummary = nonEmpty(emp.summary);
  if (!empSummary || empSummary.length < 20) return { ok: false, code: "empty_employer_summary" };

  const matchesRaw = Array.isArray(emp.matches) ? emp.matches : [];
  const matches: ResumeMatch[] = [];
  for (const m of matchesRaw.slice(0, 20)) {
    const criterion = nonEmpty(m?.criterion);
    const degree = nonEmpty(m?.degree);
    const evidence = nonEmpty(m?.evidence);
    if (!criterion || !degree) return { ok: false, code: "bad_match" };
    if (!DEGREE_ENUM.has(degree)) return { ok: false, code: "bad_match_degree" };
    matches.push({
      criterion: criterion.slice(0, 500),
      degree,
      evidence: evidence.slice(0, 600),
    });
  }

  const gapsRaw = Array.isArray(emp.gaps) ? emp.gaps : [];
  const gaps: ResumeGap[] = [];
  for (const g of gapsRaw.slice(0, 20)) {
    const criterion = nonEmpty(g?.criterion);
    const finding = nonEmpty(g?.finding);
    const impact = nonEmpty(g?.impact);
    if (!criterion || !finding) return { ok: false, code: "bad_gap" };
    gaps.push({
      criterion: criterion.slice(0, 500),
      finding: finding.slice(0, 600),
      impact: (impact || "").slice(0, 600),
    });
  }

  const strengths = arrOfStr(emp.strengths ?? [], 12, 500);
  if (!strengths && emp.strengths !== undefined) return { ok: false, code: "bad_strengths" };

  const risksRaw = Array.isArray(emp.risks) ? emp.risks : [];
  const risks: ResumeRisk[] = [];
  for (const r of risksRaw.slice(0, 12)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    const how = nonEmpty(r?.how_to_verify);
    if (!title) return { ok: false, code: "bad_risk" };
    if (!evidence) return { ok: false, code: "risk_without_evidence" };
    if (!SEVERITY_RISK_ENUM.has(severity)) return { ok: false, code: "bad_risk_severity" };
    risks.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      severity,
      how_to_verify: (how || "").slice(0, 400),
    });
  }

  const redRaw = Array.isArray(emp.red_flags) ? emp.red_flags : [];
  const red_flags: ResumeRedFlag[] = [];
  for (const r of redRaw.slice(0, 8)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    if (!title) return { ok: false, code: "bad_red_flag" };
    if (!evidence) return { ok: false, code: "red_flag_without_evidence" };
    if (!SEVERITY_RED_FLAG_ENUM.has(severity)) return { ok: false, code: "bad_red_flag_severity" };
    red_flags.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      severity,
    });
  }

  const questions = arrOfStr(emp.questions_to_verify ?? [], 12, 500);
  if (!questions && emp.questions_to_verify !== undefined) {
    return { ok: false, code: "bad_questions_to_verify" };
  }

  // candidate block
  const cand = o.candidate;
  if (!cand || typeof cand !== "object") return { ok: false, code: "missing_candidate" };
  const candSummary = nonEmpty(cand.summary);
  if (!candSummary || candSummary.length < 20) return { ok: false, code: "empty_candidate_summary" };
  const cStrengths = arrOfStr(cand.strengths ?? [], 10, 400) ?? [];
  const cClarify   = arrOfStr(cand.areas_to_clarify ?? [], 10, 400) ?? [];
  const cRecs      = arrOfStr(cand.recommendations ?? [], 10, 400) ?? [];

  // Protected-characteristic guard: scan all employer-visible evidence strings.
  const guardBlob = [
    empSummary,
    ...matches.map((m) => m.evidence),
    ...gaps.map((g) => `${g.finding} ${g.impact}`),
    ...risks.map((r) => `${r.title} ${r.evidence}`),
    ...red_flags.map((r) => `${r.title} ${r.evidence}`),
  ].join(" \n ");
  const protectedHit = detectProtectedCharacteristic(guardBlob);
  if (protectedHit) return { ok: false, code: "protected_characteristic" };

  return {
    ok: true,
    value: {
      score: scoreInt,
      employer: {
        verdict,
        summary: empSummary.slice(0, 4000),
        matches,
        gaps,
        strengths: strengths ?? [],
        risks,
        red_flags,
        questions_to_verify: questions ?? [],
      },
      candidate: {
        summary: candSummary.slice(0, 4000),
        strengths: cStrengths,
        areas_to_clarify: cClarify,
        recommendations: cRecs,
      },
    },
  };
}

// =============================================================================
// Checklist Grade Report v2 — strict schema with separated employer / candidate
// outputs. Used by ai-interview-grade-checklist-v2.
// =============================================================================

export type ChecklistGradeRisk = {
  title: string; evidence: string; severity: string; how_to_verify: string;
};
export type ChecklistGradeRedFlag = {
  title: string; evidence: string; severity: string;
};
export type ChecklistGradeGap = {
  criterion: string; finding: string; impact: string;
};
export type ChecklistEmployerItem = {
  question_id: string; score: number; employer_feedback: string; evidence: string;
};
export type ChecklistCandidateItem = {
  question_id: string; score: number; feedback: string; recommendation: string;
};
export type EmployerChecklistReport = {
  summary: string;
  strengths: string[];
  gaps: ChecklistGradeGap[];
  risks: ChecklistGradeRisk[];
  red_flags: ChecklistGradeRedFlag[];
  items: ChecklistEmployerItem[];
};
export type CandidateChecklistReport = {
  summary: string;
  strengths: string[];
  areas_to_improve: string[];
  items: ChecklistCandidateItem[];
};
export type ChecklistGradeReport = {
  total: number;
  employer: EmployerChecklistReport;
  candidate: CandidateChecklistReport;
};

// =============================================================================
// Overall Candidate Report v2 — combined AI fit evaluation. Used by
// ai-evaluate-overall-candidate-v2. The employer block reasons about fit to
// the vacancy; the candidate block is soft and stripped of employer-only
// signals. NEVER persisted into overall_score; only into ai_fit_score.
// =============================================================================

const OVERALL_VERDICT_ENUM = new Set([
  "высокое соответствие",
  "частичное соответствие",
  "низкое соответствие",
  "недостаточно данных",
]);
const OVERALL_STAGE_ENUM = new Set(["resume", "checklist", "situations", "training"]);
const OVERALL_DEGREE_ENUM = new Set(["полностью", "частично", "не подтверждено"]);
const OVERALL_RISK_SEV_ENUM = new Set(["низкий", "средний", "высокий"]);
const OVERALL_RED_SEV_ENUM = new Set(["средний", "высокий"]);
const OVERALL_WISH_STATUS_ENUM = new Set([
  "соответствует", "частично", "не соответствует", "нет данных",
]);

export type OverallStageSummary = {
  stage: string; score: number | null; conclusion: string; key_evidence: string[];
};
export type OverallMatch = { criterion: string; degree: string; evidence: string; source: string };
export type OverallGap = { criterion: string; finding: string; impact: string; source: string };
export type OverallRisk = {
  title: string; evidence: string; impact: string; severity: string; how_to_verify: string;
};
export type OverallRedFlag = {
  title: string; evidence: string; source: string; severity: string;
};
export type OverallWishAlignment = {
  wish: string; status: string; evidence: string;
};
export type EmployerOverallReport = {
  fit_score: number;
  confidence: number;
  data_completeness: number;
  verdict: string;
  executive_summary: string;
  stage_summary: OverallStageSummary[];
  matches: OverallMatch[];
  gaps: OverallGap[];
  risks: OverallRisk[];
  red_flags: OverallRedFlag[];
  employer_wishes_alignment: OverallWishAlignment[];
  strengths: string[];
  interview_focus: string[];
  missing_sections: string[];
  recommendation: string;
};
export type CandidateOverallStageFeedback = { stage: string; conclusion: string };
export type CandidateOverallReport = {
  summary: string;
  strengths: string[];
  areas_to_improve: string[];
  stage_feedback: CandidateOverallStageFeedback[];
  next_steps: string[];
  missing_sections: string[];
};
export type OverallCandidateReport = {
  employer: EmployerOverallReport;
  candidate: CandidateOverallReport;
};

/** Keys that must NEVER appear in candidate block — employer-only data. */
const OVERALL_CANDIDATE_FORBIDDEN_KEYS = new Set([
  "risks", "red_flags", "gaps", "matches", "verdict", "fit_score",
  "confidence", "recommendation", "employer_wishes_alignment",
  "employer_wishes", "interview_focus", "executive_summary",
]);

function arrStrLoose(v: unknown, max = 12, maxLen = 600): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const it of v.slice(0, max)) {
    const s = nonEmpty(it);
    if (s) out.push(s.slice(0, maxLen));
  }
  return out;
}

function int0to100(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

/** Strict validator for the overall (combined) candidate report. */
export function validateOverallCandidateReport(raw: unknown): V<OverallCandidateReport> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const o = raw as Record<string, any>;

  const emp = o.employer;
  if (!emp || typeof emp !== "object") return { ok: false, code: "missing_employer" };
  const cand = o.candidate;
  if (!cand || typeof cand !== "object") return { ok: false, code: "missing_candidate" };

  const fit = int0to100(emp.fit_score);
  if (fit === null) return { ok: false, code: "bad_fit_score" };
  const confidence = int0to100(emp.confidence);
  if (confidence === null) return { ok: false, code: "bad_confidence" };
  const completeness = int0to100(emp.data_completeness);
  if (completeness === null) return { ok: false, code: "bad_data_completeness" };

  const verdict = nonEmpty(emp.verdict);
  if (!OVERALL_VERDICT_ENUM.has(verdict)) return { ok: false, code: "bad_verdict" };

  const execSummary = nonEmpty(emp.executive_summary);
  if (!execSummary || execSummary.length < 20) return { ok: false, code: "empty_executive_summary" };

  // stage_summary
  const stageSummary: OverallStageSummary[] = [];
  for (const it of (Array.isArray(emp.stage_summary) ? emp.stage_summary : []).slice(0, 8)) {
    const stage = nonEmpty(it?.stage);
    if (!OVERALL_STAGE_ENUM.has(stage)) return { ok: false, code: "bad_stage" };
    const conclusion = nonEmpty(it?.conclusion);
    if (!conclusion) return { ok: false, code: "empty_stage_conclusion" };
    const score = it?.score == null ? null : int0to100(it.score);
    if (it?.score != null && score === null) return { ok: false, code: "bad_stage_score" };
    stageSummary.push({
      stage, score, conclusion: conclusion.slice(0, 1200),
      key_evidence: arrStrLoose(it?.key_evidence, 8, 500),
    });
  }

  // matches
  const matches: OverallMatch[] = [];
  for (const m of (Array.isArray(emp.matches) ? emp.matches : []).slice(0, 30)) {
    const criterion = nonEmpty(m?.criterion);
    const degree = nonEmpty(m?.degree);
    if (!criterion || !OVERALL_DEGREE_ENUM.has(degree)) return { ok: false, code: "bad_match" };
    const source = nonEmpty(m?.source);
    if (source && !OVERALL_STAGE_ENUM.has(source)) return { ok: false, code: "bad_match_source" };
    matches.push({
      criterion: criterion.slice(0, 500),
      degree,
      evidence: nonEmpty(m?.evidence).slice(0, 700),
      source: source || "resume",
    });
  }

  // gaps
  const gaps: OverallGap[] = [];
  for (const g of (Array.isArray(emp.gaps) ? emp.gaps : []).slice(0, 20)) {
    const criterion = nonEmpty(g?.criterion);
    const finding = nonEmpty(g?.finding);
    if (!criterion || !finding) return { ok: false, code: "bad_gap" };
    const source = nonEmpty(g?.source);
    gaps.push({
      criterion: criterion.slice(0, 500),
      finding: finding.slice(0, 700),
      impact: nonEmpty(g?.impact).slice(0, 600),
      source: source.slice(0, 80),
    });
  }

  // risks (evidence REQUIRED)
  const risks: OverallRisk[] = [];
  for (const r of (Array.isArray(emp.risks) ? emp.risks : []).slice(0, 15)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    if (!title) return { ok: false, code: "bad_risk" };
    if (!evidence) return { ok: false, code: "risk_without_evidence" };
    if (!OVERALL_RISK_SEV_ENUM.has(severity)) return { ok: false, code: "bad_risk_severity" };
    risks.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      impact: nonEmpty(r?.impact).slice(0, 500),
      severity,
      how_to_verify: nonEmpty(r?.how_to_verify).slice(0, 400),
    });
  }

  // red flags (evidence REQUIRED)
  const redFlags: OverallRedFlag[] = [];
  for (const r of (Array.isArray(emp.red_flags) ? emp.red_flags : []).slice(0, 10)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    if (!title) return { ok: false, code: "bad_red_flag" };
    if (!evidence) return { ok: false, code: "red_flag_without_evidence" };
    if (!OVERALL_RED_SEV_ENUM.has(severity)) return { ok: false, code: "bad_red_flag_severity" };
    redFlags.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      source: nonEmpty(r?.source).slice(0, 80),
      severity,
    });
  }

  // wishes alignment
  const wishes: OverallWishAlignment[] = [];
  for (const w of (Array.isArray(emp.employer_wishes_alignment) ? emp.employer_wishes_alignment : []).slice(0, 20)) {
    const wish = nonEmpty(w?.wish);
    const status = nonEmpty(w?.status);
    if (!wish) return { ok: false, code: "bad_wish" };
    if (!OVERALL_WISH_STATUS_ENUM.has(status)) return { ok: false, code: "bad_wish_status" };
    wishes.push({
      wish: wish.slice(0, 400),
      status,
      evidence: nonEmpty(w?.evidence).slice(0, 500),
    });
  }

  const strengths = arrStrLoose(emp.strengths, 12, 500);
  const interviewFocus = arrStrLoose(emp.interview_focus, 12, 500);
  const missingSections = arrStrLoose(emp.missing_sections, 8, 200);
  const recommendation = nonEmpty(emp.recommendation).slice(0, 2000);

  // candidate block validations
  for (const k of Object.keys(cand)) {
    if (OVERALL_CANDIDATE_FORBIDDEN_KEYS.has(k)) {
      return { ok: false, code: `candidate_forbidden_${k}` };
    }
  }
  const candSummary = nonEmpty(cand.summary);
  if (!candSummary || candSummary.length < 20) return { ok: false, code: "empty_candidate_summary" };
  const candStrengths = arrStrLoose(cand.strengths, 10, 400);
  const candAreas = arrStrLoose(cand.areas_to_improve, 10, 400);
  const candNext = arrStrLoose(cand.next_steps, 10, 400);
  const candMissing = arrStrLoose(cand.missing_sections, 8, 200);
  const candStageFb: CandidateOverallStageFeedback[] = [];
  for (const it of (Array.isArray(cand.stage_feedback) ? cand.stage_feedback : []).slice(0, 8)) {
    const stage = nonEmpty(it?.stage);
    const conclusion = nonEmpty(it?.conclusion);
    if (!OVERALL_STAGE_ENUM.has(stage)) return { ok: false, code: "bad_candidate_stage" };
    if (!conclusion) return { ok: false, code: "empty_candidate_stage_conclusion" };
    candStageFb.push({ stage, conclusion: conclusion.slice(0, 1000) });
  }

  // Protected-characteristic guard on all employer-visible AND candidate-visible text.
  const guardBlob = [
    execSummary, recommendation, candSummary,
    ...stageSummary.map((s) => `${s.conclusion} ${s.key_evidence.join(" ")}`),
    ...matches.map((m) => `${m.criterion} ${m.evidence}`),
    ...gaps.map((g) => `${g.finding} ${g.impact}`),
    ...risks.map((r) => `${r.title} ${r.evidence} ${r.how_to_verify}`),
    ...redFlags.map((r) => `${r.title} ${r.evidence}`),
    ...wishes.map((w) => `${w.wish} ${w.evidence}`),
    ...strengths, ...interviewFocus,
    ...candStrengths, ...candAreas, ...candNext,
    ...candStageFb.map((s) => s.conclusion),
  ].join(" \n ");
  const protectedHit = detectProtectedCharacteristic(guardBlob);
  if (protectedHit) return { ok: false, code: "protected_characteristic" };

  return {
    ok: true,
    value: {
      employer: {
        fit_score: fit,
        confidence,
        data_completeness: completeness,
        verdict,
        executive_summary: execSummary.slice(0, 4000),
        stage_summary: stageSummary,
        matches, gaps, risks,
        red_flags: redFlags,
        employer_wishes_alignment: wishes,
        strengths,
        interview_focus: interviewFocus,
        missing_sections: missingSections,
        recommendation,
      },
      candidate: {
        summary: candSummary.slice(0, 4000),
        strengths: candStrengths,
        areas_to_improve: candAreas,
        stage_feedback: candStageFb,
        next_steps: candNext,
        missing_sections: candMissing,
      },
    },
  };
}

/** Forbidden keys in candidate object — must never leak from employer side. */
const CANDIDATE_FORBIDDEN_KEYS = new Set([
  "risks", "red_flags", "gaps", "matches", "verdict",
  "questions_to_verify", "employer_feedback", "employer_wishes",
  "evidence", "expected", "expected_answer", "correct",
]);

function hasForbiddenCandidateKey(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (CANDIDATE_FORBIDDEN_KEYS.has(k)) return k;
  }
  // items[*]
  const items = (obj as any).items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && typeof it === "object") {
        for (const k of Object.keys(it)) {
          if (CANDIDATE_FORBIDDEN_KEYS.has(k)) return `items.${k}`;
        }
      }
    }
  }
  return null;
}

export type ValidateChecklistOpts = {
  /** Allowed question ids from the current checklist block. */
  allowedQuestionIds: string[];
  /** Expected answers / correct options to detect leakage into candidate text. */
  expectedAnswers?: Record<string, string>;
};

/** Strict validator for the checklist grade report. */
export function validateChecklistGradeReport(
  raw: unknown,
  opts: ValidateChecklistOpts,
): V<ChecklistGradeReport> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const o = raw as Record<string, any>;

  // `total` is validated loosely; the authoritative value is recomputed
  // below from employer.items so it never contradicts per-question scores.
  const totalRaw = Number(o.total);
  if (o.total != null && (!Number.isFinite(totalRaw) || totalRaw < 0 || totalRaw > 100)) {
    return { ok: false, code: "bad_total" };
  }

  const emp = o.employer;
  if (!emp || typeof emp !== "object") return { ok: false, code: "missing_employer" };
  const empSummary = nonEmpty(emp.summary);
  if (!empSummary || empSummary.length < 20) return { ok: false, code: "empty_employer_summary" };

  const strengths = arrOfStr(emp.strengths ?? [], 12, 500) ?? [];
  if (!strengths && emp.strengths !== undefined) return { ok: false, code: "bad_strengths" };

  const gapsRaw = Array.isArray(emp.gaps) ? emp.gaps : [];
  const gaps: ChecklistGradeGap[] = [];
  for (const g of gapsRaw.slice(0, 20)) {
    const criterion = nonEmpty(g?.criterion);
    const finding = nonEmpty(g?.finding);
    const impact = nonEmpty(g?.impact);
    if (!criterion || !finding) return { ok: false, code: "bad_gap" };
    gaps.push({
      criterion: criterion.slice(0, 500),
      finding: finding.slice(0, 600),
      impact: (impact || "").slice(0, 600),
    });
  }

  const risksRaw = Array.isArray(emp.risks) ? emp.risks : [];
  const risks: ChecklistGradeRisk[] = [];
  for (const r of risksRaw.slice(0, 12)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    const how = nonEmpty(r?.how_to_verify);
    if (!title) return { ok: false, code: "bad_risk" };
    if (!evidence) return { ok: false, code: "risk_without_evidence" };
    if (!SEVERITY_RISK_ENUM.has(severity)) return { ok: false, code: "bad_risk_severity" };
    risks.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      severity,
      how_to_verify: (how || "").slice(0, 400),
    });
  }

  const redRaw = Array.isArray(emp.red_flags) ? emp.red_flags : [];
  const red_flags: ChecklistGradeRedFlag[] = [];
  for (const r of redRaw.slice(0, 8)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    if (!title) return { ok: false, code: "bad_red_flag" };
    if (!evidence) return { ok: false, code: "red_flag_without_evidence" };
    if (!SEVERITY_RED_FLAG_ENUM.has(severity)) return { ok: false, code: "bad_red_flag_severity" };
    red_flags.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      severity,
    });
  }

  // employer items: one per question_id, score 0..100, ids in allowed set, no dups
  const allowed = new Set(opts.allowedQuestionIds.map(String));
  const empItemsRaw = Array.isArray(emp.items) ? emp.items : [];
  if (empItemsRaw.length === 0) return { ok: false, code: "empty_employer_items" };
  const empItems: ChecklistEmployerItem[] = [];
  const seenEmp = new Set<string>();
  const perQuestionMax = allowed.size > 0 ? 100 / allowed.size : 100;
  for (const it of empItemsRaw) {
    const qid = nonEmpty(it?.question_id);
    if (!qid) return { ok: false, code: "bad_question_id" };
    if (!allowed.has(qid)) return { ok: false, code: `unknown_question_id_${qid}` };
    if (seenEmp.has(qid)) return { ok: false, code: `dup_question_id_${qid}` };
    seenEmp.add(qid);
    const sc = Number(it?.score);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return { ok: false, code: `bad_item_score_${qid}` };
    const fb = nonEmpty(it?.employer_feedback);
    if (!fb) return { ok: false, code: `empty_employer_feedback_${qid}` };
    // Clamp per-question score to even 100/N distribution.
    const clamped = Math.max(0, Math.min(perQuestionMax, sc));
    empItems.push({
      question_id: qid,
      score: Math.round(clamped),
      employer_feedback: fb.slice(0, 1200),
      evidence: nonEmpty(it?.evidence).slice(0, 800),
    });
  }

  // Recompute authoritative total from per-question scores.
  const totalInt = Math.min(100, Math.round(empItems.reduce((a, it) => a + it.score, 0)));

  // candidate block
  const cand = o.candidate;
  if (!cand || typeof cand !== "object") return { ok: false, code: "missing_candidate" };
  const candForbid = hasForbiddenCandidateKey(cand);
  if (candForbid) return { ok: false, code: `candidate_has_employer_field_${candForbid}` };
  const candSummary = nonEmpty(cand.summary);
  if (!candSummary || candSummary.length < 20) return { ok: false, code: "empty_candidate_summary" };
  const cStrengths = arrOfStr(cand.strengths ?? [], 10, 400) ?? [];
  const cAreas = arrOfStr(cand.areas_to_improve ?? [], 10, 400) ?? [];

  const candItemsRaw = Array.isArray(cand.items) ? cand.items : [];
  const candItems: ChecklistCandidateItem[] = [];
  const seenCand = new Set<string>();
  for (const it of candItemsRaw) {
    const qid = nonEmpty(it?.question_id);
    if (!qid) return { ok: false, code: "bad_candidate_question_id" };
    if (!allowed.has(qid)) return { ok: false, code: `unknown_candidate_question_id_${qid}` };
    if (seenCand.has(qid)) return { ok: false, code: `dup_candidate_question_id_${qid}` };
    seenCand.add(qid);
    const sc = Number(it?.score);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return { ok: false, code: `bad_candidate_item_score_${qid}` };
    const fb = nonEmpty(it?.feedback);
    if (!fb) return { ok: false, code: `empty_candidate_feedback_${qid}` };
    const clampedC = Math.max(0, Math.min(perQuestionMax, sc));
    candItems.push({
      question_id: qid,
      score: Math.round(clampedC),
      feedback: fb.slice(0, 1000),
      recommendation: nonEmpty(it?.recommendation).slice(0, 800),
    });
  }

  // Expected-answer leakage guard: reject if candidate-visible text quotes the
  // hidden expected_answer / correct value verbatim.
  if (opts.expectedAnswers) {
    const candBlob = [
      candSummary,
      ...cStrengths, ...cAreas,
      ...candItems.map((it) => `${it.feedback} ${it.recommendation}`),
    ].join(" \n ");
    for (const [, expected] of Object.entries(opts.expectedAnswers)) {
      const e = (expected || "").trim();
      if (e && e.length >= 12 && candBlob.includes(e)) {
        return { ok: false, code: "expected_answer_leak" };
      }
    }
  }

  // Protected-characteristic guard on employer-visible text.
  const guardBlob = [
    empSummary,
    ...gaps.map((g) => `${g.finding} ${g.impact}`),
    ...risks.map((r) => `${r.title} ${r.evidence}`),
    ...red_flags.map((r) => `${r.title} ${r.evidence}`),
    ...empItems.map((it) => `${it.employer_feedback} ${it.evidence}`),
  ].join(" \n ");
  const protectedHit = detectProtectedCharacteristic(guardBlob);
  if (protectedHit) return { ok: false, code: "protected_characteristic" };

  return {
    ok: true,
    value: {
      total: totalInt,
      employer: {
        summary: empSummary.slice(0, 4000),
        strengths,
        gaps,
        risks,
        red_flags,
        items: empItems,
      },
      candidate: {
        summary: candSummary.slice(0, 4000),
        strengths: cStrengths,
        areas_to_improve: cAreas,
        items: candItems,
      },
    },
  };
}

// =============================================================================
// Situations Grade Report v2 — strict schema. Used by
// ai-interview-grade-situations-v2.
// =============================================================================

export type SituationsEmployerItem = {
  situation_id: string; score: number; employer_feedback: string; evidence: string;
};
export type SituationsCandidateItem = {
  situation_id: string; score: number; feedback: string; recommendation: string;
};
export type EmployerSituationsReport = {
  summary: string;
  demonstrated_competencies: string[];
  weak_competencies: string[];
  risks: ChecklistGradeRisk[];
  red_flags: ChecklistGradeRedFlag[];
  items: SituationsEmployerItem[];
};
export type CandidateSituationsReport = {
  summary: string;
  strengths: string[];
  areas_to_improve: string[];
  items: SituationsCandidateItem[];
};
export type SituationsGradeReport = {
  total: number;
  employer: EmployerSituationsReport;
  candidate: CandidateSituationsReport;
};

export type ValidateSituationsOpts = {
  allowedSituationIds: string[];
};

export function validateSituationsGradeReport(
  raw: unknown,
  opts: ValidateSituationsOpts,
): V<SituationsGradeReport> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const o = raw as Record<string, any>;

  const total = Number(o.total);
  if (!Number.isFinite(total) || total < 0 || total > 100) {
    return { ok: false, code: "bad_total" };
  }
  const totalInt = Math.round(total);

  const emp = o.employer;
  if (!emp || typeof emp !== "object") return { ok: false, code: "missing_employer" };
  const empSummary = nonEmpty(emp.summary);
  if (!empSummary || empSummary.length < 20) return { ok: false, code: "empty_employer_summary" };

  const demonstrated = arrOfStr(emp.demonstrated_competencies ?? [], 12, 500) ?? [];
  const weak = arrOfStr(emp.weak_competencies ?? [], 12, 500) ?? [];

  const risksRaw = Array.isArray(emp.risks) ? emp.risks : [];
  const risks: ChecklistGradeRisk[] = [];
  for (const r of risksRaw.slice(0, 12)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    const how = nonEmpty(r?.how_to_verify);
    if (!title) return { ok: false, code: "bad_risk" };
    if (!evidence) return { ok: false, code: "risk_without_evidence" };
    if (!SEVERITY_RISK_ENUM.has(severity)) return { ok: false, code: "bad_risk_severity" };
    risks.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      severity,
      how_to_verify: (how || "").slice(0, 400),
    });
  }

  const redRaw = Array.isArray(emp.red_flags) ? emp.red_flags : [];
  const red_flags: ChecklistGradeRedFlag[] = [];
  for (const r of redRaw.slice(0, 8)) {
    const title = nonEmpty(r?.title);
    const evidence = nonEmpty(r?.evidence);
    const severity = nonEmpty(r?.severity);
    if (!title) return { ok: false, code: "bad_red_flag" };
    if (!evidence) return { ok: false, code: "red_flag_without_evidence" };
    if (!SEVERITY_RED_FLAG_ENUM.has(severity)) return { ok: false, code: "bad_red_flag_severity" };
    red_flags.push({
      title: title.slice(0, 300),
      evidence: evidence.slice(0, 700),
      severity,
    });
  }

  const allowed = new Set(opts.allowedSituationIds.map(String));
  const empItemsRaw = Array.isArray(emp.items) ? emp.items : [];
  if (empItemsRaw.length === 0) return { ok: false, code: "empty_employer_items" };
  const empItems: SituationsEmployerItem[] = [];
  const seenEmp = new Set<string>();
  for (const it of empItemsRaw) {
    const sid = nonEmpty(it?.situation_id);
    if (!sid) return { ok: false, code: "bad_situation_id" };
    if (!allowed.has(sid)) return { ok: false, code: `unknown_situation_id_${sid}` };
    if (seenEmp.has(sid)) return { ok: false, code: `dup_situation_id_${sid}` };
    seenEmp.add(sid);
    const sc = Number(it?.score);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return { ok: false, code: `bad_item_score_${sid}` };
    const fb = nonEmpty(it?.employer_feedback);
    if (!fb) return { ok: false, code: `empty_employer_feedback_${sid}` };
    empItems.push({
      situation_id: sid,
      score: Math.round(sc),
      employer_feedback: fb.slice(0, 1200),
      evidence: nonEmpty(it?.evidence).slice(0, 800),
    });
  }

  // candidate block
  const cand = o.candidate;
  if (!cand || typeof cand !== "object") return { ok: false, code: "missing_candidate" };
  const candForbid = hasForbiddenCandidateKey(cand);
  if (candForbid) return { ok: false, code: `candidate_has_employer_field_${candForbid}` };
  const candSummary = nonEmpty(cand.summary);
  if (!candSummary || candSummary.length < 20) return { ok: false, code: "empty_candidate_summary" };
  const cStrengths = arrOfStr(cand.strengths ?? [], 10, 400) ?? [];
  const cAreas = arrOfStr(cand.areas_to_improve ?? [], 10, 400) ?? [];

  const candItemsRaw = Array.isArray(cand.items) ? cand.items : [];
  const candItems: SituationsCandidateItem[] = [];
  const seenCand = new Set<string>();
  for (const it of candItemsRaw) {
    const sid = nonEmpty(it?.situation_id);
    if (!sid) return { ok: false, code: "bad_candidate_situation_id" };
    if (!allowed.has(sid)) return { ok: false, code: `unknown_candidate_situation_id_${sid}` };
    if (seenCand.has(sid)) return { ok: false, code: `dup_candidate_situation_id_${sid}` };
    seenCand.add(sid);
    const sc = Number(it?.score);
    if (!Number.isFinite(sc) || sc < 0 || sc > 100) return { ok: false, code: `bad_candidate_item_score_${sid}` };
    const fb = nonEmpty(it?.feedback);
    if (!fb) return { ok: false, code: `empty_candidate_feedback_${sid}` };
    candItems.push({
      situation_id: sid,
      score: Math.round(sc),
      feedback: fb.slice(0, 1000),
      recommendation: nonEmpty(it?.recommendation).slice(0, 800),
    });
  }

  const guardBlob = [
    empSummary,
    ...demonstrated, ...weak,
    ...risks.map((r) => `${r.title} ${r.evidence}`),
    ...red_flags.map((r) => `${r.title} ${r.evidence}`),
    ...empItems.map((it) => `${it.employer_feedback} ${it.evidence}`),
  ].join(" \n ");
  const protectedHit = detectProtectedCharacteristic(guardBlob);
  if (protectedHit) return { ok: false, code: "protected_characteristic" };

  return {
    ok: true,
    value: {
      total: totalInt,
      employer: {
        summary: empSummary.slice(0, 4000),
        demonstrated_competencies: demonstrated,
        weak_competencies: weak,
        risks,
        red_flags,
        items: empItems,
      },
      candidate: {
        summary: candSummary.slice(0, 4000),
        strengths: cStrengths,
        areas_to_improve: cAreas,
        items: candItems,
      },
    },
  };
}