import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { rrImg } from "@/lib/img";

/**
 * Global AI wait overlay.
 *
 * Wrap any AI/neural-network call with `await run({ title, task })`. The
 * overlay shows a thinking robot with a typing speech bubble, a forward
 * counter and a 120s timeout. On success it briefly shows a happy robot
 * (or a "Далее" button if `autoCloseOnSuccess=false`). On error/timeout it
 * shows the broken robot with "Повторить" / "Отмена" buttons.
 */

const IMG_LOADING = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR7.png";
const IMG_SUCCESS = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR6.png";
const IMG_ERROR = "https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR9.png";

const PHRASES = [
  "Ожидайте…",
  "Я думаю…",
  "Подбираю слова…",
  "Сверяюсь с базой знаний…",
  "Минутку…",
  "Анализирую контекст…",
  "Формирую ответ…",
  "Уточняю детали…",
  "Почти готово…",
  "Полирую формулировки…",
];

type Status = "idle" | "loading" | "success" | "error";

interface RunOptions<T> {
  title?: string;
  task: () => Promise<T>;
  timeoutMs?: number;
  autoCloseOnSuccess?: boolean;
  /** Don't block the awaiting caller — resolve immediately, overlay handles UI */
  fireAndForget?: boolean;
}

interface AIWaitContextValue {
  run: <T>(opts: RunOptions<T>) => Promise<T | undefined>;
}

const AIWaitContext = createContext<AIWaitContextValue | null>(null);

export function useAIWait(): AIWaitContextValue {
  const ctx = useContext(AIWaitContext);
  if (!ctx) {
    // Soft-fallback: if provider missing, just run the task without UI
    return {
      run: async ({ task }) => {
        try { return await task(); } catch { return undefined; }
      },
    };
  }
  return ctx;
}

interface State {
  status: Status;
  title: string;
  phraseIdx: number;
  elapsed: number;
  error: string;
  // Internal control — current task and resolver
  task: (() => Promise<any>) | null;
  resolver: ((v: any) => void) | null;
  timeoutMs: number;
  autoCloseOnSuccess: boolean;
}

export const AIWaitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<State>({
    status: "idle",
    title: "",
    phraseIdx: 0,
    elapsed: 0,
    error: "",
    task: null,
    resolver: null,
    timeoutMs: 120_000,
    autoCloseOnSuccess: true,
  });

  const cancelledRef = useRef(false);

  const beginTask = useCallback((title: string, task: () => Promise<any>, timeoutMs: number, autoCloseOnSuccess: boolean, resolver: ((v: any) => void) | null) => {
    cancelledRef.current = false;
    setState({
      status: "loading",
      title,
      phraseIdx: Math.floor(Math.random() * PHRASES.length),
      elapsed: 0,
      error: "",
      task,
      resolver,
      timeoutMs,
      autoCloseOnSuccess,
    });

    const startedAt = Date.now();
    const timeoutP = new Promise<never>((_, rej) => {
      setTimeout(() => rej(new Error("Превышено время ожидания (120с)")), timeoutMs);
    });

    Promise.race([task(), timeoutP])
      .then((result) => {
        if (cancelledRef.current) return;
        setState((s) => ({ ...s, status: "success", elapsed: Math.round((Date.now() - startedAt) / 1000) }));
        if (autoCloseOnSuccess) {
          setTimeout(() => {
            if (cancelledRef.current) return;
            setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
            resolver?.(result);
          }, 800);
        }
        // If not auto-close, resolver fires when user clicks "Далее"
        if (!autoCloseOnSuccess) {
          // store result on state via resolver wrapper
          (window as any).__aiwait_lastResult = result;
        }
      })
      .catch((err: any) => {
        if (cancelledRef.current) return;
        const msg = err?.message || String(err) || "Неизвестная ошибка";
        setState((s) => ({ ...s, status: "error", error: msg, elapsed: Math.round((Date.now() - startedAt) / 1000) }));
      });
  }, []);

  const run = useCallback(<T,>(opts: RunOptions<T>): Promise<T | undefined> => {
    const title = opts.title || "Запрос к ИИ";
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const autoCloseOnSuccess = opts.autoCloseOnSuccess ?? true;

    if (opts.fireAndForget) {
      beginTask(title, opts.task, timeoutMs, autoCloseOnSuccess, null);
      return Promise.resolve(undefined);
    }

    return new Promise<T | undefined>((resolve) => {
      beginTask(title, opts.task, timeoutMs, autoCloseOnSuccess, resolve as (v: any) => void);
    });
  }, [beginTask]);

  // Tick: elapsed seconds while loading
  useEffect(() => {
    if (state.status !== "loading") return;
    const id = setInterval(() => {
      setState((s) => (s.status === "loading" ? { ...s, elapsed: s.elapsed + 1 } : s));
    }, 1000);
    return () => clearInterval(id);
  }, [state.status]);

  // Tick: cycle phrases while loading
  useEffect(() => {
    if (state.status !== "loading") return;
    const id = setInterval(() => {
      setState((s) => (s.status === "loading" ? { ...s, phraseIdx: (s.phraseIdx + 1) % PHRASES.length } : s));
    }, 2800);
    return () => clearInterval(id);
  }, [state.status]);

  const handleRetry = useCallback(() => {
    if (!state.task) return;
    beginTask(state.title, state.task, state.timeoutMs, state.autoCloseOnSuccess, state.resolver);
  }, [state, beginTask]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    state.resolver?.(undefined);
    setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
  }, [state.resolver]);

  const handleNext = useCallback(() => {
    const result = (window as any).__aiwait_lastResult;
    state.resolver?.(result);
    delete (window as any).__aiwait_lastResult;
    setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
  }, [state.resolver]);

  const value = useMemo<AIWaitContextValue>(() => ({ run }), [run]);

  return (
    <AIWaitContext.Provider value={value}>
      {children}
      {state.status !== "idle" && (
        <Overlay
          status={state.status}
          title={state.title}
          phrase={PHRASES[state.phraseIdx] || PHRASES[0]}
          elapsed={state.elapsed}
          error={state.error}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onNext={handleNext}
        />
      )}
    </AIWaitContext.Provider>
  );
};

