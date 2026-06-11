/**
 * Сброс прикладного кэша между ролями/маршрутами.
 *
 * Что чистим всегда:
 *  - весь sessionStorage (кроме явных whitelisted ключей)
 *  - транзиентные ключи localStorage: demo-флоу, drag-and-drop, чат AI-ассистента
 *
 * Что сохраняем по умолчанию:
 *  - Supabase auth-токены (`sb-*`)
 *  - реферальные/онбординг-флаги (`rr_*`)
 *
 * Флаги keepEmployer / keepCandidate дополнительно сохраняют ключи
 * соответствующей роли (employer_session_*, cand_session*, и т.п.).
 */

export type ResetOptions = {
  keepEmployer?: boolean;
  keepCandidate?: boolean;
};

const EMPLOYER_KEYS = new Set([
  "employer_session_id",
  "employer_session_user_id",
  "employer_tg_id",
  "employer_assistant_chat_v1",
]);

const CANDIDATE_KEYS = new Set([
  "cand_session",
  "cand_session_id",
  "cand_role",
]);

// Транзиентные ключи — всегда удаляются при сбросе.
const TRANSIENT_PREFIXES = ["demo:tpl:"];
const TRANSIENT_KEYS = new Set([
  "demo:state",
  "dragged_candidate_id",
]);

const SESSION_KEEP = new Set<string>([]); // sessionStorage чистим целиком

function shouldKeep(key: string, opts: ResetOptions): boolean {
  // Транзиентные — никогда не сохраняем.
  if (TRANSIENT_KEYS.has(key)) return false;
  if (TRANSIENT_PREFIXES.some((p) => key.startsWith(p))) return false;

  // Supabase auth — всегда сохраняем.
  if (key.startsWith("sb-")) return true;
  // Реферал/оферта/онбординг — всегда сохраняем.
  if (key.startsWith("rr_")) return true;

  if (opts.keepEmployer && EMPLOYER_KEYS.has(key)) return true;
  if (opts.keepCandidate && CANDIDATE_KEYS.has(key)) return true;

  // Всё остальное (включая ключи противоположной роли) — удаляем.
  return false;
}

export function resetAppCache(opts: ResetOptions = {}): void {
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key) continue;
      if (!shouldKeep(key, opts)) toRemove.push(key);
    }
    for (const k of toRemove) ls.removeItem(k);
  } catch { /* ignore */ }

  try {
    const ss = window.sessionStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const key = ss.key(i);
      if (!key) continue;
      if (!SESSION_KEEP.has(key)) toRemove.push(key);
    }
    for (const k of toRemove) ss.removeItem(k);
  } catch { /* ignore */ }
}

// Идентификатор раздела для CacheResetGuard.
export type RouteScope = "employer" | "candidate" | "public";

export function routeScope(pathname: string): RouteScope {
  const p = (pathname || "/").toLowerCase();
  if (p.startsWith("/emp") || p === "/setup" || p.startsWith("/employer")) return "employer";
  if (p.startsWith("/cand") || p.startsWith("/candidate")) return "candidate";
  return "public";
}

export function resetForScope(scope: RouteScope): void {
  if (scope === "employer") return resetAppCache({ keepEmployer: true });
  if (scope === "candidate") return resetAppCache({ keepCandidate: true });
  // public: чистим только транзиентное, но сохраняем обе роли,
  // чтобы пользователь мог вернуться в свой ЛК без повторного логина.
  return resetAppCache({ keepEmployer: true, keepCandidate: true });
}