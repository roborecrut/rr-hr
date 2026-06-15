// Lightweight server-side detector for empty / contentless answers.
// Used by grading edge functions to avoid sending obvious zeros to the LLM
// (saves seconds of latency + provider quota). Never invoked for choice
// questions — short literal values are valid there.

const STOPWORDS = new Set<string>([
  "не", "нет", "знаю", "ответа", "без", "пропуск", "skip", "n/a", "na",
  "идк", "хз", "без понятия", "понятия не имею", "не знаю", "затрудняюсь",
  "затрудняюсь ответить", "—", "-", "--", "---", "...", "…", ".",
  "пусто", "пропустить", "next", "пас", "pass", "?", "??", "???",
  "no", "нет ответа", "ничего", "не могу", "не могу ответить",
]);

// Returns true when the answer is empty / whitespace / punctuation only
// / a single repeated char / a known dismissive stopword. Conservative:
// when in doubt, returns false so the LLM still grades the answer.
export function isContentlessAnswer(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw);
  const trimmed = s.trim();
  if (!trimmed) return true;
  // pure punctuation / symbols (no letters or digits at all)
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return true;
  // one repeated character (any case): "aaaa", "....", "—————"
  if (/^(.)\1{1,}$/u.test(trimmed)) return true;
  const lower = trimmed.toLowerCase().replace(/[.!?…]+$/u, "").trim();
  if (STOPWORDS.has(lower)) return true;
  // Very short non-stopword answers stay valid — choice/term/number cases.
  // Heuristic for clearly-too-short for an open-ended question is applied
  // by the caller using question metadata, not here.
  return false;
}

// Stricter heuristic for OPEN-ENDED questions where the caller knows a
// short answer cannot be content. Requires the caller to decide based on
// question kind ("text"|"free"|"situation").
export function isTooShortForOpenEnded(raw: unknown, minChars = 12, minWords = 2): boolean {
  if (isContentlessAnswer(raw)) return true;
  const s = String(raw).trim();
  if (s.length < minChars) return true;
  const words = s.split(/\s+/u).filter(Boolean);
  if (words.length < minWords) return true;
  // single random-looking token like "asdfghjkl" — no vowels at all in Cyrillic/Latin
  if (words.length === 1 && !/[аеёиоуыэюяaeiouy]/iu.test(s)) return true;
  return false;
}

export const CONTENTLESS_COMMENT = "Ответ не предоставлен или слишком короткий для оценки.";