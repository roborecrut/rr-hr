/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { useRouter } from "./RouterContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import Mascot from "./Mascot";
import { X, Chrome, Gift } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  intent?: "employer" | "candidate";
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export default function AuthModal({ isOpen, onClose, intent = "employer" }: AuthModalProps) {
  const { navigate, query } = useRouter();

  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const resolveProfilePath = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "/";
    return await resolveProfilePathForUser(user.id);
  };

  const onSuccessRedirect = async () => {
    setIsSuccess(true);
    setTimeout(async () => {
      const target = await resolveProfilePath();
      onClose();
      navigate(target);
    }, 600);
  };

  const handleGoogle = async () => {
    setErrorText(""); setIsLoading(true);
    try {
      // Persist intent/ref/project context so /auth/callback can finalize after Google round-trip
      try {
        const pathname = window.location.pathname;
        let company_slug = "";
        let project_slug = "";
        // Heuristic: /{companySlug}/{projectSlug}[/...]
        const segs = pathname.split("/").filter(Boolean);
        if (segs.length >= 2 && !/^(employer|candidate)/.test(segs[0]) &&
            !["main","vacancy","admin","job","auth","setup","employer","candidate"].includes(segs[0])) {
          company_slug = segs[0];
          project_slug = segs[1];
        }
        sessionStorage.setItem("pendingGoogleAuth", JSON.stringify({
          intent,
          ref: query.ref || "",
          company_slug,
          project_slug,
          project_id: query.project_id || query.id || "",
          return_to: window.location.pathname + window.location.search,
        }));
      } catch { /* ignore */ }
      // Also encode intent in callback URL — sessionStorage may be lost (Safari ITP, new tab)
      const cbParams = new URLSearchParams({ intent });
      if (query.ref) cbParams.set("ref", String(query.ref));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?${cbParams.toString()}`,
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setErrorText(e.message || "Ошибка Google авторизации");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#1D3E5E] border-2 border-[#E7C768]/45 text-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-left animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 hover:bg-white/10 p-2 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Mascot & Title */}
        <div className="text-center flex flex-col items-center gap-2 pb-2 border-b border-white/10">
          <Mascot state="greeting" size="md" />
          <h2 className="text-xl md:text-2xl font-black text-[#E7C768] tracking-tight">
            {intent === "employer" ? "Личный Кабинет Работодателя" : "Вход для кандидата"}
          </h2>
          <p className="text-xs text-slate-300">
            ИИ подбор персонала, запуск авто-собеседований и интерактивного обучения
          </p>
        </div>

        {/* Dynamic Bonus Info Widget! */}
        <div className="bg-emerald-950/40 border border-emerald-500/25 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-[#E7C768] font-bold text-xs uppercase tracking-wider">
            <Gift className="w-4 h-4 text-emerald-400" />
            <span>Бонус при Google-регистрации: +1000 RR на баланс!</span>
          </div>
          <p className="text-[11px] text-slate-200 leading-normal">
            За эту сумму вы получаете <strong className="text-white">лендинг компании и вакансии</strong> с
            ИИ-продажником без ограничений по сроку, а также систему ИИ-найма и ИИ-обучения.
          </p>
        </div>

        {/* 1-Click Action Buttons Container */}
        <div className="space-y-4 pt-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogle}
            className="w-full bg-gradient-to-r from-amber-400/15 to-[#E7C768]/15 hover:from-amber-400/25 hover:to-[#E7C768]/25 border border-[#E7C768]/40 disabled:opacity-50 text-white font-black py-4 px-5 rounded-2xl flex items-center justify-between gap-3 transition-all duration-150 shadow-lg transform active:scale-98 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-[#E7C768]/20 p-2 rounded-xl">
                <Chrome className="w-5 h-5 text-[#E7C768]" />
              </div>
              <div className="text-left">
                <div className="text-xs uppercase tracking-wider font-mono opacity-80">Регистрация / Вход</div>
                <div className="text-sm font-extrabold">
                  {isLoading ? "Открываем Google…" : "Войти через Google"}
                </div>
              </div>
            </div>
            <span className="bg-emerald-900 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              +1000 RR
            </span>
          </button>
        </div>

        {/* Error / Success Banners */}
        {errorText && (
          <div className="bg-[#FF4C4C]/10 border-l-4 border-[#FF4C4C] p-3 text-xs text-[#FF4C4C] rounded-xl font-semibold">
            ⚠️ {errorText}
          </div>
        )}

        {isSuccess && (
          <div className="bg-emerald-950/45 border-l-4 border-emerald-400 p-3 text-xs text-emerald-300 rounded-xl animate-pulse font-semibold">
            ✅ Вход выполнен. Начисляем +1000 RR и перенаправляем в кабинет…
          </div>
        )}

        <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest leading-relaxed">
          Безопасное соединение • Вход в 1 клик • Ваши данные надежно защищены
        </p>

      </div>
    </div>
  );
}
