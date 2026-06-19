/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Helpers for the employer/candidate training stage report:
 *
 *   - buildStageQuestionMap: builds Map<stage, Map<question_id, def>> from
 *     training_stage_tests rows so per-question feedback can be merged with
 *     the actual question text by stable `question_id`, not array index.
 *
 *   - mergeStageItems: combines `last_feedback`, `last_answers` and the
 *     question definitions into a single array of items keyed by question_id.
 *     Robust to legacy shapes where order, ids, or whole fields are missing.
 *
 *   - deriveStageSummary: deterministic, AI-free fallback for legacy rows
 *     where `employer_summary` is null. Aggregates strengths/gaps/risks from
 *     per-item feedback so the employer still sees a structured stage report
 *     without re-running paid AI.
 */

export type StageQuestionDef = {
  id: string;
  question: string;
  points: number;
  correct?: string;
  explanation?: string;
};

export type StageQuestionMap = Map<string, Map<string, StageQuestionDef>>;

const ALIASES: Record<string, string> = {
  professional: "professional", prof: "professional", "профессия": "professional",
  product: "product", "продукт": "product",
  system: "system", systems: "system", "система": "system", "системное": "system",
};

function normStage(s: unknown): string {
  const k = String(s ?? "").toLowerCase().trim();
  return ALIASES[k] || k;
}

export function buildStageQuestionMap(rows: Array<{ stage?: string; questions?: unknown }>): StageQuestionMap {
  const out: StageQuestionMap = new Map();
  for (const row of rows || []) {
    const stage = normStage(row?.stage);
    if (!stage) continue;
    const list = Array.isArray(row?.questions) ? row!.questions as any[] : [];
    const inner = new Map<string, StageQuestionDef>();
    list.forEach((q: any, idx: number) => {
      const id = String(q?.id ?? `q${idx + 1}`);
      const question = String(q?.question ?? "").trim();
      const points = Number(q?.points) || 5;
      const def: StageQuestionDef = { id, question, points };
      if (typeof q?.correct === "string") def.correct = q.correct;
      else if (typeof q?.expected_answer === "string") def.correct = q.expected_answer;
      if (typeof q?.explanation === "string") def.explanation = q.explanation;
      inner.set(id, def);
    });
    out.set(stage, inner);
  }
  return out;
}

export type MergedItem = {
  id: string;
  question: string;
  answer: string;
  score: number | null;
  max: number;
  comment: string;
  recommendation: string;
  correct: string;
  is_correct: boolean | null;
};

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Merge per-question feedback with answers and question definitions.
 * Keys by stable question_id — array order in last_feedback and last_answers
 * may differ and must NOT be relied on.
 */
export function mergeStageItems(opts: {
  stage: string;
  feedback: unknown;
  answers: unknown;
  questionsMap?: StageQuestionMap | null;
}): MergedItem[] {
  const fb = Array.isArray(opts.feedback) ? (opts.feedback as any[]) : [];
  const ans = Array.isArray(opts.answers) ? (opts.answers as any[]) : [];
  const ansById = new Map<string, any>();
  ans.forEach((a: any, i: number) => {
    const id = String(a?.question_id ?? a?.id ?? `q${i + 1}`);
    ansById.set(id, a);
  });
  const defMap = opts.questionsMap?.get(normStage(opts.stage)) || null;

  // Use the union of ids from feedback + answers so we never silently drop
  // a question because the AI feedback omitted it.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const f of fb) {
    const id = String(f?.id ?? f?.question_id ?? "");
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  for (const a of ans) {
    const id = String(a?.question_id ?? a?.id ?? "");
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }

  const fbById = new Map<string, any>();
  fb.forEach((f: any) => {
    const id = String(f?.id ?? f?.question_id ?? "");
    if (id) fbById.set(id, f);
  });

  return ids.map((id): MergedItem => {
    const f = fbById.get(id) || {};
    const a = ansById.get(id) || {};
    const def = defMap?.get(id);
    const max = Number(f?.max) || def?.points || 5;
    const scoreRaw = f?.score;
    const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
    const question = pickString(def?.question, a?.question_text, f?.question);
    const answerVal = a?.value;
    const answer = typeof answerVal === "string"
      ? answerVal
      : answerVal != null ? String(answerVal) : "";
    const comment = pickString(f?.comment, f?.feedback, f?.explanation);
    const recommendation = pickString(f?.recommendation, def?.explanation);
    const correct = pickString(def?.correct, f?.correct);
    const isCorrect = score == null ? null : score >= max;
    return { id, question, answer, score, max, comment, recommendation, correct, is_correct: isCorrect };
  });
}

/**
 * Deterministic, AI-free stage summary derived from merged items.
 * Used as a fallback for legacy rows whose `employer_summary` is null,
 * so the employer still sees a structured report without re-running paid AI.
 */
export function deriveStageSummary(items: MergedItem[]): {
  summary: string;
  strengths: string[];
  gaps: string[];
  risks: { title: string; evidence: string; severity?: string }[];
  red_flags: { title: string; evidence: string }[];
  recommendation: string;
} | null {
  if (!items.length) return null;
  const total = items.reduce((s, it) => s + (it.score ?? 0), 0);
  const max = items.reduce((s, it) => s + (it.max || 0), 0);
  const correctCount = items.filter(it => it.is_correct === true).length;
  const wrongItems = items.filter(it => it.score != null && (it.score === 0));
  const partialItems = items.filter(it => it.score != null && it.score > 0 && it.is_correct !== true);
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;

  const strengths = items
    .filter(it => it.is_correct === true && it.question)
    .slice(0, 5)
    .map(it => it.question.length > 120 ? it.question.slice(0, 117).trimEnd() + "…" : it.question);

  const gaps = wrongItems
    .slice(0, 5)
    .map(it => it.question
      ? (it.question.length > 120 ? it.question.slice(0, 117).trimEnd() + "…" : it.question)
      : `Вопрос ${it.id}`,
    );

  const risks = wrongItems.slice(0, 3).map(it => ({
    title: it.question
      ? (it.question.length > 80 ? it.question.slice(0, 77).trimEnd() + "…" : it.question)
      : `Вопрос ${it.id}`,
    evidence: it.correct
      ? `Правильный ответ: ${it.correct}.${it.answer ? ` Ответ кандидата: «${it.answer}».` : ""}`
      : (it.answer ? `Ответ кандидата: «${it.answer}».` : "Кандидат не дал верный ответ."),
    severity: "medium" as const,
  }));

  const summary =
    `Балл: ${total} из ${max} (${pct}%). Верно: ${correctCount} из ${items.length}` +
    (partialItems.length ? `, частично: ${partialItems.length}` : "") +
    (wrongItems.length ? `, неверно: ${wrongItems.length}.` : ".");

  const recommendation = pct >= 90
    ? "Кандидат уверенно владеет материалом этапа."
    : pct >= 70
      ? "Этап пройден. Точечно повторить темы из списка пробелов."
      : "Рекомендуется повторное прохождение материала перед интервью.";

  return { summary, strengths, gaps, risks, red_flags: [], recommendation };
}