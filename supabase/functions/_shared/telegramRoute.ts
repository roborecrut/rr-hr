// Pure helpers for Telegram OIDC redirect/whitelist + post-auth routing.
// Importable from both edge functions (Deno) and the frontend (Vite/TS).

export const ALLOWED_HOSTS = new Set<string>([
  "hr-rr.online",
  "www.hr-rr.online",
  "hr-rr.ru",
  "www.hr-rr.ru",
]);

export function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  if (h.endsWith(".lovable.app")) return true;
  if (h.endsWith(".lovableproject.com")) return true;
  return false;
}

export type SafeRedirectReason =
  | "empty"
  | "parse_error"
  | "bad_protocol"
  | "host_not_allowed"
  | "bad_port"
  | "has_userinfo";

export interface SafeRedirectResult {
  url: URL;
  rejected: boolean;
  reason?: SafeRedirectReason;
  originalInput?: string | null;
}

const FALLBACK = "https://hr-rr.online";

export function safeRedirect(input: string | undefined | null): SafeRedirectResult {
  if (!input) {
    return { url: new URL(FALLBACK), rejected: true, reason: "empty", originalInput: input ?? null };
  }
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { url: new URL(FALLBACK), rejected: true, reason: "parse_error", originalInput: input };
  }
  if (u.protocol !== "https:") {
    return { url: new URL(FALLBACK), rejected: true, reason: "bad_protocol", originalInput: input };
  }
  if (u.username || u.password) {
    return { url: new URL(FALLBACK), rejected: true, reason: "has_userinfo", originalInput: input };
  }
  if (u.port && u.port !== "443") {
    return { url: new URL(FALLBACK), rejected: true, reason: "bad_port", originalInput: input };
  }
  if (!isAllowedHost(u.hostname)) {
    return { url: new URL(FALLBACK), rejected: true, reason: "host_not_allowed", originalInput: input };
  }
  return { url: u, rejected: false };
}

export type NextRejectReason =
  | "empty"
  | "too_long"
  | "bad_encoding"
  | "decoded_traversal"
  | "bad_scheme"
  | "protocol_relative"
  | "path_traversal"
  | "disallowed_path"
  | "cross_origin"
  | "parse_error";

export interface SafeNextResult {
  value: string | null;
  rejected: boolean;
  reason?: NextRejectReason;
}

const DISALLOWED_PREFIXES = ["/auth/telegram/", "/api/", "/functions/"];

/**
 * Hardened next-path sanitizer.
 * Returns the validated path (string starting with "/") or null with a reason.
 */
export function safeNextPathStrict(
  raw: string | null | undefined,
  currentOrigin: string,
): SafeNextResult {
  if (!raw) return { value: null, rejected: true, reason: "empty" };
  if (raw.length > 1024) return { value: null, rejected: true, reason: "too_long" };

  // Reject null bytes and backslash encodings before decoding.
  const lower = raw.toLowerCase();
  if (lower.includes("%00") || lower.includes("%5c")) {
    return { value: null, rejected: true, reason: "bad_encoding" };
  }
  // Catch single & double-encoded traversal/scheme tricks.
  if (
    lower.includes("%2f%2f") ||
    lower.includes("%2e%2e") ||
    lower.includes("%252e") ||
    lower.includes("%252f")
  ) {
    return { value: null, rejected: true, reason: "decoded_traversal" };
  }

  let val = raw;

  // Absolute URL: must be same-origin https
  if (/^[a-z][a-z0-9+.\-]*:/i.test(val)) {
    let u: URL;
    try {
      u = new URL(val);
    } catch {
      return { value: null, rejected: true, reason: "parse_error" };
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return { value: null, rejected: true, reason: "bad_scheme" };
    }
    if (u.origin !== currentOrigin) {
      return { value: null, rejected: true, reason: "cross_origin" };
    }
    val = `${u.pathname}${u.search}`;
  }

  if (val.startsWith("//") || val.startsWith("\\\\") || val.startsWith("\\")) {
    return { value: null, rejected: true, reason: "protocol_relative" };
  }
  if (!val.startsWith("/")) {
    return { value: null, rejected: true, reason: "bad_scheme" };
  }

  // Decode path and check traversal segments.
  let decoded: string;
  try {
    decoded = decodeURIComponent(val.split("?")[0]);
  } catch {
    return { value: null, rejected: true, reason: "bad_encoding" };
  }
  const segs = decoded.split("/");
  for (const s of segs) {
    if (s === ".." || s === ".") {
      return { value: null, rejected: true, reason: "path_traversal" };
    }
  }
  for (const p of DISALLOWED_PREFIXES) {
    if (decoded.startsWith(p)) {
      return { value: null, rejected: true, reason: "disallowed_path" };
    }
  }
  return { value: val, rejected: false };
}

/** Legacy shape: returns string|null. Prefer safeNextPathStrict. */
export function safeNextPath(
  raw: string | null | undefined,
  currentOrigin: string,
): string | null {
  return safeNextPathStrict(raw, currentOrigin).value;
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