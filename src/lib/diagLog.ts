/**
 * diagLog — временная безопасная runtime-диагностика клиентских кнопок
 * (Phase: «Пересчитать AI-оценку» / «Сформировать итог»).
 *
 * Пишет ТОЛЬКО технические коды этапов в public.client_errors.
 * Запрещено сохранять: JWT, candidate_token, тексты резюме, ответы
 * кандидата, промпты, персональные данные, полное содержимое response.
 *
 * Все вызовы делаются fire-and-forget — диагностика никогда не должна
 * влиять на пользовательский поток или таймауты основного запроса.
 */
import { supabase } from "@/integrations/supabase/client";

const MAX_STR = 200;
function safeStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.length > MAX_STR ? s.slice(0, MAX_STR) : s;
}

// Whitelisted meta keys. Anything else выбрасывается. Значения приводятся
// к строке ≤200 символов или числу/булю.
const ALLOWED_KEYS = new Set([
  "stage", "code", "http_status", "request_id", "job_id",
  "first_status", "last_status", "terminal_status", "attempts",
  "ms", "candidate_id_tail", "session", "extra_code",
]);

export function safeMeta(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = safeStr(v);
  }
  return out;
}

/** candidate UUID → последние 8 символов, для корреляции без раскрытия id. */
export function tail(id: string | null | undefined): string {
  const s = String(id || "");
  return s.length <= 8 ? s : s.slice(-8);
}

/**
 * Записывает диагностическую строку в client_errors. Никогда не бросает
 * исключения наружу. `message` обязан быть коротким техническим кодом.
 */
export function diagLog(source: string, message: string, meta: Record<string, unknown> = {}): void {
  try {
    const payload = {
      source: safeStr(source) || "diag",
      message: safeStr(message) || "unknown",
      meta: safeMeta(meta) as unknown as Record<string, string | number | boolean>,
    };
    void (supabase.from("client_errors") as any).insert(payload).then(() => undefined, () => undefined);
  } catch { /* swallow */ }
}

/**
 * Достаёт безопасный код ошибки из ответа supabase.functions.invoke
 * без раскрытия токенов и тел запроса. Возвращает {code, http_status}.
 */
export async function extractInvokeError(error: unknown): Promise<{ code: string; http_status: number | null }> {
  if (!error) return { code: "", http_status: null };
  const anyErr = error as { message?: string; context?: { status?: number; json?: () => Promise<unknown> } };
  let code = anyErr?.message || "invoke_error";
  let http: number | null = anyErr?.context?.status ?? null;
  try {
    const j = anyErr?.context && typeof anyErr.context.json === "function"
      ? await anyErr.context.json()
      : null;
    const body = j as { error?: unknown; code?: unknown } | null;
    if (body && (body.error || body.code)) {
      code = String(body.error ?? body.code);
    }
  } catch { /* ignore */ }
  // Whitelist: код должен быть коротким snake_case-идентификатором.
  if (!/^[a-z0-9_:-]{1,64}$/i.test(code)) code = `http_${http ?? "err"}`;
  return { code: code.slice(0, 64), http_status: http };
}