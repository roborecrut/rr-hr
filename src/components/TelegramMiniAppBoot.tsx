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
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import { isTelegramMiniApp } from "@/lib/miniapp";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const resolveProfilePath = resolveProfilePathForUser;

export default function TelegramMiniAppBoot() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [showSplash, setShowSplash] = useState<boolean>(() => isTelegramMiniApp());
  const [splashMsg, setSplashMsg] = useState<string>("Подключаемся к Telegram…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // Wait briefly for Telegram WebApp SDK to inject initData
      let tg: any = (window as any)?.Telegram?.WebApp;
      let initData: string | undefined = tg?.initData;
      for (let i = 0; i < 10 && !initData; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tg = (window as any)?.Telegram?.WebApp;
        initData = tg?.initData;
      }
      // Fallback: extract tgWebAppData from launch params in hash/search.
      // Telegram Mini Apps spec allows launch params via location.hash.
      if (!initData) {
        try {
          const hash = window.location.hash.replace(/^#/, "");
          const search = window.location.search.replace(/^\?/, "");
          const params = new URLSearchParams(hash || search);
          const tgwad = params.get("tgWebAppData");
          if (tgwad) initData = tgwad;
        } catch { /* ignore */ }
      }
      // Detect whether we are actually inside Telegram, even without initData.
      const ua = navigator.userAgent || "";
      const insideTelegram =
        /Telegram/i.test(ua) ||
        !!(tg && (tg.platform && tg.platform !== "unknown")) ||
        !!(tg && tg.initDataUnsafe && Object.keys(tg.initDataUnsafe).length);
      if (!initData) {
        if (insideTelegram) {
          setSplashMsg("Не удалось получить данные Telegram. Откройте Mini App заново.");
          // Real Telegram context but no initData — log for diagnostics.
          try {
            await fetch(`${FN_URL}/log-client-error`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "telegram-miniapp-boot",
                message: "miniapp_no_init_data",
                meta: {
                  ua, platform: tg?.platform || null,
                  host: window.location.host, path: window.location.pathname,
                  hasTg: !!tg,
                },
              }),
              keepalive: true,
            });
          } catch { /* ignore */ }
          // Keep splash visible briefly so the user sees the message.
          setTimeout(() => setShowSplash(false), 2500);
          return;
        }
        setShowSplash(false);
        return;
      }
      // ^ telegram-web-app.js script loads on every page, so window.Telegram.WebApp
      // always exists. We only act when initData is present (real Mini App context).

      try { tg.ready?.(); tg.expand?.(); } catch { /* noop */ }
      setShowSplash(true);
      setSplashMsg("Загружаем ваш профиль…");

      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session?.user) {
        const path = await resolveProfilePath(existing.session.user.id);
        setSplashMsg("Открываем личный кабинет…");
        navigate(path, { replace: true });
        setTimeout(() => setShowSplash(false), 400);
        return;
      }

      try {
        setSplashMsg("Регистрируем аккаунт…");
        // Backend reuses any existing telegram_link for this tg user regardless
        // of intent; intent is derived from startParam (emp.../emp...com...vac...).
        // start_param comes from t.me/HR_RRbot/app?startapp=<empPublicId> (referral)
        const startParam: string | undefined = tg?.initDataUnsafe?.start_param;
        const res = await fetch(`${FN_URL}/telegram-miniapp-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, ref: startParam || "" }),
        });
        const data = await res.json();
        if (!res.ok || !data?.token_hash) {
          setSplashMsg("Ошибка авторизации. Попробуйте позже.");
          console.warn("[TelegramMiniAppBoot] auth failed:", data?.error || res.status);
          try {
            await fetch(`${FN_URL}/log-client-error`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "telegram-miniapp-auth",
                message: `${res.status} ${data?.error || "unknown"}`,
                meta: { status: res.status, body: data },
              }),
              keepalive: true,
            });
          } catch { /* ignore */ }
          setTimeout(() => setShowSplash(false), 2500);
          return;
        }
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: data.token_hash,
        });
        if (error) {
          setSplashMsg("Не удалось войти. Попробуйте позже.");
          console.warn("[TelegramMiniAppBoot] verifyOtp failed:", error.message);
          setTimeout(() => setShowSplash(false), 2500);
          return;
        }
        setSplashMsg("Открываем личный кабинет…");
        const path = data?.target || await resolveProfilePath(data.user_id);
        navigate(path, { replace: true });
        setTimeout(() => setShowSplash(false), 500);
      } catch (e: any) {
        setSplashMsg("Сетевая ошибка. Проверьте соединение.");
        console.warn("[TelegramMiniAppBoot] error:", e?.message || e);
        try {
          await fetch(`${FN_URL}/log-client-error`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "telegram-miniapp-boot",
              message: e?.message || "unknown",
              meta: { stack: e?.stack },
            }),
            keepalive: true,
          });
        } catch { /* ignore */ }
        setTimeout(() => setShowSplash(false), 2500);
      }
    })();
  }, [navigate]);

  if (!showSplash) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-[#0E2238] via-[#13314D] to-[#0E2238] text-white px-6"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[#E7C768]/25 blur-2xl animate-pulse" />
        <img
          src="https://i.ibb.co/1GqTNLY8/RR3.png"
          alt="RoboRecrut"
          className="relative w-32 h-32 md:w-40 md:h-40 object-contain animate-bounce"
          style={{ animationDuration: "1.6s" }}
        />
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-sm md:text-base font-semibold text-center text-slate-200 max-w-xs">
          {splashMsg}
        </p>
      </div>
    </div>
  );
}