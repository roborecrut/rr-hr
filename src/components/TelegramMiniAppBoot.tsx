/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auto-authenticates a user opening the app inside a Telegram Mini App.
 * - If window.Telegram.WebApp.initData is present and no Supabase session,
 *   call the telegram-miniapp-auth edge function, verifyOtp the magic link,
 *   then redirect to /employer{id}/profile or /candidate{id}/profile
 *   depending on what's registered (creates a candidate by default).
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function resolveProfilePath(userId: string): Promise<string> {
  const { data: emp } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (emp?.id) return `/employer${emp.id}/profile`;
  const { data: cand } = await supabase
    .from("candidates")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (cand?.id) return `/candidate${cand.id}/profile`;
  return "/candidate/profile";
}

export default function TelegramMiniAppBoot() {
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const tg = (window as any)?.Telegram?.WebApp;
    const initData: string | undefined = tg?.initData;
    if (!initData) return;

    try { tg.ready?.(); tg.expand?.(); } catch { /* noop */ }

    (async () => {
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session?.user) {
        const path = await resolveProfilePath(existing.session.user.id);
        navigate(path, { replace: true });
        return;
      }

      // Try employer first (preserves intent if user was previously registered
      // as an employer); fall back to candidate (default Mini App role).
      const tryIntents: Array<"employer" | "candidate"> = ["employer", "candidate"];
      let lastErr = "";
      for (const intent of tryIntents) {
        try {
          const res = await fetch(`${FN_URL}/telegram-miniapp-auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData, intent }),
          });
          const data = await res.json();
          if (!res.ok || !data?.token_hash) { lastErr = data?.error || `http_${res.status}`; continue; }
          const { error } = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash: data.token_hash,
          });
          if (error) { lastErr = error.message; continue; }
          const path = await resolveProfilePath(data.user_id);
          navigate(path, { replace: true });
          return;
        } catch (e: any) {
          lastErr = e?.message || "tg_auth_failed";
        }
      }
      // eslint-disable-next-line no-console
      console.warn("[TelegramMiniAppBoot] auth failed:", lastErr);
    })();
  }, [navigate]);

  return null;
}