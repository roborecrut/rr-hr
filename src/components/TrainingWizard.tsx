import { useEffect, useMemo, useState } from "react";
import { GraduationCap, RefreshCw, Sparkles, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { aiEnhanceSingle } from "@/lib/aiClient";
import {
  DEFAULT_TRAINING_TEMPLATES,
  getRoleTemplates,
  mergedTemplate,
  saveRoleTemplates,
  type TrainingFieldKey,
} from "@/lib/vacancyTemplates";
import type { JobProject } from "../types";

type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;

interface Props {
  projects: JobProject[];
  refreshProjects: () => Promise<void> | void;
  addAuditEvent: AuditFn;
}

const FIELDS: { key: TrainingFieldKey; label: string; rows: number; max: number; col: string }[] = [
  { key: "training_intro_text", label: "Вводная (для кого курс, цели за 5 дней)", rows: 3, max: 600, col: "training_intro_text" },
  { key: "training_prof_text", label: "Профессиональное обучение (уроки + тесты)", rows: 6, max: 1500, col: "training_prof_text" },
  { key: "training_product_text", label: "Обучение продукту / компании", rows: 6, max: 1500, col: "training_product_text" },
  { key: "training_system_text", label: "Обучение процессам и системе (CRM, отчётность)", rows: 6, max: 1500, col: "training_system_text" },
  { key: "training_wiki_text", label: "База Wiki / ссылки на материалы", rows: 3, max: 800, col: "training_wiki_text" },
  { key: "training_regulations_text", label: "Регламенты ежедневной работы", rows: 4, max: 800, col: "training_regulations_text" },
];

// DB column map: text fields are stored on `projects`. The first three reuse the
// existing project columns; the rest use new columns added in the migration.
const COLUMN_MAP: Record<TrainingFieldKey, string> = {
  training_intro_text: "training_intro_text",
  training_prof_text: "training_prof_text", // legacy column also exists as `training_prof_text`? — fallback to landing field; project may use trainingProfText camel
  training_product_text: "training_product_text",
  training_system_text: "training_system_text",
  training_wiki_text: "training_wiki_text",
  training_regulations_text: "training_regulations_text",
};

export default function TrainingWizard({ projects, refreshProjects, addAuditEvent }: Props) {
  const [projectId, setProjectId] = useState<string>("");
  // Auto-select the project from `?project=` so the "Open Training Wizard"
  // button on each vacancy card lands directly on the right course.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("project");
    if (q && projects.some(p => p.id === q)) setProjectId(q);
  }, [projects]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [enhancing, setEnhancing] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [roleTemplates, setRoleTemplates] = useState<Record<string, string>>({});

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

  // When the user picks a vacancy, load the project's stored fields + role templates.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    (async () => {
      // Load existing values from DB
      const { data } = await supabase
        .from("projects")
        .select("training_intro_text, training_prof_text, training_product_text, training_system_text, training_wiki_text, training_regulations_text")
        .eq("id", project.id)
        .maybeSingle();
      if (cancelled) return;
      const row = (data || {}) as Record<string, string | null>;
      const tpl = (await getRoleTemplates(project.roleName || "")) as Record<string, string>;
      if (cancelled) return;
      setRoleTemplates(tpl);
      const next: Record<string, string> = {};
      for (const f of FIELDS) {
        const fromDb = (row[f.col] || "").trim();
        next[f.key] = fromDb || (tpl[f.key] || DEFAULT_TRAINING_TEMPLATES[f.key] || "").trim();
      }
      setValues(next);
    })();
    return () => { cancelled = true; };
  }, [project?.id, project?.roleName]);

  const exampleFor = (k: TrainingFieldKey) => mergedTemplate(k, roleTemplates, DEFAULT_TRAINING_TEMPLATES as any);

  const handleEnhance = async (k: TrainingFieldKey) => {
    setEnhancing(p => ({ ...p, [k]: true }));
    try {
      const v = await aiEnhanceSingle({
        field: k,
        value: values[k] || "",
        company_name: project?.companyName,
        role_name: project?.roleName,
        template: exampleFor(k) || undefined,
      });
      if (v) setValues(s => ({ ...s, [k]: v }));
      addAuditEvent("success", "Поле обучения улучшено ИИ", k as string);
    } catch (err: any) {
      addAuditEvent("warning", "Ошибка ИИ", err?.message || "ai-enhance failed");
    } finally {
      setEnhancing(p => ({ ...p, [k]: false }));
    }
  };

  const handleSave = async () => {
    if (!project) {
      addAuditEvent("warning", "Выберите вакансию", "Курс прикрепляется к конкретной вакансии.");
      return;
    }
    setSaving(true);
    try {
      const patch: any = {};
      for (const f of FIELDS) patch[f.col] = values[f.key] || null;
      patch.training_published = true;
      const upd = await supabase.from("projects").update(patch).eq("id", project.id);
      if (upd.error) throw upd.error;

      // Save back into the per-role template catalog (only fills empty keys).
      if (project.roleName) {
        await saveRoleTemplates(project.roleName, {
          training_intro_text: values.training_intro_text,
          training_prof_text: values.training_prof_text,
          training_product_text: values.training_product_text,
          training_system_text: values.training_system_text,
          training_wiki_text: values.training_wiki_text,
          training_regulations_text: values.training_regulations_text,
        });
      }
      addAuditEvent("success", "Курс обучения сохранён", `Прикреплён к вакансии «${project.roleName}»`);
      await refreshProjects();
    } catch (err: any) {
      addAuditEvent("warning", "Ошибка сохранения", err?.message || "supabase error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E7C768]/15 flex items-center justify-center text-[#E7C768]">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-xl font-bold text-white">Мастер Обучения</h2>
            <p className="text-xs text-slate-300">
              Курс прикрепляется к конкретной вакансии и доступен кандидату <strong>только в личном кабинете</strong> — после успешного прохождения интервью.
            </p>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-200 block mb-1">Вакансия:</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-[#17344F] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768]"
          >
            <option value="">— Выберите вакансию —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.roleName || "(без названия)"} — 🏢 {p.companyName || "—"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {project && (
        <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 space-y-4">
          {FIELDS.map(({ key, label, rows, max }) => {
            const example = exampleFor(key);
            const isOpen = !!show[key];
            return (
              <div key={key}>
                <label className="text-xs font-bold text-slate-200 block mb-1 flex items-center justify-between gap-2">
                  <span className="truncate flex items-center gap-1.5"><BookOpen className="w-3 h-3 text-[#E7C768]" />{label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShow(p => ({ ...p, [key]: !p[key] }))}
                      className="text-[10px] text-[#E7C768] hover:underline font-semibold"
                    >
                      {isOpen ? "Скрыть пример" : "📋 Показать пример"}
                    </button>
                    <span className="text-[10px] text-slate-400 font-mono">до {max}</span>
                  </span>
                </label>
                {isOpen && example && (
                  <div className="mb-2 bg-[#0F2A42]/70 border border-[#E7C768]/25 rounded-xl p-2.5 text-[10.5px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                    <div className="text-[9px] uppercase text-[#E7C768]/80 font-bold tracking-wider mb-1">Эталон для роли «{project.roleName}»</div>
                    {example}
                    <button
                      type="button"
                      onClick={() => setValues(s => ({ ...s, [key]: example }))}
                      className="block mt-2 text-[10px] text-[#E7C768] hover:underline font-semibold"
                    >
                      ↓ Подставить пример в поле
                    </button>
                  </div>
                )}
                <div className="relative">
                  <textarea
                    rows={rows}
                    maxLength={max}
                    className="w-full bg-[#17344F]/60 text-xs p-2.5 pr-9 rounded-xl border border-white/10 focus:outline-[#E7C768]"
                    value={values[key] || ""}
                    onChange={(e) => setValues(s => ({ ...s, [key]: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => handleEnhance(key)}
                    disabled={enhancing[key]}
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-[#E7C768] disabled:opacity-30"
                    title="Оформить красиво ИИ"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${enhancing[key] ? "animate-spin text-yellow-400" : ""}`} />
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition"
          >
            {saving ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Сохраняем…</>
            ) : ("Сохранить курс обучения")}
          </button>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-100 leading-relaxed">
            ℹ️ Сохранённый курс автоматически появится в личном кабинете кандидата на вкладке «📚 Обучение» после успешного прохождения интервью.
          </div>
        </div>
      )}
    </div>
  );
}