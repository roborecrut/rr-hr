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
const PROTECTED_PATTERNS: RegExp[] = [
  // Age: any "(N лет|года)" inside an evidence/risk/red_flag finding
  /\b\d{1,2}\s*(?:лет|года|год)\b/i,
  /\b(возраст|пожилой|молод(ой|ая)|старш(е|ий))\b/i,
  /\b(мужчин(а|ы)|женщин(а|ы)|пол\s+кандидата)\b/i,
  /\b(национальн|раса|расовой|еврей|русск(ий|ая)|татарин|узбек|таджик|армянин)\b/i,
  /\b(религи|мусульман|христиан|православн|католик|иудей|атеист)\b/i,
  /\b(беременн|декрет|материнств)/i,
  /\b(инвалид|инвалидност|ограниченн(ые|ыми)\s+возможност)/i,
  /\b(гомосекс|ориентаци\s+|ЛГБТ)/i,
  /\b(политическ(ие|их)\s+взгляд)/i,
];

export function detectProtectedCharacteristic(text: string): string | null {
  if (!text) return null;
  for (const re of PROTECTED_PATTERNS) {
    if (re.test(text)) return re.source.slice(0, 32);
  }
  return null;
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