import React from "react";
import { X, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import {
  useAIFallbackGate, closeAIFallback, _runFallbackForGate,
  SUPPORT_TELEGRAM_URL,
} from "@/lib/aiFallback";
import proMaxMascot from "@/assets/rr-pro-max-mascot.png";

/**
 * Global overlay that offers one retry on RR Pro Max after a primary AI-job
 * failure. Driven by `openAIFallback()` from `@/lib/aiFallback`. Mounted once
 * at the app root (see App.tsx).
 *
 * UX contract (Wave 2 §3):
 *  - "offer" phase: explains the issue, single CTA "Ещё раз с RR Pro Max".
 *  - "running" phase: spinner + reassuring copy, no buttons except close.
 *  - "succeeded" phase: brief confirmation, auto-closes (handled in the store).
 *  - "failed" phase: no retry button — only a Telegram support link and a
 *    close button. The primary path is auto-restarted in the background by
 *    the caller, not here.
 */
export const AIFallbackGate: React.FC = () => {
  const s = useAIFallbackGate();
  if (!s.open) return null;

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-[#E7C768]/40 bg-gradient-to-br from-[#17344F] to-[#265582] p-6 shadow-2xl animate-scale-in">
        <button
          type="button"
          onClick={() => closeAIFallback("dismiss")}
          aria-label="Закрыть"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex justify-center mb-3">
          <img
            src={proMaxMascot}
            alt="RR Pro Max"
            width={120}
            height={120}
            loading="eager"
            decoding="async"
            className="w-28 h-28 object-contain drop-shadow-2xl"
          />
        </div>

        <div className="text-center text-[11px] font-mono font-bold uppercase tracking-wider text-[#E7C768] mb-2">
          Резервная модель RR Pro Max
        </div>

        {s.phase === "offer" && (
          <>
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Основная нейросеть не ответила
            </h2>
            <p className="text-center text-sm text-slate-200/90 mb-4">
              Попробуйте резервную модель RR Pro Max — она использует тот же запрос
              и не списывает RR повторно.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { void _runFallbackForGate(); }}
                className="w-full rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C29A3A] px-4 py-3 text-sm font-bold text-[#17344F] shadow-lg hover:brightness-110 active:scale-[0.99] transition"
              >
                Ещё раз с RR Pro Max
              </button>
              <button
                type="button"
                onClick={() => closeAIFallback("dismiss")}
                className="w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 px-4 py-2 text-xs font-bold transition"
              >
                Не сейчас
              </button>
            </div>
          </>
        )}

        {s.phase === "running" && (
          <>
            <h2 className="text-center text-lg font-bold text-white mb-2">
              RR Pro Max обрабатывает запрос
            </h2>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-200/90 my-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Это может занять до минуты…</span>
            </div>
            <p className="text-center text-[11px] text-slate-300/70">
              Окно можно закрыть — результат сохранится автоматически.
            </p>
          </>
        )}

        {s.phase === "succeeded" && (
          <>
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Готово
            </h2>
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-300 my-3">
              <CheckCircle2 className="w-5 h-5" />
              <span>RR Pro Max вернул результат</span>
            </div>
          </>
        )}

        {s.phase === "failed" && (
          <>
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Не удалось получить ответ
            </h2>
            <div className="flex items-center justify-center gap-2 text-sm text-amber-300 my-3">
              <AlertTriangle className="w-5 h-5" />
              <span>Резервная модель тоже не ответила</span>
            </div>
            <p className="text-center text-sm text-slate-200/90 mb-4">
              Напишите нам в поддержку — поможем разобраться вручную и не
              спишем RR за неудачную попытку.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={SUPPORT_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C29A3A] px-4 py-3 text-center text-sm font-bold text-[#17344F] shadow-lg hover:brightness-110 transition"
              >
                Написать в поддержку
              </a>
              <button
                type="button"
                onClick={() => closeAIFallback("dismiss")}
                className="w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 px-4 py-2 text-xs font-bold transition"
              >
                Закрыть
              </button>
            </div>
            {s.errorCode && (
              <div className="mt-3 text-center text-[10px] font-mono text-slate-400/70">
                код: {s.errorCode}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AIFallbackGate;