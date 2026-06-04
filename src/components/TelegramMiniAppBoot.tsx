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
import { resolveProfilePathForUser } from "@/lib/links";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const resolveProfilePath = resolveProfilePathForUser;

export default function TelegramMiniAppBoot() {
  const navigate = useNavigate();
  const ran = useRef(false);

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
        }
        return;
      }
      // ^ telegram-web-app.js script loads on every page, so window.Telegram.WebApp
      // always exists. We only act when initData is present (real Mini App context).

      try { tg.ready?.(); tg.expand?.(); } catch { /* noop */ }

      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session?.user) {
        const path = await resolveProfilePath(existing.session.user.id);
        navigate(path, { replace: true });
        return;
      }

      try {
        // Backend reuses any existing telegram_link for this tg user regardless
        // of intent; new users default to "candidate".
        // start_param comes from t.me/HR_RRbot/app?startapp=<empPublicId> (referral)
        const startParam: string | undefined = tg?.initDataUnsafe?.start_param;
        const res = await fetch(`${FN_URL}/telegram-miniapp-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, intent: "candidate", ref: startParam || "" }),
        });
        const data = await res.json();
        if (!res.ok || !data?.token_hash) {
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
          return;
        }
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: data.token_hash,
        });
        if (error) {
          console.warn("[TelegramMiniAppBoot] verifyOtp failed:", error.message);
          return;
        }
        const path = data?.target || await resolveProfilePath(data.user_id);
        navigate(path, { replace: true });
      } catch (e: any) {
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
      }
    })();
  }, [navigate]);

  return null;
}