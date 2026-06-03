/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "./RouterContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePathForUser } from "@/lib/links";
import Mascot from "./Mascot";
import { 
  X,
  Send, 
  Chrome,
  Gift,
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { navigate, query } = useRouter();

  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [authVia, setAuthVia] = useState<"telegram" | "google" | null>(null);
  const [botUsername, setBotUsername] = useState<string>("");
  const tgContainerRef = useRef<HTMLDivElement>(null);

  // Fetch bot username + expose global callback for Telegram widget
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch(`${FN_URL}/telegram-config`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setBotUsername(String(d.username || "").replace(/^@+/, "").trim());
      })
      .catch(() => {});

    (window as any).__rrTgAuth = (payload: Record<string, unknown>) => {
      handleTelegram(payload).catch((e) => setErrorText(e?.message || "Ошибка Telegram"));
    };
    return () => {
      cancelled = true;
      delete (window as any).__rrTgAuth;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Inject Telegram widget script once bot username is known
  useEffect(() => {
    if (!isOpen || !botUsername || !tgContainerRef.current) return;
    tgContainerRef.current.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", botUsername);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "12");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "__rrTgAuth(user)");
    tgContainerRef.current.appendChild(s);
  }, [isOpen, botUsername]);

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

  const handleTelegram = async (tgPayload: Record<string, unknown>) => {
    setErrorText(""); setIsLoading(true); setAuthVia("telegram");
    try {
      const res = await fetch(`${FN_URL}/telegram-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tgPayload, intent: "employer", ref: query.ref || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось войти через Telegram");
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: data.token_hash,
      });
      if (error) throw error;
      await onSuccessRedirect();
    } catch (e: any) {
      setErrorText(e.message || "Ошибка Telegram авторизации");
    } finally { setIsLoading(false); }
  };

  const handleGoogle = async () => {
    setErrorText(""); setIsLoading(true); setAuthVia("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/employer/profile`,
          queryParams: { intent: "employer" },
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
            Личный Кабинет Работодателя
          </h2>
          <p className="text-xs text-slate-300">
            ИИ подбор персонала, запуск авто-собеседований и интерактивного обучения
          </p>
        </div>

        {/* Dynamic Bonus Info Widget! */}
        <div className="bg-emerald-950/40 border border-emerald-500/25 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-[#E7C768] font-bold text-xs uppercase tracking-wider">
            <Gift className="w-4 h-4 text-emerald-400" />
            <span>Бонус при регистрации: +1,000 RR на баланс!</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-200 leading-normal">
            <div className="bg-black/25 p-2.5 rounded-xl border border-white/5 space-y-1">
              <div className="font-bold text-amber-300 flex items-center gap-1">
                <Send className="w-3 h-3" /> Через Telegram
              </div>
              <p>Создание <strong className="text-white">всей ИИ-системы найма под ключ</strong> бесплатно:</p>
              <p className="text-slate-400">Лендинг (500) + Интервью (300) + Обучение (200 RR) в 2 клика!</p>
            </div>

            <div className="bg-black/25 p-2.5 rounded-xl border border-white/5 space-y-1">
              <div className="font-bold text-sky-300 flex items-center gap-1">
                <Chrome className="w-3 h-3" /> Через Google
              </div>
              <p>Стартового капитала <strong className="text-white">хватит на:</strong></p>
              <p className="text-slate-400"><strong className="text-white">5</strong> ИИ-собеседований + <strong className="text-white">5</strong> ИИ-фильтров кандидатов с обучением.</p>
            </div>
          </div>
        </div>

        {/* 1-Click Action Buttons Container */}
        <div className="space-y-4 pt-2">
          {/* Telegram Login Widget */}
          <div className="w-full bg-gradient-to-r from-amber-400/10 to-[#E7C768]/10 border border-[#E7C768]/30 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-[#E7C768]/20 p-2 rounded-xl">
                  <Send className="w-5 h-5 text-[#E7C768]" />
                </div>
                <div className="text-left">
                  <div className="text-xs uppercase tracking-wider font-mono opacity-80">Быстрый вход</div>
                  <div className="text-sm font-extrabold">Через Telegram</div>
                </div>
              </div>
              <span className="bg-emerald-900 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                +1,000 RR
              </span>
            </div>
            <div ref={tgContainerRef} className="flex justify-center min-h-[44px]">
              {!botUsername && (
                <span className="text-[11px] text-slate-400">Загрузка виджета…</span>
              )}
            </div>
          </div>

          {/* Google Login Button */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogle}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-white font-black py-4 px-5 rounded-2xl flex items-center justify-between gap-3 transition-all duration-150 shadow-lg transform active:scale-98 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/5 p-2 rounded-xl">
                <Chrome className="w-5 h-5 text-[#E7C768]" />
              </div>
              <div className="text-left">
                <div className="text-xs uppercase tracking-wider font-mono opacity-80">Альтернативный</div>
                <div className="text-sm font-extrabold">Войти через Google</div>
              </div>
            </div>
            <span className="bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              +1,000 RR
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
            ✅ Вход через {authVia === "telegram" ? "Telegram" : "Google"} выполнен успешно! Начисляем +1000 RR и перенаправляем в CRM...
          </div>
        )}

        <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest leading-relaxed">
          Безопасное соединение • Вход в 1 клик • Ваши данные надежно защищены
        </p>

      </div>
    </div>
  );
}