interface OverlayProps {
  status: Exclude<Status, "idle">;
  title: string;
  phrase: string;
  elapsed: number;
  error: string;
  onRetry: () => void;
  onCancel: () => void;
  onNext: () => void;
}

const Overlay: React.FC<OverlayProps> = ({ status, title, phrase, elapsed, error, onRetry, onCancel, onNext }) => {
  const img = status === "loading" ? IMG_LOADING : status === "success" ? IMG_SUCCESS : IMG_ERROR;

  const bubbleText =
    status === "loading" ? phrase :
    status === "success" ? "Готово! Ответ получен" :
    "Я сломался…";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <style>{`
        @keyframes aiwait-typing { from { width: 0 } to { width: 100% } }
        @keyframes aiwait-blink { 50% { opacity: 0 } }
        @keyframes aiwait-dots { 0%, 20% { content: '.' } 40% { content: '..' } 60%, 100% { content: '...' } }
        .aiwait-typing { display: inline-block; overflow: hidden; white-space: nowrap; border-right: 2px solid #E7C768; animation: aiwait-typing 1.6s steps(40, end), aiwait-blink 0.8s step-end infinite; }
        .aiwait-dots::after { content: '...'; display: inline-block; animation: aiwait-dots 1.4s steps(3, end) infinite; min-width: 1.2em; text-align: left; }
      `}</style>
      <div className="relative w-full max-w-md rounded-3xl border border-[#E7C768]/30 bg-gradient-to-br from-[#17344F] to-[#265582] p-6 shadow-2xl animate-scale-in">
        {title && (
          <div className="mb-4 text-center text-[11px] font-mono font-bold uppercase tracking-wider text-[#E7C768]/80">
            {title}
          </div>
        )}
        <div className="flex items-end gap-3">
          {/* Speech bubble (left of robot) */}
          <div className="flex-1 relative">
            <div className={`rounded-2xl px-4 py-3 text-sm font-medium shadow-lg border ${
              status === "error"
                ? "bg-rose-50 text-rose-900 border-rose-200"
                : status === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-white text-slate-900 border-slate-200"
            }`}>
              {status === "loading" ? (
                <span key={phrase} className="aiwait-typing">{bubbleText}</span>
              ) : (
                <span>{bubbleText}</span>
              )}
              {status === "loading" && <span className="aiwait-dots ml-1 text-[#E7C768] font-bold" />}
              {status === "error" && error && (
                <div className="mt-2 text-[11px] text-rose-700 font-normal break-words">{error}</div>
              )}
            </div>
            {/* Bubble tail pointing right toward robot */}
            <div className={`absolute -right-1.5 bottom-4 w-3 h-3 rotate-45 border-t border-r ${
              status === "error" ? "bg-rose-50 border-rose-200"
              : status === "success" ? "bg-emerald-50 border-emerald-200"
              : "bg-white border-slate-200"
            }`} />
          </div>

          {/* Robot */}
          <img
            src={rrImg(img, 112)}
            alt="RR"
            loading="eager"
            referrerPolicy="no-referrer"
            className="w-28 h-28 object-contain drop-shadow-xl shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = img; }}
            style={status === "loading" ? { animation: "aiwait-float 3s ease-in-out infinite" } : undefined}
          />
        </div>

        {/* Timer / footer */}
        {status === "loading" && (
          <div className="mt-4 text-center space-y-1">
            <div className="text-[11px] text-slate-300/80">Не закрывайте окно — идёт генерация</div>
            <div className="text-2xl font-mono font-bold text-[#E7C768] tabular-nums">{elapsed}s</div>
          </div>
        )}

        {status === "success" && (
          <div className="mt-4 flex justify-start">
            <button
              type="button"
              onClick={onNext}
              className="rounded-xl bg-[#E7C768] hover:bg-[#F4D679] text-[#0a1828] font-bold px-5 py-2 text-sm shadow-lg transition"
            >
              Далее →
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 px-4 py-2 text-sm font-bold transition"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-[#E7C768] hover:bg-[#F4D679] text-[#0a1828] font-bold px-4 py-2 text-sm shadow transition"
            >
              Повторить
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIWaitProvider;
