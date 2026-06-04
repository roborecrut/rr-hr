/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recovers from two broken OAuth landings:
 *
 * 1. Supabase falls back to Site URL (e.g. "/") instead of "/auth/callback"
 *    when the redirect URL isn't whitelisted. The URL still carries
 *    `#access_token=...` (implicit) or `?code=...` (PKCE) — we hand it off
 *    to /auth/callback so the standard finalize flow runs.
 *
 * 2. The user is signed in (session exists) but finalize never created the
 *    employer/candidate row (no public_id resolvable). We re-trigger
 *    finalize via /auth/callback?recover=1 so they end up in their cabinet
 *    instead of stuck on the main page.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";

const SKIP_PATH_PREFIXES = [
  "/auth/callback",
  "/admin",
  "/setup",
];

export default function AuthRecover() {
  useEffect(() => {
    (async () => {
      try {
        const { pathname, hash, search } = window.location;
        if (SKIP_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return;

        // (1) OAuth artifacts on a non-callback route -> hand off to /auth/callback
        const hasOAuthArtifact =
          hash.includes("access_token=") ||
          hash.includes("refresh_token=") ||
          /[?&]code=/.test(search);
        if (hasOAuthArtifact) {
          // Preserve intent if we know it from session storage
          let intent = "employer";
          try {
            const raw = sessionStorage.getItem("pendingGoogleAuth");
            if (raw) {
              const p = JSON.parse(raw);
              if (p?.intent) intent = p.intent;
            }
          } catch { /* ignore */ }
          const sep = search ? "&" : "?";
          window.location.replace(`/auth/callback${search}${sep}intent=${intent}${hash}`);
          return;
        }

        // (2) Signed in but no profile resolvable -> re-run finalize
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const path = await resolveProfilePathForUser(session.user.id);
        if (path && path !== "/") return; // already has a cabinet

        // Skip recovery for admin-only users (they may not need a cabinet)
        try {
          const { data: adminRow } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "admin")
            .maybeSingle();
          if (adminRow) return;
        } catch { /* ignore */ }

        const meta = (session.user.user_metadata || {}) as Record<string, unknown>;
        const intent = (meta.intent === "candidate" ? "candidate" : "employer");
        // Only on the main/landing routes — don't hijack other pages.
        if (pathname !== "/" && pathname !== "/main" && pathname !== "/auth") return;
        window.location.replace(`/auth/callback?intent=${intent}&recover=1`);
      } catch { /* ignore */ }
    })();
  }, []);
  return null;
}