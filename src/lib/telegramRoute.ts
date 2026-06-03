// Mirror of supabase/functions/_shared/telegramRoute.ts for frontend imports.
// Keep these two files in sync. Pure functions only (no DOM access).

export function safeNextPath(
  raw: string | null | undefined,
  currentOrigin: string,
): string | null {
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