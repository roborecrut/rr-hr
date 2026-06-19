/**
 * Глобальный bootstrap-слой:
 * 1) Снимает `?ref=emp123` из URL и складывает в localStorage до OAuth-редиректа.
 * 2) На любую активную сессию (initial getSession, INITIAL_SESSION, SIGNED_IN)
 *    однократно вызывает edge-функцию `signup-bootstrap`, которая привязывает
 *    реферера к новому работодателю и начисляет +1000 RR приглашающему
 *    (бонус приглашённому даёт DB-триггер).
 * 3) Сразу редиректит работодателя в /emp{public_id}/profile через
 *    window.location.replace() — это гарантированно закрывает зависший
 *    AuthModal и сбрасывает loading-state без ручного refresh.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cacheEmployerPublicId,
  clearCachedEmployerPublicId,
  readCachedEmployerPublicIdForUser,
} from "@/lib/links";

const REF_KEY = "rr_ref";
const DONE_KEY = "rr_bootstrap_done";

function shouldAutoRedirectFrom(pathname: string): boolean {
  // Авто-редирект в кабинет работодателя — только сразу после OAuth-флоу
  // (страницы /auth и /setup). С лендинга `/`, `/main` и публичных страниц
  // НЕ редиректим: пользователь должен сам нажать «Войти» и при необходимости
  // выбрать другой Google-аккаунт. Иначе в браузерах с несколькими аккаунтами
  // приложение «залипает» на последнем входе.
  return pathname === "/auth" || pathname === "/setup";
}

export default function SessionBootstrap() {
  // In-memory guards prevent double-bootstrap and double-redirect when both
  // getSession() and onAuthStateChange fire for the same user in this tab.
  const bootstrappedUserRef = useRef<string | null>(null);
  const redirectedUserRef = useRef<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    // Strip the stray "#" left by Supabase implicit-flow after OAuth.
    try {
      if (window.location.hash === "" || /^#$/.test(window.location.hash)) {
        const clean = window.location.pathname + window.location.search;
        window.history.replaceState({}, "", clean);
      }
    } catch { /* ignore */ }

    // Capture ?ref= from current URL (persists across Google OAuth redirect)
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref");
      if (ref && /^emp\d+$/i.test(ref)) {
        localStorage.setItem(REF_KEY, ref.toLowerCase());
      }
    } catch { /* ignore */ }

    const handleAuthenticatedSession = async (session: { user: { id: string } } | null) => {
      if (!session?.user) return;
      const userId = session.user.id;
      if (runningRef.current) return;
      if (redirectedUserRef.current === userId) return;
      runningRef.current = true;

      try {
        // 1. Fast-path redirect using cached employer public_id (only this user).
        try {
          const cachedPid = readCachedEmployerPublicIdForUser(userId);
          if (cachedPid) {
            const here = window.location.pathname;
            const target = `/emp${cachedPid}/profile`;
            if (here !== target && shouldAutoRedirectFrom(here)) {
              redirectedUserRef.current = userId;
              window.location.replace(target);
              return;
            }
          }
        } catch { /* ignore */ }

        // 2. signup-bootstrap (once per user per browser)
        const doneKey = `${DONE_KEY}:${userId}`;
        const alreadyDone = !!localStorage.getItem(doneKey);
        if (!alreadyDone && bootstrappedUserRef.current !== userId) {
          bootstrappedUserRef.current = userId;
          const ref = localStorage.getItem(REF_KEY) || undefined;
          try {
            await supabase.functions.invoke("signup-bootstrap", { body: { ref } });
          } catch (e) {
            console.warn("[signup-bootstrap] failed", e);
          } finally {
            localStorage.setItem(doneKey, "1");
            localStorage.removeItem(REF_KEY);
          }
        }

        // 3. Persist offer acceptance if it was flagged at registration.
        try {
          if (localStorage.getItem("rr_offer_accepted") === "1") {
            await supabase.rpc("accept_offer", { _version: "2026-06-06" });
            localStorage.removeItem("rr_offer_accepted");
          }
        } catch (e) {
          console.warn("[accept_offer] failed", e);
        }

        // 4. Resolve employer.public_id and redirect.
        try {
          const { data: emp } = await supabase
            .from("employers")
            .select("public_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (emp?.public_id) {
            cacheEmployerPublicId(emp.public_id, userId);
            const target = `/emp${emp.public_id}/profile`;
            const here = window.location.pathname;
            if (here !== target && shouldAutoRedirectFrom(here)) {
              redirectedUserRef.current = userId;
              window.location.replace(target);
              return;
            }
            redirectedUserRef.current = userId;
          } else {
            clearCachedEmployerPublicId();
          }
        } catch (e) {
          console.warn("[redirect] failed", e);
        }
      } finally {
        runningRef.current = false;
      }
    };

    // Kick off immediately for any pre-existing session on mount.
    supabase.auth.getSession().then(({ data }) => {
      void handleAuthenticatedSession(data.session as any);
    });

    // Listen for new sign-ins / initial session events.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        bootstrappedUserRef.current = null;
        redirectedUserRef.current = null;
        return;
      }
      if (event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void handleAuthenticatedSession(session as any);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}