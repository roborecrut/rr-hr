import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAIRestartOverlayVisible, dismissAIRestartOverlay } from "@/lib/aiReady";
import { rrImg } from "@/lib/img";

const IMG = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR7.png";

const PHRASES = [
  "Готовим ИИ к работе…",
  "Сбрасываю контекст…",
  "Подключаюсь к RR…",
  "Прогреваю модель…",
  "Минутку, почти готов…",
];

/**
 * Global overlay shown while /restart is in flight. The user can dismiss it —
 * the background /restart request keeps going, and AI-dependent buttons stay
 * gated via useAIReady() until it finishes.
 */
export const AIRestartGate: React.FC = () => {
  const visible = useAIRestartOverlayVisible();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PHRASES.length), 2800);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <style>{`
        @keyframes airg-typing { from { width: 0 } to { width: 100% } }
        @keyframes airg-blink { 50% { opacity: 0 } }
        @keyframes airg-dots { 0%, 20% { content: '.' } 40% { content: '..' } 60%, 100% { content: '...' } }
        .airg-typing { display: inline-block; overflow: hidden; white-space: nowrap; border-right: 2px solid #E7C768; animation: airg-typing 1.6s steps(40, end), airg-blink 0.8s step-end infinite; }
        .airg-dots::after { content: '...'; display: inline-block; animation: airg-dots 1.4s steps(3, end) infinite; min-width: 1.2em; text-align: left; }
      `}</style>
      <div className="relative w-full max-w-md rounded-3xl border border-[#E7C768]/30 bg-gradient-to-br from-[#17344F] to-[#265582] p-6 shadow-2xl animate-scale-in">
        <button
          type="button"
          onClick={dismissAIRestartOverlay}
          aria-label="Закрыть"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-4 text-center text-[11px] font-mono font-bold uppercase tracking-wider text-[#E7C768]/80">
          Подготовка ИИ
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <div className="rounded-2xl px-4 py-3 text-sm font-medium shadow-lg border bg-white text-slate-900 border-slate-200">
              <span key={idx} className="airg-typing">{PHRASES[idx]}</span>
              <span className="airg-dots ml-1 text-[#E7C768] font-bold" />
            </div>
            <div className="absolute -right-1.5 bottom-4 w-3 h-3 rotate-45 border-t border-r bg-white border-slate-200" />
          </div>
          <img
            src={rrImg(IMG, 112)}
            alt="RR"
            loading="eager"
            referrerPolicy="no-referrer"
            className="w-28 h-28 object-contain drop-shadow-xl shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = IMG; }}
          />
        </div>

        <div className="mt-4 text-center text-[11px] text-slate-300/80">
          Можно закрыть это окно — ИИ продолжит готовиться в фоне.
        </div>

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={dismissAIRestartOverlay}
            className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 px-4 py-2 text-xs font-bold transition"
          >
            Закрыть и продолжить в фоне
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIRestartGate;