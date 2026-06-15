import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Temporary pilot probe for employer #100006 only. Triggers the production
 * ai-fallback-rr-pro-max endpoint with the pre-created pilot job_id. The
 * server enforces ownership AND the 100006 pilot gate — this component
 * never bypasses either check. Remove after the pilot is confirmed.
 */
const PILOT_JOB_ID = "dae7bc17-1dd3-4ee5-b913-1e9758cbad55";

const ERROR_MESSAGES: Record<string, string> = {
  fallback_not_configured: "Резервная модель не настроена (нет ключей RR Pro Max).",
  fallback_pilot_disabled: "Пилот доступен только работодателю №100006.",
  fallback_snapshot_corrupt: "Исходный запрос повреждён — нужна новая пилотная задача.",
  fallback_invalid_json: "Резервная модель вернула некорректный JSON.",
  fallback_schema_validation_failed: "Ответ резервной модели не соответствует схеме чек-листа.",
  fallback_empty_response: "Резервная модель вернула пустой ответ.",
  fallback_provider_unavailable: "Сервис RR Pro Max временно недоступен.",
  fallback_timeout: "Резервная модель не ответила за отведённое время.",
  fallback_save_failed: "Не удалось сохранить результат резервной модели.",
  forbidden: "Нет прав запускать резервную модель.",
  unauthorized: "Сессия истекла — войдите снова.",
  not_found: "Пилотная задача не найдена.",
  illegal_state_for_fallback: "Задача уже завершена — нужна новая пилотная задача.",
  fallback_not_allowed: "Для этой задачи резерв отключён.",
};

function humanize(code: string): string {
  return ERROR_MESSAGES[code] || `Сбой резерва (${code}).`;
}

export default function RrProMaxPilotProbe() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-fallback-rr-pro-max", {
        body: { job_id: PILOT_JOB_ID },
      });
      if (error || (data as any)?.error) {
        const code = (data as any)?.error || "fallback_failed";
        const msg = humanize(code);
        setResult(`${msg} · код: ${code}`);
        toast.error(msg);
      } else {
        const count = (data as any)?.count ?? "?";
        setResult(`OK · вопросов: ${count}`);
        toast.success("RR Pro Max успешно завершил задачу");
      }
    } catch (e: any) {
      setResult(`Ошибка: ${e?.message || "network"}`);
      toast.error(`RR Pro Max: ${e?.message || "network"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border border-[#E7C768]/50 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E7C768]">
          Пилот RR Pro Max
        </div>
        <h3 className="text-base font-bold text-white mt-1">Проверка резервной модели</h3>
        <p className="text-xs text-slate-300 mt-1">
          Одно нажатие — запустит резервную модель для предварительно созданной задачи. RR повторно не списываются.
        </p>
        {result && (
          <div className="mt-2 text-xs text-slate-100 font-mono break-all">{result}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-xl bg-gradient-to-r from-[#E7C768] to-[#F4D679] hover:brightness-110 text-[#0a1828] font-bold px-5 py-2.5 text-sm shadow disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {busy ? "Запускаем…" : "Проверить RR Pro Max"}
      </button>
    </div>
  );
}