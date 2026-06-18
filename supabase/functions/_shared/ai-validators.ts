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