// =============================================================================
// Safe adapters for v2 checklist / situations feedback (Phase 3B-2B Step D1).
//
// Why this exists:
//   - Candidate UI and Employer UI render the SAME source rows but MUST NOT
//     show the same fields. Employer-only fields (risks, red_flags, gaps,
//     expected_answer, criteria, employer_wishes, internal weights) must
//     NEVER reach candidate-side DOM, even when the raw blob is already
//     loaded into the page for other reasons.
//   - Legacy v1 feedback is sometimes a plain string or an unknown JSON
//     object. Candidate must see only safe summary text; employer keeps
//     the legacy raw view. We never auto-copy legacy into new fields.
// =============================================================================

export type CandidateItem = {
  questionId: string;
  question?: string;
  score?: number;
  max?: number;
  feedback?: string;
  recommendation?: string;
};

export type CandidateChecklistView = {
  kind: "structured" | "legacy_text" | "empty";
  total?: number;
  summary?: string;
  strengths: string[];
  areasToImprove: string[];
  items: CandidateItem[];
  legacyText?: string;
};

export type CandidateSituationItem = {
  situationId: string;
  title?: string;
  score?: number;
  max?: number;
  feedback?: string;
  recommendation?: string;
};

export type CandidateSituationsView = {
  kind: "structured" | "legacy_text" | "empty";
  total?: number;
  summary?: string;
  strengths: string[];
  areasToImprove: string[];
  items: CandidateSituationItem[];
  legacyText?: string;
};

export type EmployerRisk = {
  title: string;
  evidence: string;
  severity?: string;
  howToVerify?: string;
};

export type EmployerRedFlag = {
  title: string;
  evidence: string;
  severity?: string;
};

export type EmployerChecklistItem = {
  questionId: string;
  question?: string;
  score?: number;
  /** Per-item maximum (e.g. 5 for v2 quiz items, 100 for percent-scored items). */
  max?: number;
  /** Candidate's answer, when persisted on the feedback item. */
  answer?: string;
  employerFeedback?: string;
  evidence?: string;
  /** Optional AI recommendation for this question. */
  recommendation?: string;
  /** Optional per-item strengths / improvements lists, when present. */
  strengths?: string[];
  improvements?: string[];
};

export type EmployerChecklistView = {
  kind: "structured" | "legacy" | "empty";
  total?: number;
  summary?: string;
  strengths: string[];
  gaps: Array<{ criterion: string; finding: string; impact?: string }>;
  risks: EmployerRisk[];
  redFlags: EmployerRedFlag[];
  items: EmployerChecklistItem[];
  legacyRaw?: unknown;
};

export type EmployerSituationItem = {
  situationId: string;
  title?: string;
  score?: number;
  /** Per-item maximum (defaults to 100 — situations are scored as percentages). */
  max?: number;
  /** Full case prompt shown to the candidate, when present. */
  prompt?: string;
  /** Candidate's answer, when persisted on the feedback item. */
  answer?: string;
  employerFeedback?: string;
  evidence?: string;
  recommendation?: string;
  strengths?: string[];
  improvements?: string[];
};

export type EmployerSituationsView = {
  kind: "structured" | "legacy" | "empty";
  total?: number;
  summary?: string;
  competenciesDemonstrated: string[];
  competenciesWeak: string[];
  risks: EmployerRisk[];
  redFlags: EmployerRedFlag[];
  items: EmployerSituationItem[];
  legacyRaw?: unknown;
};

function asObj(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return x as Record<string, unknown>;
}
function asStr(x: unknown): string | undefined {
  if (x == null) return undefined;
  const s = String(x).trim();
  return s || undefined;
}
function asNum(x: unknown): number | undefined {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function asStrArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map(asStr).filter((s): s is string => !!s);
}
function asArr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

// ---- candidate checklist ----------------------------------------------------

export function adaptCandidateChecklist(raw: unknown): CandidateChecklistView {
  if (!raw) return emptyCandidateChecklist();
  if (typeof raw === "string") {
    const t = raw.trim();
    return t
      ? { kind: "legacy_text", strengths: [], areasToImprove: [], items: [], legacyText: t }
      : emptyCandidateChecklist();
  }
  const obj = asObj(raw);
  if (!obj) return emptyCandidateChecklist();

  // New structured candidate feedback shape.
  const items = asArr(obj.items).map((it): CandidateItem | null => {
    const o = asObj(it); if (!o) return null;
    return {
      questionId: String(o.question_id ?? o.id ?? ""),
      question: asStr(o.question),
      score: asNum(o.score),
      max: asNum(o.max),
      feedback: asStr(o.feedback),
      recommendation: asStr(o.recommendation),
      // expected_answer / correct / employer_feedback / evidence — DROPPED
    };
  }).filter((x): x is CandidateItem => !!x && !!x.questionId);

  const hasStructured = items.length > 0
    || asStr(obj.summary)
    || asStrArray(obj.strengths).length
    || asStrArray(obj.areas_to_improve).length;

  if (!hasStructured) {
    // Unknown JSON — never render as raw. Treat as legacy text only if there
    // is a single recognisable summary-like string.
    const guess = asStr((obj as any).text) || asStr((obj as any).summary);
    return guess
      ? { kind: "legacy_text", strengths: [], areasToImprove: [], items: [], legacyText: guess }
      : emptyCandidateChecklist();
  }

  return {
    kind: "structured",
    total: asNum(obj.total),
    summary: asStr(obj.summary),
    strengths: asStrArray(obj.strengths),
    areasToImprove: asStrArray(obj.areas_to_improve),
    items,
  };
}

