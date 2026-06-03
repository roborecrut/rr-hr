/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Telegram OIDC landing page — reads token_hash from the URL fragment,
 * exchanges it for a Supabase session via verifyOtp, then routes
 * the user into their profile (employer or candidate).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import { useRouter } from "@/components/RouterContext";

function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  let val = raw;
  // If absolute URL, accept only same-origin and reduce to path+search
  try {
    if (/^https?:\/\//i.test(val)) {
      const u = new URL(val);
      if (u.origin !== window.location.origin) return null;
      val = `${u.pathname}${u.search}`;
    }
  } catch {
    return null;
  }
  if (!val.startsWith("/") || val.startsWith("//")) return null;
  // Avoid bouncing back into the OIDC done page
  if (val.startsWith("/auth/telegram/")) return null;
  return val;
}

export default function AuthTelegramDone() {
  const { navigate } = useRouter();
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState("Завершаем вход…");

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash.replace(/^#/, "");
        const search = window.location.search.replace(/^\?/, "");
        const params = new URLSearchParams(hash || search);
        const errParam = params.get("error");
        if (errParam) throw new Error(errParam);

        const tokenHash = params.get("token_hash") || "";
        const intent = (params.get("intent") as "employer" | "candidate") || "candidate";
        const nextPath = safeNextPath(params.get("next"));
        if (!tokenHash) throw new Error("token_hash отсутствует");

        setStatus("Создаём сессию…");
        const { error: vErr } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: tokenHash,
        });
        if (vErr) throw vErr;

        setStatus("Перенаправляем в кабинет…");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Сессия не создана");

        // Resolve target
        let target = "/main";
        if (intent === "employer") {
          try {
            target = await resolveProfilePathForUser(user.id);
          } catch {
            target = "/employer/profile";
          }
        } else {
          // Candidate: how many vacancies (candidate rows) does this user have?
          const { data: rows } = await supabase
            .from("candidates")
            .select("id, public_id")
            .eq("user_id", user.id);
          const count = rows?.length || 0;
          if (count >= 2) {
            const pid = rows?.[0]?.public_id;
            target = pid ? `/candidate${pid}/profile` : "/main";
          } else if (nextPath) {
            target = nextPath;
          } else {
            try {
              target = await resolveProfilePathForUser(user.id);
            } catch {
              target = "/main";
            }
          }
        }

        window.history.replaceState({}, "", window.location.pathname);
        navigate(target);
      } catch (e: any) {
        setError(e?.message || "Ошибка авторизации");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1F33] text-white p-6">
      <div className="max-w-md w-full bg-[#1D3E5E] border border-[#E7C768]/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
        <h1 className="text-2xl font-black text-[#E7C768]">Вход через Telegram</h1>
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