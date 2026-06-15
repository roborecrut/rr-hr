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
import { useTypewriter } from "@/hooks/useTypewriter";
import { supabase } from "@/integrations/supabase/client";
import { brandImage } from "@/config";
import { toast } from "sonner";
import { toUserError } from "@/lib/userError";
import { buildPhraseQueue, resolveContext, type MascotContext } from "@/lib/loadingPhrases";

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

// Скорость печати маскота и пауза между репликами.
// 80–100 симв/сек по требованиям релиза I-4, ~1.4 с тишины после реплики.
const TYPING_CPS = 90;
const PHRASE_HOLD_MS = 1400;

// Универсальные стадии «живого» ожидания ИИ. Если серверная операция
// сообщает реальную стадию — она будет иметь приоритет, иначе пользователь
// видит ненумерованное продвижение. Никаких выдуманных процентов.
const STAGES: string[] = [
  "Подготавливаем данные",
  "Изучаем контекст",
  "Анализируем ответы",
  "Проверяем результат",
  "Формируем вывод",
  "Сохраняем результат",
];

type Status = "idle" | "loading" | "success" | "error" | "fallback";

interface FallbackConfig {
  /** Only show the RR Pro Max button to viewers explicitly allowed by caller. */
  viewerAllowed: boolean;
  /** Called after the fallback returns successfully (refresh local state). */
  onSuccess?: (data: any) => void | Promise<void>;
}

interface RunOptions<T> {
  title?: string;
  task: () => Promise<T>;
  timeoutMs?: number;
  autoCloseOnSuccess?: boolean;
  /** Don't block the awaiting caller — resolve immediately, overlay handles UI */
  fireAndForget?: boolean;
  /** Optional RR Pro Max fallback for technical AI failures. */
  fallback?: FallbackConfig;
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
  phrase: string;
  phraseSeq: number; // монотонный счётчик — заставляет useTypewriter перезапуститься
  elapsed: number;
  error: string;
  // Internal control — current task and resolver
  task: (() => Promise<any>) | null;
  resolver: ((v: any) => void) | null;
  timeoutMs: number;
  autoCloseOnSuccess: boolean;
  fallback: FallbackConfig | null;
  lastErrorJobId: string | null;
  lastErrorFallbackAvailable: boolean;
  fallbackPhase: "connecting" | "running" | null;
  fallbackBusy: boolean;
}

