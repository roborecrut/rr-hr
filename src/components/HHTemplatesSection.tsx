import React, { useState } from "react";
import { Sparkles, Wand2, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAIWait } from "./AIWaitProvider";
import { useAIReady } from "@/lib/aiReady";
import FieldHelp from "./FieldHelp";
import { toast } from "sonner";

export interface HHTemplateValues {
  hhPostText?: string;
  hhInviteText?: string;
  hhAutoresumeText?: string;
}

interface Props {
  projectId: string;
  roleName?: string;
  companyName?: string;
  values: HHTemplateValues;
  onChange: (patch: HHTemplateValues) => void;
  onAudit?: (kind: "success" | "warning" | "info", title: string, detail: string) => void;
}

type FieldKey = "hh_post_text" | "hh_invite_text" | "hh_autoresume_text";

const FIELDS: { key: FieldKey; camel: keyof HHTemplateValues; label: string; hint: string; rows: number; max: number; help: string }[] = [
  {
    key: "hh_post_text",
    camel: "hhPostText",
    label: "Шаблон вакансии для публикации на HH",
    hint: "Готовый текст с разделами «О компании», «Обязанности», «Требования», «Условия». Вставьте напрямую в форму hh.ru.",
    rows: 14,
    max: 6000,
    help: "Этот текст ИИ оформит так, чтобы вакансия получала максимум откликов на hh.ru: продающее описание компании, чёткие обязанности, понятные требования и условия.",
  },
  {
    key: "hh_invite_text",
    camel: "hhInviteText",
    label: "Шаблон приглашения кандидата на интервью с Роботом Рекрутером",
    hint: "Используется как авто-ответ на отклики hh.ru. Содержит ссылку на лендинг вакансии и приглашение пройти ИИ-интервью.",
    rows: 10,
    max: 3000,
    help: "Тёплое короткое письмо для авто-отклика hh.ru: благодарность за отклик + приглашение пройти короткое интервью с Роботом Рекрутером по ссылке на вакансию.",
  },
  {
    key: "hh_autoresume_text",
    camel: "hhAutoresumeText",
    label: "Инструкция для подключения авторазбора резюме на HH",
    hint: "Пошаговая инструкция + рекомендации, как настроить hh.ru, чтобы все отклики уходили в Робот Рекрутёр на автоматический разбор.",
    rows: 12,
    max: 5000,
    help: "Пошаговая инструкция, как в личном кабинете hh.ru подключить авто-разбор откликов так, чтобы каждое входящее резюме автоматически приходило в Робот Рекрутёр на оценку.",
  },
];