function emptyCandidateChecklist(): CandidateChecklistView {
  return { kind: "empty", strengths: [], areasToImprove: [], items: [] };
}

// ---- candidate situations ---------------------------------------------------

export function adaptCandidateSituations(raw: unknown): CandidateSituationsView {
  if (!raw) return emptyCandidateSituations();
  if (typeof raw === "string") {
    const t = raw.trim();
    return t
      ? { kind: "legacy_text", strengths: [], areasToImprove: [], items: [], legacyText: t }
      : emptyCandidateSituations();
  }
  const obj = asObj(raw);
  if (!obj) return emptyCandidateSituations();

  const items = asArr(obj.items).map((it): CandidateSituationItem | null => {
    const o = asObj(it); if (!o) return null;
    return {
      situationId: String(o.situation_id ?? o.id ?? ""),
      title: asStr(o.title),
      score: asNum(o.score),
      max: asNum(o.max),
      feedback: asStr(o.feedback),
      recommendation: asStr(o.recommendation),
      // criteria / employer_feedback / risks / red_flags — DROPPED
    };
  }).filter((x): x is CandidateSituationItem => !!x && !!x.situationId);

  const hasStructured = items.length > 0
    || asStr(obj.summary)
    || asStrArray(obj.strengths).length
    || asStrArray(obj.areas_to_improve).length;

  if (!hasStructured) {
    const guess = asStr((obj as any).text) || asStr((obj as any).summary);
    return guess
      ? { kind: "legacy_text", strengths: [], areasToImprove: [], items: [], legacyText: guess }
      : emptyCandidateSituations();
  }

  return {
    kind: "structured",
    total: asNum(obj.total),
    summary: asStr(obj.summary),
    strengths: asStrArray(obj.strengths),
    areasToImprove: asStrArray(obj.areas_to_improve),
    items,
  };
}

function emptyCandidateSituations(): CandidateSituationsView {
  return { kind: "empty", strengths: [], areasToImprove: [], items: [] };
}

// ---- employer checklist -----------------------------------------------------

function adaptRisks(x: unknown): EmployerRisk[] {
  return asArr(x).map((r): EmployerRisk | null => {
    const o = asObj(r); if (!o) return null;
    const title = asStr(o.title);
    const evidence = asStr(o.evidence);
    if (!title || !evidence) return null;
    return {
      title, evidence,
      severity: asStr(o.severity),
      howToVerify: asStr(o.how_to_verify),
    };
  }).filter((x): x is EmployerRisk => !!x);
}
function adaptRedFlags(x: unknown): EmployerRedFlag[] {
  return asArr(x).map((r): EmployerRedFlag | null => {
    const o = asObj(r); if (!o) return null;
    const title = asStr(o.title);
    const evidence = asStr(o.evidence);
    if (!title || !evidence) return null;
    return { title, evidence, severity: asStr(o.severity) };
  }).filter((x): x is EmployerRedFlag => !!x);
}

export function adaptEmployerChecklist(raw: unknown): EmployerChecklistView {
  if (!raw) return emptyEmployerChecklist();
  if (typeof raw === "string") {
    const t = raw.trim();
    return t
      ? { kind: "legacy", strengths: [], gaps: [], risks: [], redFlags: [], items: [], legacyRaw: t }
      : emptyEmployerChecklist();
  }
  const obj = asObj(raw);
  if (!obj) return emptyEmployerChecklist();

  const items = asArr(obj.items).map((it): EmployerChecklistItem | null => {
    const o = asObj(it); if (!o) return null;
    return {
      questionId: String(o.question_id ?? o.id ?? ""),
      question: asStr(o.question),
      score: asNum(o.score),
      max: asNum(o.max),
      answer: asStr(o.answer ?? o.candidate_answer ?? o.answer_text),
      employerFeedback: asStr(o.employer_feedback ?? o.feedback),
      evidence: asStr(o.evidence),
      recommendation: asStr(o.recommendation),
      strengths: asStrArray(o.strengths),
      improvements: asStrArray(o.areas_to_improve ?? o.improvements),
    };
  }).filter((x): x is EmployerChecklistItem => !!x && !!x.questionId);

  type Gap = { criterion: string; finding: string; impact?: string };
  const gaps: Gap[] = asArr(obj.gaps).map((g): Gap | null => {
    const o = asObj(g); if (!o) return null;
    const criterion = asStr(o.criterion); const finding = asStr(o.finding);
    if (!criterion || !finding) return null;
    const out: Gap = { criterion, finding };
    const impact = asStr(o.impact);
    if (impact) out.impact = impact;
    return out;
  }).filter((x): x is Gap => !!x);

  const risks = adaptRisks(obj.risks);
  const redFlags = adaptRedFlags(obj.red_flags);

  const hasStructured = items.length || gaps.length || risks.length || redFlags.length
    || asStr(obj.summary) || asStrArray(obj.strengths).length;
  if (!hasStructured) {
    return { kind: "legacy", strengths: [], gaps: [], risks: [], redFlags: [], items: [], legacyRaw: obj };
  }

  return {
    kind: "structured",
    total: asNum(obj.total),
    summary: asStr(obj.summary),
    strengths: asStrArray(obj.strengths),
    gaps, risks, redFlags, items,
  };
}