export const AIWaitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<State>({
    status: "idle",
    title: "",
    phrase: "",
    phraseSeq: 0,
    elapsed: 0,
    error: "",
    task: null,
    resolver: null,
    timeoutMs: 120_000,
    autoCloseOnSuccess: true,
    fallback: null,
    lastErrorJobId: null,
    lastErrorFallbackAvailable: false,
    fallbackPhase: null,
    fallbackBusy: false,
  });

  const cancelledRef = useRef(false);
  // Защита от двойного запуска: пока активен loading/fallback overlay,
  // повторные вызовы run() отбрасываются. Это исключает дубль-списания
  // лимитов и параллельные AI-задачи от одного клика.
  const busyRef = useRef(false);
  // Очередь реплик и таймер ротации — стабильно живут вне реактивного цикла.
  const queueRef = useRef<string[]>([]);
  const queueIdxRef = useRef(0);
  const ctxRef = useRef<MascotContext>("universal");
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPhraseTimer = useCallback(() => {
    if (phraseTimerRef.current) {
      clearTimeout(phraseTimerRef.current);
      phraseTimerRef.current = null;
    }
  }, []);

  const refillQueue = useCallback((ctx: MascotContext) => {
    queueRef.current = buildPhraseQueue(ctx);
    queueIdxRef.current = 0;
  }, []);

  const scheduleNextPhrase = useCallback((current: string) => {
    clearPhraseTimer();
    const typeMs = Math.ceil((current.length * 1000) / TYPING_CPS);
    phraseTimerRef.current = setTimeout(() => {
      // Перейти к следующей реплике той же очереди; при исчерпании — пересоздать.
      let nextIdx = queueIdxRef.current + 1;
      if (nextIdx >= queueRef.current.length) {
        refillQueue(ctxRef.current);
        nextIdx = 0;
      }
      queueIdxRef.current = nextIdx;
      const nextPhrase = queueRef.current[nextIdx] || "";
      setState((s) => (s.status === "loading"
        ? { ...s, phrase: nextPhrase, phraseSeq: s.phraseSeq + 1 }
        : s));
    }, typeMs + PHRASE_HOLD_MS);
  }, [clearPhraseTimer, refillQueue]);

  // Каждое обновление текущей фразы перепланирует переход к следующей.
  useEffect(() => {
    if (state.status !== "loading") {
      clearPhraseTimer();
      return;
    }
    scheduleNextPhrase(state.phrase);
    return clearPhraseTimer;
    // phraseSeq меняется на каждую новую реплику — этого достаточно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.phraseSeq]);

  const beginTask = useCallback((title: string, task: () => Promise<any>, timeoutMs: number, autoCloseOnSuccess: boolean, resolver: ((v: any) => void) | null, fallback: FallbackConfig | null) => {
    cancelledRef.current = false;
    busyRef.current = true;
    const ctx = resolveContext(title);
    ctxRef.current = ctx;
    refillQueue(ctx);
    const firstPhrase = queueRef.current[0] || "";
    setState({
      status: "loading",
      title,
      phrase: firstPhrase,
      phraseSeq: 0,
      elapsed: 0,
      error: "",
      task,
      resolver,
      timeoutMs,
      autoCloseOnSuccess,
      fallback,
      lastErrorJobId: null,
      lastErrorFallbackAvailable: false,
      fallbackPhase: null,
      fallbackBusy: false,
    });

    const startedAt = Date.now();
    const timeoutP = new Promise<never>((_, rej) => {
      setTimeout(() => rej(new Error("Превышено время ожидания (120с)")), timeoutMs);
    });

    Promise.race([task(), timeoutP])
      .then((result) => {
        if (cancelledRef.current) return;
        clearPhraseTimer();
        setState((s) => ({ ...s, status: "success", elapsed: Math.round((Date.now() - startedAt) / 1000) }));
        if (autoCloseOnSuccess) {
          setTimeout(() => {
            if (cancelledRef.current) return;
            setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
            busyRef.current = false;
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
        clearPhraseTimer();
        // ВАЖНО: никогда не показываем raw error.message (там может быть
        // HTML 504-страницы, внутренний код провайдера, имя функции и т.п.).
        // Прогоняем всё через toUserError — пользователь видит только
        // человеко-понятный текст.
        const raw = String(err?.message || err || "");
        const ue = toUserError(err);
        // Специальный текст для таймаутов/недоступности нейросети.
        const isTimeoutish =
          ue.kind === "timeout" ||
          ue.kind === "ai_temporary" ||
          /504|gateway|timed?\s*out|protalk_5\d\d/i.test(raw);
        const msg = isTimeoutish
          ? "Нейросеть не успела завершить проверку. Повторите попытку или запустите резервную модель."
          : ue.message;
        // fallback_available может прийти как из брошенной ошибки (job-flow),
        // так и из тела ответа сервера, прикреплённого к Error.
        const fbAvail = !!(err?.fallbackAvailable || err?.fallback_available);
        setState((s) => ({
          ...s,
          status: "error",
          error: msg,
          elapsed: Math.round((Date.now() - startedAt) / 1000),
          lastErrorJobId: err?.jobId || null,
          lastErrorFallbackAvailable: fbAvail,
        }));
      });
  }, [clearPhraseTimer, refillQueue]);

  const run = useCallback(<T,>(opts: RunOptions<T>): Promise<T | undefined> => {
    if (busyRef.current) {
      // Не запускаем второй раз, пока текущая задача не завершилась.
      return Promise.resolve(undefined);
    }
    const title = opts.title || "Запрос к ИИ";
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const autoCloseOnSuccess = opts.autoCloseOnSuccess ?? true;
    const fallback = opts.fallback || null;

    if (opts.fireAndForget) {
      beginTask(title, opts.task, timeoutMs, autoCloseOnSuccess, null, fallback);
      return Promise.resolve(undefined);
    }

    return new Promise<T | undefined>((resolve) => {
      beginTask(title, opts.task, timeoutMs, autoCloseOnSuccess, resolve as (v: any) => void, fallback);
    });
  }, [beginTask]);

  // Tick: elapsed seconds while loading
  useEffect(() => {
    if (state.status !== "loading" && state.status !== "fallback") return;
    const id = setInterval(() => {
      setState((s) => (s.status === "loading" || s.status === "fallback" ? { ...s, elapsed: s.elapsed + 1 } : s));
    }, 1000);
    return () => clearInterval(id);
  }, [state.status]);

  // Очистка таймера фраз при размонтировании провайдера.
  useEffect(() => () => clearPhraseTimer(), [clearPhraseTimer]);

  const handleRetry = useCallback(() => {
    if (!state.task) return;
    if (state.fallbackBusy) return; // защита от двойного клика
    beginTask(state.title, state.task, state.timeoutMs, state.autoCloseOnSuccess, state.resolver, state.fallback);
  }, [state, beginTask]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    busyRef.current = false;
    clearPhraseTimer();
    state.resolver?.(undefined);
    setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
  }, [state.resolver, clearPhraseTimer]);

  const handleNext = useCallback(() => {
    const result = (window as any).__aiwait_lastResult;
    state.resolver?.(result);
    delete (window as any).__aiwait_lastResult;
    busyRef.current = false;
    setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
  }, [state.resolver]);

  const handleFallback = useCallback(async () => {
    const jobId = state.lastErrorJobId;
    const fb = state.fallback;
    if (!jobId || !fb) return;
    // Switch to fallback overlay; lock button against double-click.
    setState((s) => ({
      ...s,
      status: "fallback",
      elapsed: 0,
      error: "",
      fallbackPhase: "connecting",
      fallbackBusy: true,
    }));
    // Show "Подключаем" briefly, then "Повторяем" while the request runs.
    const phaseTimer = setTimeout(() => {
      setState((s) => (s.status === "fallback" ? { ...s, fallbackPhase: "running" } : s));
    }, 1500);
    try {
      // Кандидаты не используют Supabase Auth — передаём opaque-токен
      // через заголовок x-candidate-token, иначе серверная авторизация
      // отклонит запрос с 401, а кнопка «Запустить RR Pro Max» окажется
      // визуальной заглушкой.
      let candidateToken: string | null = null;
      try {
        const raw = localStorage.getItem("cand_session");
        if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
      } catch { /* ignore */ }
      const { data, error } = await supabase.functions.invoke("ai-fallback-rr-pro-max", {
        body: { job_id: jobId },
        headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
      });
      clearTimeout(phaseTimer);
      if (error || (data && (data as any).error)) {
        setState((s) => ({
          ...s,
          status: "error",
          error: "Даже резервная модель не смогла завершить задачу. Попробуйте позднее или обратитесь в поддержку.",
          fallbackPhase: null,
          fallbackBusy: false,
        }));
        return;
      }
      // Success — refresh caller state, close overlay, toast.
      try { await fb.onSuccess?.(data); } catch { /* ignore caller-side errors */ }
      toast.success("RR Pro Max успешно завершил задачу");
      const resolver = state.resolver;
      setState((s) => ({ ...s, status: "idle", task: null, resolver: null, fallbackPhase: null, fallbackBusy: false }));
      busyRef.current = false;
      resolver?.(data);
    } catch {
      clearTimeout(phaseTimer);
      setState((s) => ({
        ...s,
        status: "error",
        error: "Даже резервная модель не смогла завершить задачу. Попробуйте позднее или обратитесь в поддержку.",
        fallbackPhase: null,
        fallbackBusy: false,
      }));
    }
  }, [state.lastErrorJobId, state.fallback, state.resolver]);

  const value = useMemo<AIWaitContextValue>(() => ({ run }), [run]);

  return (
    <AIWaitContext.Provider value={value}>
      {children}
      {state.status !== "idle" && (
        state.status === "fallback" ? (
          <FallbackOverlay
            phase={state.fallbackPhase || "connecting"}
            elapsed={state.elapsed}
          />
        ) : (
        <Overlay
          status={state.status}
          title={state.title}
          phrase={state.phrase}
          phraseSeq={state.phraseSeq}
          elapsed={state.elapsed}
          error={state.error}
          autoCloseOnSuccess={state.autoCloseOnSuccess}
          showFallback={
            state.status === "error" &&
            !!state.fallback?.viewerAllowed &&
            state.lastErrorFallbackAvailable &&
            !!state.lastErrorJobId
          }
          fallbackBusy={state.fallbackBusy}
          onFallback={handleFallback}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onNext={handleNext}
        />)
      )}
    </AIWaitContext.Provider>
  );
};

interface OverlayProps {
  status: Exclude<Status, "idle" | "fallback">;
  title: string;
  phrase: string;
  phraseSeq?: number;
  elapsed: number;
  error: string;
  autoCloseOnSuccess: boolean;
  showFallback: boolean;
  fallbackBusy: boolean;
  onFallback: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onNext: () => void;
}

const Overlay: React.FC<OverlayProps> = ({ status, title, phrase, phraseSeq, elapsed, error, autoCloseOnSuccess, showFallback, fallbackBusy, onFallback, onRetry, onCancel, onNext }) => {
  const img = status === "loading" ? IMG_LOADING : status === "success" ? IMG_SUCCESS : IMG_ERROR;

  const bubbleText =
    status === "loading" ? phrase :
    status === "success" ? "Готово! Ответ получен" :
    "Я сломался…";
  // 80–100 симв/сек. После полного появления текст замирает (~1.4 с)
  // до того, как провайдер пришлёт следующую реплику (новый phraseSeq).
  const typed = useTypewriter(bubbleText, 90);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-[#E7C768]/30 bg-gradient-to-br from-[#17344F] to-[#265582] p-6 shadow-2xl animate-scale-in">
        {title && (
          <div className="mb-4 text-center text-[11px] font-mono font-bold uppercase tracking-wider text-[#E7C768]/80">
            {title}
          </div>
        )}
        <div className="flex items-end gap-3 min-h-[120px]">
          {/* Speech bubble (left of robot) */}
          <div className="flex-1 relative">
            <div className={`rounded-2xl px-4 py-3 text-sm font-medium shadow-lg border min-h-[72px] flex items-center ${
              status === "error"
                ? "bg-rose-50 text-rose-900 border-rose-200"
                : status === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-white text-slate-900 border-slate-200"
            }`}>
              <div className="w-full">
                <span>{status === "loading" ? typed : bubbleText}</span>
                {status === "error" && error && (
                  <div className="mt-2 text-[11px] text-rose-700 font-normal break-words">{error}</div>
                )}
              </div>
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
            className="w-28 h-28 object-contain drop-shadow-xl shrink-0 self-end"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = img; }}
            style={status === "loading" ? { animation: "aiwait-float 3s ease-in-out infinite" } : undefined}
          />
        </div>

        {/* Stage + live progress (no fake percent) */}
        {status === "loading" && (
          <StageProgress elapsed={elapsed} />
        )}

        {status === "success" && !autoCloseOnSuccess && (
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
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {showFallback && (
              <button
                type="button"
                onClick={onFallback}
                disabled={fallbackBusy}
                className="rounded-xl bg-gradient-to-r from-[#E7C768] to-[#F4D679] hover:brightness-110 text-[#0a1828] font-bold px-4 py-2 text-sm shadow transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Запустить RR Pro Max
              </button>
            )}
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
              disabled={fallbackBusy}
              className="rounded-xl bg-[#E7C768] hover:bg-[#F4D679] text-[#0a1828] font-bold px-4 py-2 text-sm shadow transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Повторить
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const FallbackOverlay: React.FC<{ phase: "connecting" | "running"; elapsed: number }> = ({ phase, elapsed }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-[#E7C768]/40 bg-gradient-to-br from-[#17344F] to-[#265582] p-6 shadow-2xl animate-scale-in">
        <div className="mb-3 text-center text-[11px] font-mono font-bold uppercase tracking-wider text-[#E7C768]">
          RR Pro Max подключается к задаче
        </div>
        <div className="flex items-end gap-3 min-h-[140px]">
          <div className="flex-1">
            <div className="rounded-2xl px-4 py-3 text-sm font-medium shadow-lg border bg-white text-slate-900 border-slate-200">
              Основная нейросеть не смогла завершить генерацию. RR Pro Max повторяет задачу с помощью нашей самой мощной резервной модели.
            </div>
            <div className="mt-3 rounded-xl bg-black/25 border border-white/10 px-3 py-2 text-xs text-slate-100 font-mono">
              {phase === "connecting" ? "Подключаем резервную модель…" : "Повторяем генерацию…"}
            </div>
          </div>
          <img
            src={brandImage("RRproMax")}
            alt="RR Pro Max"
            loading="eager"
            referrerPolicy="no-referrer"
            className="w-32 h-32 object-contain drop-shadow-2xl shrink-0 self-end"
            style={{ animation: "aiwait-float 4s ease-in-out infinite" }}
          />
        </div>
        <div className="mt-4 text-center space-y-1">
          <div className="text-[11px] text-slate-300/80">Не закрывайте окно — RR Pro Max работает над задачей</div>
          <div className="text-2xl font-mono font-bold text-[#E7C768] tabular-nums">{elapsed}s</div>
        </div>
      </div>
    </div>
  );
};

export default AIWaitProvider;

/**
 * Живой индикатор стадий ожидания ИИ.
 * — Меняет подпись стадии каждые ~4 секунды;
 * — Показывает аккуратную полосу прогресса, плавно стремящуюся к 90%
 *   (без выдуманного точного процента);
 * — Таймер вторичен.
 * — Не сбрасывает данные пользователя (живёт только внутри оверлея).
 */
const StageProgress: React.FC<{ elapsed: number }> = ({ elapsed }) => {
  // Индекс стадии увеличивается каждые ~4 секунды, но не выходит за пределы.
  const stageIdx = Math.min(STAGES.length - 1, Math.floor(elapsed / 4));
  // Плавная асимптотическая полоса 0 → 90%. Никакого процента в подписи.
  const widthPct = Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / 18))));
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-white/90 truncate" aria-live="polite">
          {STAGES[stageIdx]}…
        </div>
        <div className="text-[11px] font-mono text-slate-300/80 tabular-nums shrink-0">{elapsed}s</div>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Идёт обработка"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#E7C768] via-[#F4D679] to-[#E7C768] transition-[width] duration-700 ease-out"
          style={{ width: `${widthPct}%` }}
        />
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[aiwait-shimmer_2.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>
      <div className="flex items-center justify-between gap-1.5">
        {STAGES.map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < stageIdx
                ? "bg-emerald-400/70"
                : i === stageIdx
                  ? "bg-[#E7C768]"
                  : "bg-white/15"
            }`}
          />
        ))}
      </div>
      <div className="text-[10px] text-slate-300/70 text-center">
        Не закрывайте окно — идёт обработка
      </div>
    </div>
  );
};