export const HHTemplatesSection: React.FC<Props> = ({
  projectId,
  roleName,
  companyName,
  values,
  onChange,
  onAudit,
}) => {
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const [enhancingKey, setEnhancingKey] = useState<FieldKey | null>(null);
  const [generating, setGenerating] = useState(false);

  const hasAny = !!(values.hhPostText || values.hhInviteText || values.hhAutoresumeText);

  const callGenerate = async () => {
    return await aiWaitRun<{ fields: Record<string, string> }>({
      title: "ИИ готовит шаблоны для HH",
      timeoutMs: 180_000,
      fallback: { viewerAllowed: true },
      task: async () => {
        const { data, error } = await supabase.functions.invoke("ai-generate-hh-templates", {
          body: { project_id: projectId },
        });
        if (error || (data && (data as any).error)) {
          // Извлекаем job_id + fallback_available из тела ответа, чтобы
          // AIWaitProvider показал кнопку «Запустить RR Pro Max».
          let serverBody: any = data;
          try {
            const ctx: any = (error as any)?.context;
            if (ctx && typeof ctx.json === "function") serverBody = await ctx.json();
          } catch { /* ignore */ }
          const err: any = new Error((serverBody?.error as string) || error?.message || "Не удалось сгенерировать шаблоны");
          err.jobId = serverBody?.job_id || null;
          err.fallbackAvailable = !!serverBody?.fallback_available;
          throw err;
        }
        return data as { fields: Record<string, string> };
      },
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await callGenerate();
      if (res?.fields) {
        onChange({
          hhPostText: res.fields.hh_post_text || "",
          hhInviteText: res.fields.hh_invite_text || "",
          hhAutoresumeText: res.fields.hh_autoresume_text || "",
        });
        onAudit?.("success", "Шаблоны для HH сгенерированы", "Три текста для hh.ru готовы. Их можно отредактировать и улучшить.");
        toast.success("Шаблоны для HH готовы");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleEnhanceField = async (key: FieldKey, label: string) => {
    const camel = FIELDS.find((f) => f.key === key)!.camel;
    const current = (values[camel] || "").trim();
    if (current.length < 7) {
      toast.error("Поле слишком короткое для улучшения (нужно от 7 символов)");
      return;
    }
    setEnhancingKey(key);
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiWaitRun<string>({
        title: `ИИ улучшает «${label}»`,
        task: () => aiEnhanceSingle({
          field: key,
          value: current,
          role_name: roleName,
          company_name: companyName,
          hint: `Это шаблон для hh.ru. Поле: ${label}. Сохрани смысл и структуру, улучши формулировки.`,
        }),
      });
      if (value) {
        onChange({ [camel]: value } as HHTemplateValues);
        onAudit?.("success", "Шаблон улучшен", `Текст «${label}» переписан ИИ.`);
      }
    } catch (err) {
      console.error(err);
        onAudit?.("warning", "Ошибка ИИ", `Не удалось улучшить шаблон «${label}».`);
    } finally {
      setEnhancingKey(null);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => toast.success("Скопировано в буфер обмена"),
      () => toast.error("Не удалось скопировать"),
    );
  };

  return (
    <div className="brand-editor space-y-4 rounded-3xl border border-[#E7C768]/40 bg-gradient-to-br from-[#1a3d5e] to-[#234d7a] p-5">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase font-mono tracking-wider bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">
              📢 Шаблоны для публикации на HH.ru
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            Авто-генерация 3 текстов для hh.ru
          </h3>
          <p className="mt-1 text-[11px] text-slate-300">
            ИИ возьмёт уже заполненные данные о вакансии и компании, а также ссылку на лендинг, и подготовит готовые тексты для hh.ru: вакансию, авто-приглашение на интервью и инструкцию по авторазбору резюме.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !aiReady}
          className="shrink-0 flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] px-4 py-2.5 text-[12px] font-bold text-[#17344F] shadow-md transition hover:brightness-110 disabled:opacity-50"
          title={hasAny ? "Перегенерировать все 3 шаблона" : "Сгенерировать все 3 шаблона через ИИ"}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {hasAny ? "Перегенерировать всё" : "Сгенерировать 3 шаблона"}
        </button>
      </header>

      {!hasAny && !generating && (
        <div className="rounded-2xl border border-dashed border-[#E7C768]/40 bg-white/5 p-4 text-[12px] text-slate-200">
          Поля пока пусты. Нажмите <strong className="text-[#E7C768]">«Сгенерировать 3 шаблона»</strong> — ИИ заполнит их на основе данных вакансии. После этого тексты можно править вручную или улучшать через ИИ кнопкой <Wand2 className="inline h-3 w-3" /> AI рядом с каждым полем.
        </div>
      )}

      <div className="space-y-4">
        {FIELDS.map((f) => {
          const val = values[f.camel] || "";
          return (
            <div key={f.key} className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-100 inline-flex items-center">
                    {f.label}
                    <FieldHelp
                      section="vacancies"
                      fieldKey={f.key}
                      fallbackTitle={f.label}
                      fallbackBody={f.help}
                    />
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-400">{f.hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(val)}
                    disabled={!val.trim()}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
                    title="Скопировать текст"
                  >
                    <Copy className="h-3 w-3" />
                    Копировать
                  </button>
                  {aiReady && val.trim().length >= 7 && (
                    <button
                      type="button"
                      onClick={() => handleEnhanceField(f.key, f.label)}
                      disabled={enhancingKey === f.key}
                      className="flex items-center gap-1 rounded-lg border border-[#E7C768]/30 bg-[#E7C768]/10 px-2 py-1 text-[10px] font-bold text-[#E7C768] transition hover:bg-[#E7C768]/20 disabled:opacity-50"
                      title="Улучшить этот текст через ИИ"
                    >
                      <Wand2 className="h-3 w-3" />
                      {enhancingKey === f.key ? "..." : "AI улучшить"}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 p-3 font-mono text-xs leading-relaxed text-white focus:outline-[#E7C768]"
                rows={f.rows}
                maxLength={f.max}
                value={val}
                onChange={(e) => onChange({ [f.camel]: e.target.value } as HHTemplateValues)}
                placeholder={generating ? "ИИ генерирует текст..." : "Нажмите «Сгенерировать 3 шаблона» или введите текст вручную"}
              />
              <div className="mt-1 text-right text-[10px] text-slate-500">
                {val.length}/{f.max}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HHTemplatesSection;