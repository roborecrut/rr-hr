/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google OAuth callback page. Supabase has already established the session
 * via /auth/v1/callback by the time we land here. We read the pre-saved
 * { intent, ref, project_slug, company_slug, return_to } from sessionStorage,
 * call the auth-google-finalize edge function to apply intent/referral/
 * employer-or-candidate bootstrap, then navigate to the resolved target.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@/components/RouterContext";
import { resolveProfilePathForUser } from "@/lib/links";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const STORAGE_KEY = "pendingGoogleAuth";

type Pending = {
  intent?: "employer" | "candidate";
  ref?: string;
  project_slug?: string;
  company_slug?: string;
  project_id?: string;
  return_to?: string;
};

export default function AuthCallback() {
  const { navigate } = useRouter();
  const [status, setStatus] = useState("Завершаем вход…");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Read pending payload (may be empty for plain logins)
        let pending: Pending = {};
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY);
          if (raw) pending = JSON.parse(raw) as Pending;
        } catch { /* ignore */ }
        sessionStorage.removeItem(STORAGE_KEY);

        setStatus("Проверяем сессию…");
        // Wait briefly for Supabase to hydrate the session from the URL fragment
        let session = (await supabase.auth.getSession()).data.session;
        for (let i = 0; i < 20 && !session; i++) {
          await new Promise((r) => setTimeout(r, 150));
          session = (await supabase.auth.getSession()).data.session;
        }
        if (!session) throw new Error("Не удалось получить сессию Google");

        // Clean the hash (Supabase puts access_token there)
        try {
          window.history.replaceState({}, "", window.location.pathname);
        } catch { /* ignore */ }

        setStatus("Настраиваем кабинет…");
        // Sync intent into user_metadata so future triggers/queries see it
        try {
          await supabase.auth.updateUser({
            data: {
              intent: pending.intent || "candidate",
              signup_context: pending.project_slug ? "vacancy_landing" : "main",
              company_slug: pending.company_slug || null,
              project_slug: pending.project_slug || null,
            },
          });
        } catch { /* non-blocking */ }
        let target = pending.return_to || "/";
        try {
          const res = await fetch(`${FN_URL}/auth-google-finalize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              intent: pending.intent || "candidate",
              ref: pending.ref || "",
              project_slug: pending.project_slug || "",
              company_slug: pending.company_slug || "",
              project_id: pending.project_id || "",
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.target) target = data.target;
        } catch (e) {
          console.warn("auth-google-finalize failed, falling back", e);
        }

        if (!target || target === "/") {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) target = await resolveProfilePathForUser(user.id);
          } catch { /* keep target */ }
        }

        navigate(target || "/main");
      } catch (e: any) {
        setError(e?.message || "Ошибка авторизации Google");
        try {
          fetch(`${FN_URL}/log-client-error`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "auth-callback",
              message: e?.message || "unknown",
              meta: { stack: e?.stack, pathname: window.location.pathname, search: window.location.search },
            }),
            keepalive: true,
          }).catch(() => {});
        } catch { /* ignore */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1F33] text-white p-6">
      <div className="max-w-md w-full bg-[#1D3E5E] border border-[#E7C768]/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
        <h1 className="text-2xl font-black text-[#E7C768]">Вход через Google</h1>
        {!error ? (
          <>
            <div className="animate-pulse text-slate-200">{status}</div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-[#E7C768] animate-pulse" />
            </div>
          </>
        ) : (
          <>
            <div className="bg-[#FF4C4C]/10 border-l-4 border-[#FF4C4C] p-3 text-sm text-[#FF4C4C] rounded-xl font-semibold text-left">
              ⚠️ {error}
            </div>
            <button
              onClick={() => navigate("/")}
              className="w-full bg-[#E7C768] hover:bg-[#d6b75c] text-[#0F1F33] font-black py-3 rounded-2xl transition"
            >
              Вернуться на главную
            </button>
          </>
        )}
      </div>
    </div>
  );
}