function emptyEmployerChecklist(): EmployerChecklistView {
  return { kind: "empty", strengths: [], gaps: [], risks: [], redFlags: [], items: [] };
}

// ---- employer situations ----------------------------------------------------

export function adaptEmployerSituations(raw: unknown): EmployerSituationsView {
  if (!raw) return emptyEmployerSituations();
  if (typeof raw === "string") {
    const t = raw.trim();
    return t
      ? { kind: "legacy", competenciesDemonstrated: [], competenciesWeak: [], risks: [], redFlags: [], items: [], legacyRaw: t }
      : emptyEmployerSituations();
  }
  const obj = asObj(raw);
  if (!obj) return emptyEmployerSituations();

  const items = asArr(obj.items).map((it): EmployerSituationItem | null => {
    const o = asObj(it); if (!o) return null;
    return {
      situationId: String(o.situation_id ?? o.id ?? ""),
      title: asStr(o.title),
      score: asNum(o.score),
      max: asNum(o.max),
      prompt: asStr(o.brief ?? o.prompt ?? o.case_text ?? o.question),
      answer: asStr(o.answer ?? o.candidate_answer ?? o.answer_text),
      employerFeedback: asStr(o.employer_feedback ?? o.feedback),
      evidence: asStr(o.evidence),
      recommendation: asStr(o.recommendation),
      strengths: asStrArray(o.strengths),
      improvements: asStrArray(o.areas_to_improve ?? o.improvements),
    };
  }).filter((x): x is EmployerSituationItem => !!x && !!x.situationId);

  const risks = adaptRisks(obj.risks);
  const redFlags = adaptRedFlags(obj.red_flags);
  const demonstrated = asStrArray(obj.competencies_demonstrated ?? obj.strengths);
  const weak = asStrArray(obj.competencies_weak ?? obj.areas_to_improve);

  const hasStructured = items.length || risks.length || redFlags.length
    || demonstrated.length || weak.length || asStr(obj.summary) || asStr(obj.advice) || asStr(obj.overall);
  if (!hasStructured) {
    return { kind: "legacy", competenciesDemonstrated: [], competenciesWeak: [], risks: [], redFlags: [], items: [], legacyRaw: obj };
  }

  return {
    kind: "structured",
    total: asNum(obj.total),
    // Legacy situations v1 records emit the section-wide conclusion under
    // `advice` (or, in some early drafts, `overall`). Fall back to those so
    // the "Общий вывод по ситуациям" block actually renders for historic
    // candidates instead of silently disappearing.
    summary: asStr(obj.summary) || asStr(obj.advice) || asStr(obj.overall),
    competenciesDemonstrated: demonstrated,
    competenciesWeak: weak,
    risks, redFlags, items,
  };
}

function emptyEmployerSituations(): EmployerSituationsView {
  return { kind: "empty", competenciesDemonstrated: [], competenciesWeak: [], risks: [], redFlags: [], items: [] };
}

// ---- error mapping ---------------------------------------------------------

/** Safe-code → human message mapping (Phase 3B-2B Step D1). */
export function describeJobError(code: string | null | undefined): string {
  const c = (code || "").toLowerCase();
  switch (c) {
    case "answers_missing":
      return "Не удалось найти все ответы. Проверьте заполнение этапа и запустите анализ снова.";
    case "answers_version_changed":
      return "Ответы были изменены во время анализа. Запустите оценку ещё раз.";
    case "checklist_version_changed":
      return "Анкета вакансии была обновлена. Запустите оценку ещё раз.";
    case "situations_version_changed":
      return "Ситуации вакансии были обновлены. Запустите оценку ещё раз.";
    case "orchestration_failed":
      return "Не удалось запустить AI-анализ из-за технической ошибки. Попробуйте повторить позже.";
    case "save_failed":
      return "Анализ завершён, но результат не удалось сохранить. Попробуйте повторить позже.";
    case "fallback_failed":
    case "fallback_unavailable":
      return "AI-сервис временно недоступен. Попробуйте повторить позже.";
    case "no_credits":
      return "Недостаточно интервью в тарифе для проведения AI-анализа.";
    case "no_resume":
    case "file_deleted":
    case "file_missing":
      return "Файл резюме недоступен. Загрузите резюме заново и повторите анализ.";
    default:
      return "Не удалось завершить AI-анализ. Попробуйте позже.";
  }
}