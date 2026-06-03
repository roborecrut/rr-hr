// Pure helpers for Telegram OIDC redirect/whitelist + post-auth routing.
// Importable from both edge functions (Deno) and the frontend (Vite/TS).

export const ALLOWED_HOSTS = new Set<string>([
  "hr-rr.online",
  "www.hr-rr.online",
  "hr-rr.ru",
  "www.hr-rr.ru",
]);

export function isAllowedHost(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith(".lovable.app")) return true;
  if (host.endsWith(".lovableproject.com")) return true;
  return false;
}

export interface SafeRedirectResult {
  url: URL;
  rejected: boolean;
  reason?: "empty" | "parse_error" | "bad_protocol" | "host_not_allowed";
  originalInput?: string | null;
}

const FALLBACK = "https://hr-rr.online";

export function safeRedirect(input: string | undefined | null): SafeRedirectResult {
  if (!input) {
    return { url: new URL(FALLBACK), rejected: true, reason: "empty", originalInput: input ?? null };
  }
  try {
    const u = new URL(input);
    if (u.protocol !== "https:") {
      return { url: new URL(FALLBACK), rejected: true, reason: "bad_protocol", originalInput: input };
    }
    if (!isAllowedHost(u.hostname)) {
      return { url: new URL(FALLBACK), rejected: true, reason: "host_not_allowed", originalInput: input };
    }
    return { url: u, rejected: false };
  } catch {
    return { url: new URL(FALLBACK), rejected: true, reason: "parse_error", originalInput: input };
  }
}

// Frontend-friendly next path sanitizer.
// Accepts an absolute URL (must match currentOrigin) or a path starting with "/".
// Rejects protocol-relative ("//evil"), the OIDC done page, and cross-origin URLs.
export function safeNextPath(raw: string | null | undefined, currentOrigin: string): string | null {
  if (!raw) return null;
  let val = raw;
  try {
    if (/^https?:\/\//i.test(val)) {
      const u = new URL(val);
      if (u.origin !== currentOrigin) return null;
      val = `${u.pathname}${u.search}`;
    }
  } catch {
    return null;
  }
  if (!val.startsWith("/") || val.startsWith("//")) return null;
  if (val.startsWith("/auth/telegram/")) return null;
  return val;
}

export interface CandidateTargetInput {
  vacancyCount: number;
  firstPublicId?: string | null;
  nextPath: string | null;
  profileFallback: string; // e.g. result of resolveProfilePathForUser
}

// Decide where to send a candidate after Telegram OIDC.
// - 2+ vacancies: go to the candidate's general profile to pick company/vacancy
// - 1 vacancy + valid next: return to the original landing
// - 0 vacancies or no next: fall back to resolved profile path
export function chooseCandidateTarget(i: CandidateTargetInput): { target: string; reason: string } {
  if (i.vacancyCount >= 2) {
    return {
      target: i.firstPublicId ? `/candidate${i.firstPublicId}/profile` : "/main",
      reason: "multi_vacancy_profile",
    };
  }
  if (i.vacancyCount === 1 && i.nextPath) {
    return { target: i.nextPath, reason: "single_vacancy_next" };
  }
  if (i.nextPath) return { target: i.nextPath, reason: "no_vacancy_next" };
  return { target: i.profileFallback || "/main", reason: "fallback_profile" };
}