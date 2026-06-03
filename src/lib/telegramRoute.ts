// Mirror of supabase/functions/_shared/telegramRoute.ts for frontend imports.
// Keep these two files in sync. Pure functions only (no DOM access).

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

export function safeNextPathStrict(
  raw: string | null | undefined,
  currentOrigin: string,
): SafeNextResult {
  if (!raw) return { value: null, rejected: true, reason: "empty" };
  if (raw.length > 1024) return { value: null, rejected: true, reason: "too_long" };

  const lower = raw.toLowerCase();
  if (lower.includes("%00") || lower.includes("%5c")) {
    return { value: null, rejected: true, reason: "bad_encoding" };
  }
  if (
    lower.includes("%2f%2f") ||
    lower.includes("%2e%2e") ||
    lower.includes("%252e") ||
    lower.includes("%252f")
  ) {
    return { value: null, rejected: true, reason: "decoded_traversal" };
  }

  let val = raw;
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

  let decoded: string;
  try {
    decoded = decodeURIComponent(val.split("?")[0]);
  } catch {
    return { value: null, rejected: true, reason: "bad_encoding" };
  }
  for (const s of decoded.split("/")) {
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
  profileFallback: string;
}

export function chooseCandidateTarget(
  i: CandidateTargetInput,
): { target: string; reason: string } {
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