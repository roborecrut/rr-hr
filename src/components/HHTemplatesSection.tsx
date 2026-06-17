import React, { useState } from "react";
import { Sparkles, Wand2, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAIWait } from "./AIWaitProvider";
import { useAIReady } from "@/lib/aiReady";
import FieldHelp from "./FieldHelp";
import FieldActionsMenu from "./FieldActionsMenu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const FIELDS: { key: FieldKey; camel: keyof HHTemplateValues; tab: string; label: string; hint: string; rows: number; max: number; help: string }[] = [
  {
    key: "hh_post_text",
    camel: "hhPostText",
    tab: "Вакансия",
    label: "Шаблон вакансии для публикации на HH",
    hint: "Готовый текст с разделами «О компании», «Обязанности», «Требования», «Условия». Вставьте напрямую в форму hh.ru.",
    rows: 14,
    max: 6000,
    help: "Этот текст ИИ оформит так, чтобы вакансия получала максимум откликов на hh.ru: продающее описание компании, чёткие обязанности, понятные требования и условия.",
  },
  {
    key: "hh_invite_text",
    camel: "hhInviteText",
    tab: "Приглашение",
    label: "Шаблон приглашения кандидата на интервью с Роботом Рекрутером",
    hint: "Используется как авто-ответ на отклики hh.ru. Содержит ссылку на лендинг вакансии и приглашение пройти ИИ-интервью.",
    rows: 10,
    max: 3000,
    help: "Тёплое короткое письмо для авто-отклика hh.ru: благодарность за отклик + приглашение пройти короткое интервью с Роботом Рекрутером по ссылке на вакансию.",
  },
  {
    key: "hh_autoresume_text",
    camel: "hhAutoresumeText",
    tab: "Авторазбор",
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
  const [activeTab, setActiveTab] = useState<FieldKey>("hh_post_text");

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
    <div className="brand-editor space-y-4 rounded-3xl border border-[#E7C768]/40 bg-gradient-to-br from-[#1a3d5e] to-[#265582] p-5">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">
            📢 Шаблоны для HH.ru
          </span>
          <h3 className="mt-1 text-lg font-bold text-white">
            3 готовых текста для hh.ru
          </h3>
          <p className="mt-1 text-xs text-slate-300">
            ИИ сгенерирует вакансию, авто-приглашение и инструкцию по авторазбору.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !aiReady}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] px-5 py-2.5 text-sm font-bold text-[#17344F] shadow-md transition hover:brightness-110 disabled:opacity-50"
          title={hasAny ? "Перегенерировать все 3 шаблона" : "Сгенерировать через ИИ"}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {hasAny ? "Перегенерировать" : "Сгенерировать"}
        </button>
      </header>

      {!hasAny && !generating && (
        <div className="rounded-2xl border border-dashed border-[#E7C768]/40 bg-white/5 p-4 text-sm text-slate-200">
          Поля пусты. Нажмите <strong className="text-[#E7C768]">«Сгенерировать»</strong> — ИИ заполнит их данными вашей вакансии.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FieldKey)}>
        <TabsList className="grid w-full grid-cols-3 bg-white/5 p-1">
          {FIELDS.map((f) => {
            const filled = !!(values[f.camel] || "").trim();
            return (
              <TabsTrigger
                key={f.key}
                value={f.key}
                className="text-sm font-semibold data-[state=active]:bg-[#E7C768] data-[state=active]:text-[#17344F]"
              >
                <span className="inline-flex items-center gap-1.5">
                  {f.tab}
                  {filled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {FIELDS.map((f) => {
          const val = values[f.camel] || "";
          return (
            <TabsContent key={f.key} value={f.key} className="mt-4">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="block text-sm font-bold text-slate-100 inline-flex items-center">
                      {f.label}
                      <FieldHelp
                        section="vacancies"
                        fieldKey={f.key}
                        fallbackTitle={f.label}
                        fallbackBody={f.help}
                      />
                    </label>
                    <p className="mt-1 text-xs text-slate-400">{f.hint}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {aiReady && val.trim().length >= 7 && (
                      <button
                        type="button"
                        onClick={() => handleEnhanceField(f.key, f.label)}
                        disabled={enhancingKey === f.key}
                        className="flex items-center gap-1 rounded-lg border border-[#E7C768]/30 bg-[#E7C768]/10 px-2.5 py-1.5 text-xs font-bold text-[#E7C768] transition hover:bg-[#E7C768]/20 disabled:opacity-50"
                        title="Улучшить этот текст через ИИ"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        {enhancingKey === f.key ? "..." : "AI"}
                      </button>
                    )}
                    <FieldActionsMenu
                      ariaLabel="Действия с шаблоном"
                      actions={[
                        {
                          icon: <Copy className="h-4 w-4" />,
                          label: "Скопировать текст",
                          onClick: () => copyToClipboard(val),
                          disabled: !val.trim(),
                        },
                      ]}
                    />
                  </div>
                </div>
                <textarea
                  className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 p-3 text-sm leading-relaxed text-white focus:outline-[#E7C768]"
                  rows={f.rows}
                  maxLength={f.max}
                  value={val}
                  onChange={(e) => onChange({ [f.camel]: e.target.value } as HHTemplateValues)}
                  placeholder={generating ? "ИИ генерирует текст..." : "Нажмите «Сгенерировать» или введите текст вручную"}
                />
                <div className="mt-1 text-right text-[11px] text-slate-500">
                  {val.length}/{f.max}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default HHTemplatesSection;