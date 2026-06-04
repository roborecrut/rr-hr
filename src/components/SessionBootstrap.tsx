/**
 * Глобальный bootstrap-слой:
 * 1) Снимает `?ref=emp123` из URL и складывает в localStorage до OAuth-редиректа.
 * 2) На событие SIGNED_IN однократно вызывает edge-функцию `signup-bootstrap`,
 *    которая привязывает реферера к новому работодателю и начисляет +1000 RR
 *    приглашающему (бонус приглашённому даёт DB-триггер).
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "rr_ref";
const DONE_KEY = "rr_bootstrap_done";

export default function SessionBootstrap() {
  useEffect(() => {
    // 1. Capture ?ref= from current URL (persists across Google OAuth redirect)
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref");
      if (ref && /^emp\d+$/i.test(ref)) {
        localStorage.setItem(REF_KEY, ref.toLowerCase());
      }
    } catch { /* ignore */ }

    // 2. On sign-in, call signup-bootstrap once per user
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;
      const doneKey = `${DONE_KEY}:${session.user.id}`;
      if (localStorage.getItem(doneKey)) return;

      const ref = localStorage.getItem(REF_KEY) || undefined;
      // Defer to next tick so React/Router doesn't fight us
      setTimeout(async () => {
        try {
          await supabase.functions.invoke("signup-bootstrap", {
            body: { ref },
          });
        } catch (e) {
          console.warn("[signup-bootstrap] failed", e);
        } finally {
          localStorage.setItem(doneKey, "1");
          localStorage.removeItem(REF_KEY);
        }
      }, 0);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}