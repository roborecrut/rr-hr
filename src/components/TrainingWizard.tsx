import React, { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, RefreshCw, Sparkles, BookOpen, FileQuestion, Eye, Pencil, Plus, Trash2, ArrowLeft, Bold, Italic, Heading1, Heading2, List, ListOrdered, Link2, Code, Youtube, FileText, Save, CheckCircle2, ChevronDown, ChevronUp, Video } from "lucide-react";
import EmbeddedMarkdown from "@/components/EmbeddedMarkdown";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { supabase } from "@/integrations/supabase/client";
import { FN } from "@/config";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import FullscreenTextarea from "@/components/FullscreenTextarea";
import { DocumentIngestField } from "@/components/DocumentIngestField";
import FieldHelp from "@/components/FieldHelp";
import type { JobProject } from "../types";

type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;
type Stage = "professional" | "product" | "system";

interface Props {
  projects: JobProject[];
  refreshProjects: () => Promise<void> | void;
  addAuditEvent: AuditFn;
  /** When set, opens the editor for this vacancy and locks the picker. */
  initialProjectId?: string;
  /** When set, opens in "create new" mode — user must pick a vacancy. */
  createMode?: boolean;
  /** Back-to-list callback. */
  onBack?: () => void;
}

const STAGES: { key: Stage; title: string; hint: string }[] = [
  { key: "professional", title: "1. Профессиональное обучение", hint: "Навыки, обязанности, методики по должности" },
  { key: "product",      title: "2. Продуктовое обучение",       hint: "Продукты, услуги и аргументация компании" },
  { key: "system",       title: "3. Системное обучение",         hint: "CRM, регламенты, условия работы" },
];

type BlockRow = { id: string; project_id: string; stage: string; title: string; materials_md: string | null };
type QuestionRow = {
  id: string; kind: "choice" | "text"; question: string; points: number;
  options?: { text: string; is_correct?: boolean }[] | null;
  correct?: string | null; expected_answer?: string | null; explanation?: string;
};
type TestRow = { id?: string; questions: QuestionRow[]; pass_score: number; total_score: number; shuffle: boolean };

const MAX_QUESTIONS = 30;

const CONTEXT_OPTIONS: { key: string; label: string; column: string; fallbackColumn?: string }[] = [
  { key: "intro",        label: "Введение",         column: "training_wiki_text",          fallbackColumn: "training_intro_text" },
  { key: "professional", label: "Профессиональный", column: "training_professional_text", fallbackColumn: "training_prof_text" },
  { key: "product",      label: "Продуктовый",      column: "training_product_text" },
  { key: "systems",      label: "Системный",        column: "training_systems_text",      fallbackColumn: "training_system_text" },
  { key: "regulations",  label: "Регламенты",       column: "training_regulations_text" },
];
const CONTEXT_MAX = 1500;

const STAGE_DEFAULT_CONTEXT: Record<Stage, string[]> = {
  professional: ["intro", "professional"],
  product:      ["product"],
  system:       ["systems", "regulations"],
};

export default function TrainingWizard({ projects, refreshProjects, addAuditEvent, initialProjectId, createMode, onBack }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  // Always lock the picker when a project was pre-selected (incl. when the
  // spend-confirm dialog chose it in create mode).
  const lockedProject = !!initialProjectId;
  const [stage, setStage] = useState<Stage>("professional");
  // Под-вкладка в рамках выбранного этапа: материал обучения vs аттестация (тест).
  // Делит длинную простыню на 2 экрана, как просит работодатель.
  const [subTab, setSubTab] = useState<"material" | "test">("material");
  const [block, setBlock] = useState<BlockRow | null>(null);
  const [materials, setMaterials] = useState<string>("");
  const [test, setTest] = useState<TestRow>({ questions: [], pass_score: 70, total_score: 100, shuffle: true });
  // Per-stage uploaded source text (one file context per stage)
  const [sources, setSources] = useState<Record<Stage, string>>({ professional: "", product: "", system: "" });
  const source = sources[stage] || "";
  const setSource = (v: string) => setSources(s => ({ ...s, [stage]: v }));
  const materialsRef = useRef<HTMLTextAreaElement | null>(null);
  const [busyMaterial, setBusyMaterial] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMd, setPreviewMd] = useState(false);
  const [contextKeysByStage, setContextKeysByStage] = useState<Record<Stage, string[]>>({
    professional: STAGE_DEFAULT_CONTEXT.professional,
    product:      STAGE_DEFAULT_CONTEXT.product,
    system:       STAGE_DEFAULT_CONTEXT.system,
  });
  const contextKeys = contextKeysByStage[stage];
  const toggleContextKey = (k: string) =>
    setContextKeysByStage(s => ({
      ...s,
      [stage]: s[stage].includes(k) ? s[stage].filter(x => x !== k) : [...s[stage], k],
    }));
  const [wishesMaterial, setWishesMaterial] = useState("");
  const [wishesTest, setWishesTest] = useState("");
  const [existingSystems, setExistingSystems] = useState<Set<string>>(new Set());

  // Context source values (loaded from `projects` row) + editable buffers.
  const [contextValues, setContextValues] = useState<Record<string, string>>({});
  const [contextDirty, setContextDirty] = useState<Record<string, boolean>>({});
  const [contextSaving, setContextSaving] = useState(false);
  const [contextExpanded, setContextExpanded] = useState<Record<string, boolean>>({});

  // Save animation flash for material / test
  const [savedFlashMaterial, setSavedFlashMaterial] = useState(false);
  const [savedFlashTest, setSavedFlashTest] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("project");
    if (!initialProjectId && q && projects.some(p => p.id === q)) setProjectId(q);
  }, [projects, initialProjectId]);

  // When in "create" mode, fetch list of projects that already have a system
  // so the picker can warn the user.
  useEffect(() => {
    if (!createMode) return;
    (async () => {
      const ids = projects.map(p => p.id);
      if (!ids.length) return;
      const { data } = await supabase.from("training_blocks").select("project_id").in("project_id", ids);
      const set = new Set<string>();
      (data || []).forEach((r: any) => set.add(r.project_id));
      setExistingSystems(set);
    })();
  }, [createMode, projects]);

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

  // Reset per-stage source uploads when the project changes
  useEffect(() => {
    setSources({ professional: "", product: "", system: "" });
  }, [project?.id]);

  // Load context source values straight from `projects` row when project changes.
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      const cols = CONTEXT_OPTIONS.flatMap(o => o.fallbackColumn ? [o.column, o.fallbackColumn] : [o.column]);
      const { data } = await supabase.from("projects").select(cols.join(",")).eq("id", project.id).maybeSingle();
      if (cancelled) return;
      const row: any = data || {};
      const next: Record<string, string> = {};
      CONTEXT_OPTIONS.forEach(o => {
        next[o.key] = row[o.column] ?? row[o.fallbackColumn || ""] ?? "";
      });
      setContextValues(next);
      setContextDirty({});
    })();
    return () => { cancelled = true; };
  }, [project?.id]);

  const saveContextValues = async () => {
    if (!project) return;
    const dirtyKeys = Object.keys(contextDirty).filter(k => contextDirty[k]);
    if (!dirtyKeys.length) return;
    setContextSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      dirtyKeys.forEach(k => {
        const opt = CONTEXT_OPTIONS.find(o => o.key === k);
        if (!opt) return;
        patch[opt.column] = (contextValues[k] || "").slice(0, CONTEXT_MAX) || null;
        if (opt.fallbackColumn) patch[opt.fallbackColumn] = patch[opt.column];
      });
      const { error } = await (supabase.from("projects") as any).update(patch).eq("id", project.id);
      if (error) throw error;
      setContextDirty({});
      addAuditEvent("success", "Контекст сохранён в БД", `Полей обновлено: ${dirtyKeys.length}`);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка сохранения контекста", e?.message || "");
    } finally { setContextSaving(false); }
  };

  // Markdown toolbar helper — wraps current selection or inserts at caret
  const applyMd = (prefix: string, suffix = "", placeholder = "") => {
    const ta = materialsRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = materials.slice(0, start);
    const sel = materials.slice(start, end) || placeholder;
    const after = materials.slice(end);
    const insert = `${prefix}${sel}${suffix}`;
    const next = `${before}${insert}${after}`.slice(0, 10000);
    setMaterials(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + prefix.length;
      ta.setSelectionRange(pos, pos + sel.length);
    });
  };
  const applyLinePrefix = (prefix: string) => {
    const ta = materialsRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const lineStart = materials.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = materials.indexOf("\n", end);
    const realEnd = lineEnd === -1 ? materials.length : lineEnd;
    const segment = materials.slice(lineStart, realEnd);
    const replaced = segment.split("\n").map(l => l.startsWith(prefix) ? l : `${prefix}${l}`).join("\n");
    const next = (materials.slice(0, lineStart) + replaced + materials.slice(realEnd)).slice(0, 10000);
    setMaterials(next);
    requestAnimationFrame(() => ta.focus());
  };

  // Insert an embeddable link on its own paragraph (auto-rendered as iframe in preview)
  const insertEmbed = (kind: "youtube" | "vk" | "rutube" | "gdoc") => {
    const ta = materialsRef.current;
    if (!ta) return;
    const placeholders: Record<typeof kind, string> = {
      youtube: "https://www.youtube.com/watch?v=ID",
      vk: "https://vk.com/video-1234567_456239021",
      rutube: "https://rutube.ru/video/abc123def456/",
      gdoc: "https://docs.google.com/document/d/DOC_ID/edit",
    } as any;
    const url = window.prompt(`Вставьте ссылку (${kind.toUpperCase()})`, placeholders[kind]);
    if (!url) return;
    const start = ta.selectionStart ?? materials.length;
    const before = materials.slice(0, start);
    const after = materials.slice(start);
    const sep1 = before.endsWith("\n\n") || before.length === 0 ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
    const sep2 = after.startsWith("\n\n") || after.length === 0 ? "" : (after.startsWith("\n") ? "\n" : "\n\n");
    const next = (before + sep1 + url + sep2 + after).slice(0, 10000);
    setMaterials(next);
    requestAnimationFrame(() => ta.focus());
  };

  // Load stage block + test
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    (async () => {
      const [{ data: blocks }, { data: tests }] = await Promise.all([
        supabase.from("training_blocks").select("*").eq("project_id", project.id).eq("stage", stage),
        supabase.from("training_stage_tests").select("*").eq("project_id", project.id).eq("stage", stage).maybeSingle(),
      ]);
      if (cancelled) return;
      const b = (blocks || [])[0] as any || null;
      setBlock(b);
      setMaterials(b?.materials_md || "");
      setTest({
        id: (tests as any)?.id,
        questions: ((tests as any)?.questions as QuestionRow[]) || [],
        pass_score: (tests as any)?.pass_score || 70,
        total_score: (tests as any)?.total_score || 100,
        shuffle: (tests as any)?.shuffle_questions !== false,
      });
    })();
    return () => { cancelled = true; };
  }, [project?.id, stage]);

  const callEdge = async <T,>(fn: string, body: any): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(FN(fn), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json as any)?.error) {
      const e: any = new Error((json as any)?.error || `http_${res.status}`);
      e.jobId = (json as any)?.job_id || null;
      e.fallbackAvailable = !!(json as any)?.fallback_available;
      throw e;
    }
    return json as T;
  };

  const generateMaterial = async () => {
    if (!project) return;
    setBusyMaterial(true);
    try {
      const r = await aiWaitRun({
        title: "Генерация учебного материала",
        task: () => callEdge<{ text: string }>("ai-generate-stage-material", {
          project_id: project.id, stage, source_text: source || undefined,
          context_keys: contextKeys, wishes: wishesMaterial || undefined,
        }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data: any) => {
            if (data?.text) {
              setMaterials(data.text);
              addAuditEvent("success", "RR Pro Max", "Материал сгенерирован резервной моделью");
            }
          },
        },
      });
      if (!r) return;
      setMaterials(r.text || "");
      addAuditEvent("success", "Материал сгенерирован ИИ", `${stage}: ${(r.text || "").length} симв.`);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка генерации материала", e?.message || "");
    } finally { setBusyMaterial(false); }
  };

  const generateTest = async () => {
    if (!project) return;
    setBusyTest(true);
    try {
      // ensure latest materials are saved first
      await saveMaterials(true);
      const r = await aiWaitRun({
        title: "Генерация теста по материалу",
        task: () => callEdge<{ count: number; total_score: number }>("ai-generate-stage-test", {
          project_id: project.id, stage,
          context_keys: contextKeys, wishes: wishesTest || undefined,
        }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async () => {
            const { data: t } = await supabase.from("training_stage_tests")
              .select("*").eq("project_id", project.id).eq("stage", stage).maybeSingle();
            setTest({
              id: (t as any)?.id,
              questions: ((t as any)?.questions as QuestionRow[]) || [],
              pass_score: (t as any)?.pass_score || 70,
              total_score: (t as any)?.total_score || 100,
              shuffle: (t as any)?.shuffle_questions !== false,
            });
            addAuditEvent("success", "RR Pro Max", "Тест сгенерирован резервной моделью");
          },
        },
      });
      if (!r) return;
      // reload test
      const { data: t } = await supabase.from("training_stage_tests")
        .select("*").eq("project_id", project.id).eq("stage", stage).maybeSingle();
      setTest({
        id: (t as any)?.id,
        questions: ((t as any)?.questions as QuestionRow[]) || [],
        pass_score: (t as any)?.pass_score || 70,
        total_score: (t as any)?.total_score || 100,
        shuffle: (t as any)?.shuffle_questions !== false,
      });
      addAuditEvent("success", "Тест сгенерирован ИИ", `${stage}: ${r.count} вопросов`);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка генерации теста", e?.message || "");
    } finally { setBusyTest(false); }
  };

  const saveMaterials = async (silent = false) => {
    if (!project) return;
    setSaving(true);
    try {
      const stageTitle = STAGES.find(s => s.key === stage)!.title;
      if (block?.id) {
        await supabase.from("training_blocks").update({ materials_md: materials, title: stageTitle }).eq("id", block.id);
      } else {
        const { data, error } = await supabase.from("training_blocks").insert({
          project_id: project.id, stage, block_key: stage,
          title: stageTitle, materials_md: materials, pass_score: 70,
        }).select("*").single();
        if (error) throw error;
        setBlock(data as any);
      }
      if (!silent) {
        addAuditEvent("success", "Материалы сохранены", `Этап: ${stage}`);
        setSavedFlashMaterial(true);
        setTimeout(() => setSavedFlashMaterial(false), 2200);
      }
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка сохранения", e?.message || "");
    } finally { setSaving(false); }
  };

  const saveTest = async () => {
    if (!project || !test.questions.length) return;
    setSaving(true);
    try {
      const total = test.questions.reduce((s, q) => s + (q.points || 5), 0);
      if (test.id) {
        await (supabase as any).from("training_stage_tests").update({
          questions: test.questions, pass_score: test.pass_score, total_score: total, shuffle_questions: test.shuffle,
        }).eq("id", test.id);
      } else {
        const { data, error } = await (supabase as any).from("training_stage_tests").insert({
          project_id: project.id, stage,
          questions: test.questions, pass_score: test.pass_score, total_score: total, shuffle_questions: test.shuffle,
        }).select("*").single();
        if (error) throw error;
        setTest(t => ({ ...t, id: (data as any).id, total_score: total }));
      }
      addAuditEvent("success", "Тест сохранён", `${test.questions.length} вопросов, проходной ${test.pass_score}`);
      setSavedFlashTest(true);
      setTimeout(() => setSavedFlashTest(false), 2200);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка сохранения теста", e?.message || "");
    } finally { setSaving(false); }
  };

  const updateQuestion = (i: number, patch: Partial<QuestionRow>) => {
    setTest(t => ({ ...t, questions: t.questions.map((q, idx) => idx === i ? { ...q, ...patch } : q) }));
  };
  const updateChoiceOption = (qi: number, oi: number, text: string, correct?: boolean) => {
    setTest(t => ({
      ...t,
      questions: t.questions.map((q, idx) => {
        if (idx !== qi || q.kind !== "choice") return q;
        const options = (q.options || []).map((o, j) => j === oi
          ? { text, is_correct: correct ?? o.is_correct }
          : (correct === true ? { ...o, is_correct: false } : o));
        const correctText = options.find(o => o.is_correct)?.text || q.correct || "";
        return { ...q, options, correct: correctText };
      }),
    }));
  };

  return (
    <div className="space-y-6">
      {onBack && (
        <button type="button" onClick={onBack}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> К списку систем
        </button>
      )}
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E7C768]/15 flex items-center justify-center text-[#E7C768]">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-xl font-bold text-white">
              {createMode ? "Создание системы обучения" : "Редактор системы обучения"}
            </h2>
            <p className="text-xs text-slate-300">
              3 последовательных этапа. Кандидат проходит этапы по порядку, тест каждого можно перепроходить <strong>неограниченно</strong> до достижения проходного балла.
            </p>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-200 mb-1 inline-flex items-center">
            Вакансия{createMode ? " (обязательно)" : ""}:
            <FieldHelp
              section="training"
              fieldKey="project_select"
              fallbackTitle="Выбор вакансии"
              fallbackBody="Обучение всегда привязано к конкретной вакансии. ИИ берёт описание этой вакансии и компании как контекст для генерации материалов и тестов."
            />
          </label>
          <select
            value={projectId}
            disabled={lockedProject}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-[#17344F] text-xs p-2.5 rounded-xl border border-white/10 text-white focus:outline-[#E7C768] disabled:opacity-70"
          >
            <option value="">— Выберите вакансию —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.roleName || "(без названия)"} — 🏢 {p.companyName || "—"}
                {createMode && existingSystems.has(p.id) ? " · уже есть система" : ""}
              </option>
            ))}
          </select>
          {createMode && projectId && existingSystems.has(projectId) && (
            <p className="text-[11px] text-amber-300 mt-1.5">
              ⚠️ Для этой вакансии уже создана система обучения. Сохранение перезапишет существующие материалы и тесты.
            </p>
          )}
        </div>
      </div>

      {project && (
        <>
          {/* Stage tabs */}
          <div className="grid grid-cols-3 gap-2">
            {STAGES.map(s => (
              <button key={s.key} type="button" onClick={() => setStage(s.key)}
                className={`p-3 rounded-2xl text-left border transition ${stage === s.key
                  ? "bg-[#E7C768] text-[#1E4468] border-[#E7C768]"
                  : "bg-[#1E4468]/60 text-white border-white/10 hover:border-[#E7C768]/40"}`}>
                <div className="text-xs font-bold">{s.title}</div>
                <div className="text-[10px] opacity-80 mt-0.5">{s.hint}</div>
              </button>
            ))}
          </div>

          {/* Sub-tabs: материал обучения vs аттестация (тест) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSubTab("material")}
              className={`px-4 py-2.5 rounded-2xl text-sm font-bold border transition ${
                subTab === "material"
                  ? "bg-[#E7C768]/20 border-[#E7C768] text-[#E7C768]"
                  : "bg-[#1E4468]/40 border-white/10 text-white hover:border-[#E7C768]/40"
              }`}
            >
              📚 Обучение — материал
            </button>
            <button
              type="button"
              onClick={() => setSubTab("test")}
              className={`px-4 py-2.5 rounded-2xl text-sm font-bold border transition ${
                subTab === "test"
                  ? "bg-[#E7C768]/20 border-[#E7C768] text-[#E7C768]"
                  : "bg-[#1E4468]/40 border-white/10 text-white hover:border-[#E7C768]/40"
              }`}
            >
              ✅ Аттестация — тест
            </button>
          </div>

          {subTab === "material" && (<>
          {/* Context sources — placed under the stage selector. Each row = textarea + checkbox on right. */}
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-xs font-bold text-[#E7C768]">Источники контекста для ИИ</div>
                <p className="text-[11px] text-slate-400">
                  Галочки справа отмечают, какие блоки передавать ИИ для выбранного раздела «{STAGES.find(s => s.key === stage)?.title}». Содержимое можно править здесь и сохранить в БД вакансии.
                </p>
              </div>
              <button type="button" onClick={saveContextValues}
                disabled={contextSaving || !Object.values(contextDirty).some(Boolean)}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#E7C768] text-[#1E4468] font-bold flex items-center gap-1.5 disabled:opacity-40">
                {contextSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Сохранить контекст в БД
              </button>
            </div>

            <div className="space-y-2">
              {CONTEXT_OPTIONS.map(opt => {
                const checked = contextKeys.includes(opt.key);
                const isOpen = contextExpanded[opt.key] ?? true;
                const dirty = !!contextDirty[opt.key];
                const val = contextValues[opt.key] || "";
                return (
                  <div key={opt.key} className={`rounded-xl border ${dirty ? "border-[#E7C768]/60 bg-[#E7C768]/5" : "border-white/10 bg-[#17344F]/40"}`}>
                    <div className="flex items-center justify-between px-3 py-2 gap-3">
                      <button type="button"
                        onClick={() => setContextExpanded(e => ({ ...e, [opt.key]: !isOpen }))}
                        className="flex-1 flex items-center justify-between text-left">
                        <span className="text-[11px] font-bold text-white flex items-center gap-2">
                          {opt.label}
                          {dirty && <span className="text-[9px] text-[#E7C768]">● не сохранено</span>}
                        </span>
                        <span className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{val.length}/{CONTEXT_MAX}</span>
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                      <label
                        title={checked ? "Передавать ИИ" : "Не передавать ИИ"}
                        className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center cursor-pointer ${
                          checked ? "bg-[#E7C768] border-[#E7C768]" : "bg-white/5 border-white/20"
                        }`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleContextKey(opt.key)} className="hidden" />
                        {checked && <CheckCircle2 className="w-3.5 h-3.5 text-[#1E4468]" />}
                      </label>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 flex gap-2 items-start">
                        <textarea
                          rows={4}
                          maxLength={CONTEXT_MAX}
                          value={val}
                          onChange={(e) => {
                            const v = e.target.value;
                            setContextValues(s => ({ ...s, [opt.key]: v }));
                            setContextDirty(d => ({ ...d, [opt.key]: true }));
                          }}
                          placeholder={`Текст блока «${opt.label}» (передаётся ИИ, если галочка справа активна).`}
                          className="flex-1 bg-[#0F2A42]/80 text-xs p-2.5 rounded-lg border border-white/10 text-white focus:outline-[#E7C768]"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Materials */}
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-3xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-white flex items-center gap-2"><BookOpen className="w-4 h-4 text-[#E7C768]" /> Учебный материал</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreviewMd(p => !p)}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-slate-200 flex items-center gap-1">
                  {previewMd ? <><Pencil className="w-3 h-3" /> Править</> : <><Eye className="w-3 h-3" /> Превью</>}
                </button>
              </div>
            </div>

            <DocumentIngestField
              entity="training"
              entityId={`${project.id}-${stage}`}
              value={source}
              onChange={setSource}
              showDistribute={false}
              label="Загрузить материал (PDF / DOC / Markdown) или вставить ссылку"
              placeholder="ИИ извлечёт текст и оформит его в учебный материал"
              maxLength={20000}
            />

            <div>
              <label className="text-[11px] text-slate-300 font-bold inline-flex items-center">
                Пожелания к материалу (необязательно)
                <FieldHelp
                  section="training"
                  fieldKey="wishes_material"
                  fallbackTitle="Пожелания к учебному материалу"
                  fallbackBody="Свободный текст для ИИ: чего добавить, на чём сделать акцент, какой тон выдержать. Например: «Больше практических кейсов», «Разобрать частые возражения клиентов»."
                />
              </label>
              <textarea rows={2} maxLength={1000} value={wishesMaterial}
                onChange={(e) => setWishesMaterial(e.target.value)}
                placeholder="Например: «Сделай больше практических кейсов», «Добавь раздел про работу с возражениями»…"
                className="mt-1 w-full bg-[#17344F]/60 text-xs p-2 rounded-lg border border-white/10 text-white" />
              <div className="text-[10px] text-slate-500 text-right">{wishesMaterial.length}/1000</div>
            </div>

            <button type="button" onClick={generateMaterial} disabled={busyMaterial}
              className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busyMaterial ? <><RefreshCw className="w-4 h-4 animate-spin" /> Генерируем…</> : <><Sparkles className="w-4 h-4" /> Оформить материал ИИ</>}
            </button>
            {busyMaterial && <LoadingPhrase entity="training" />}

            {previewMd ? (
              <div className="min-h-[200px]">
                <RichTrainingMaterialCard title={`Превью учебного материала — ${STAGES.find(s => s.key === stage)?.title || ""}`}>
                  {materials || "_Пусто_"}
                </RichTrainingMaterialCard>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 bg-[#0F2A42]/60 border border-white/10 rounded-lg p-1.5">
                  <button type="button" title="Заголовок H1" onClick={() => applyLinePrefix("# ")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Heading1 className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Заголовок H2" onClick={() => applyLinePrefix("## ")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Heading2 className="w-3.5 h-3.5" /></button>
                  <span className="w-px bg-white/10 mx-1" />
                  <button type="button" title="Жирный" onClick={() => applyMd("**", "**", "текст")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Bold className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Курсив" onClick={() => applyMd("_", "_", "текст")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Italic className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Код" onClick={() => applyMd("`", "`", "код")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Code className="w-3.5 h-3.5" /></button>
                  <span className="w-px bg-white/10 mx-1" />
                  <button type="button" title="Маркированный список" onClick={() => applyLinePrefix("- ")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><List className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Нумерованный список" onClick={() => applyLinePrefix("1. ")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><ListOrdered className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Ссылка" onClick={() => applyMd("[", "](https://)", "текст")}
                    className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Link2 className="w-3.5 h-3.5" /></button>
                  <span className="w-px bg-white/10 mx-1" />
                  <button type="button" title="Видео YouTube" onClick={() => insertEmbed("youtube")}
                    className="p-1.5 rounded hover:bg-white/10 text-rose-300"><Youtube className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Видео VK" onClick={() => insertEmbed("vk")}
                    className="p-1.5 rounded hover:bg-white/10 text-sky-300"><Video className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Видео Rutube" onClick={() => insertEmbed("rutube")}
                    className="p-1.5 rounded hover:bg-white/10 text-orange-300"><Video className="w-3.5 h-3.5" /></button>
                  <button type="button" title="Google Docs / Sheets / Slides" onClick={() => insertEmbed("gdoc")}
                    className="p-1.5 rounded hover:bg-white/10 text-emerald-300"><FileText className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-[10px] text-slate-400 -mt-1">
                  Совет: вставьте отдельной строкой ссылку YouTube / VK Video / Rutube или Google Docs — в превью и у кандидата она автоматически станет встроенным проигрывателем/документом.
                </p>
                <FullscreenTextarea
                  label="Учебный материал"
                  ref={materialsRef}
                  rows={14}
                  maxLength={20000}
                  value={materials}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMaterials(e.target.value)}
                  placeholder="Markdown учебного материала (до 20 000 символов)…"
                  className="w-full bg-[#17344F]/60 text-xs p-3 rounded-xl border border-white/10 font-mono focus:outline-[#E7C768]"
                />
              </>
            )}
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span>{materials.length}/20000 символов</span>
              <div className="flex items-center gap-2">
                {saving && (
                  <span className="flex items-center gap-1.5 text-[#E7C768] animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Сохраняем в базу данных…
                  </span>
                )}
                {savedFlashMaterial && !saving && (
                  <span className="flex items-center gap-1 text-emerald-300 animate-fade-in">
                    <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                  </span>
                )}
                <button type="button" onClick={() => saveMaterials(false)} disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#1E4468] text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                  <Save className="w-3 h-3" /> Сохранить материал
                </button>
              </div>
            </div>
          </div>
          </>)}

          {subTab === "test" && (<>
          {/* Test */}
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-3xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <FileQuestion className="w-4 h-4 text-[#E7C768]" /> Тест по этапу ({test.questions.length}/{MAX_QUESTIONS} вопр., проходной {test.pass_score}/{test.total_score || 100})
              </div>
              <button type="button" onClick={generateTest} disabled={busyTest || !materials}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#E7C768] text-[#1E4468] font-bold flex items-center gap-1 disabled:opacity-40">
                {busyTest ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Сгенерировать тест ИИ
              </button>
            </div>
            {/* Editable pass score */}
            <div className="flex items-center gap-2 flex-wrap bg-[#0F2A42]/60 border border-white/10 rounded-lg p-2.5">
              <label className="text-[11px] text-slate-300 font-bold inline-flex items-center">
                Минимальный проходной балл:
                <FieldHelp
                  section="training"
                  fieldKey="pass_score"
                  fallbackTitle="Проходной балл этапа"
                  fallbackBody="Минимальный % правильных ответов в тесте. Если кандидат не дотянул — может перепройти тест неограниченно. Рекомендуем 70–80%."
                />
              </label>
              <input
                type="number" min={1} max={Math.max(test.total_score || 100, 1)} step={1}
                value={test.pass_score}
                onChange={(e) => {
                  const max = Math.max(test.total_score || 100, 1);
                  const v = Math.max(1, Math.min(max, Number(e.target.value) || 0));
                  setTest(t => ({ ...t, pass_score: v }));
                }}
                className="w-20 bg-[#17344F]/80 text-xs px-2 py-1 rounded border border-white/10 text-white focus:outline-[#E7C768]"
              />
              <span className="text-[11px] text-slate-400">из {test.total_score || (test.questions.length * 5) || 100} возможных</span>
              <span className="text-[10px] text-slate-500 ml-auto">Меняйте под свои требования и нажмите «Сохранить тест».</span>
            </div>
            {/* Shuffle toggle */}
            <label className="flex items-center gap-2 flex-wrap bg-[#0F2A42]/60 border border-white/10 rounded-lg p-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={test.shuffle}
                onChange={(e) => setTest(t => ({ ...t, shuffle: e.target.checked }))}
                className="accent-[#E7C768] w-4 h-4"
              />
              <span className="text-[11px] text-slate-200 font-bold">Случайный порядок вопросов и вариантов ответа</span>
              <span className="text-[10px] text-slate-500 ml-auto">При повторной сдаче кандидат увидит вопросы и варианты в другом порядке.</span>
            </label>
            <div>
              <label className="text-[11px] text-slate-300 font-bold inline-flex items-center">
                Пожелания к тесту (необязательно)
                <FieldHelp
                  section="training"
                  fieldKey="wishes_quiz"
                  fallbackTitle="Пожелания к тесту"
                  fallbackBody="Подсказки для ИИ: какие темы обязательно проверить, сколько вопросов, нужны ли ситуационные кейсы. Например: «10 вопросов, 2 кейса, без вопросов про продукт»."
                />
              </label>
              <textarea rows={2} maxLength={1000} value={wishesTest}
                onChange={(e) => setWishesTest(e.target.value)}
                placeholder="Например: «Больше вопросов про CRM», «Включи 3 каверзных вопроса с НЕ»…"
                className="mt-1 w-full bg-[#17344F]/60 text-xs p-2 rounded-lg border border-white/10 text-white" />
              <div className="text-[10px] text-slate-500 text-right">{wishesTest.length}/1000</div>
            </div>
            {busyTest && <LoadingPhrase entity="training" />}
            {test.questions.length === 0 && !busyTest && (
              <p className="text-xs text-slate-400">Сначала оформите материал, затем нажмите «Сгенерировать тест ИИ». 10 закрытых + 10 открытых вопросов, по 5 баллов.</p>
            )}

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {test.questions.map((q, i) => (
                <div key={q.id || i} className="bg-[#0F2A42]/70 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-[#E7C768] font-bold uppercase">
                    <span>#{i + 1} • {q.kind === "choice" ? "Выбор" : "Текст"} • {q.points || 5} б.</span>
                    <button type="button"
                      onClick={() => setTest(t => ({ ...t, questions: t.questions.filter((_, idx) => idx !== i) }))}
                      className="text-rose-300 hover:text-rose-200" title="Удалить вопрос">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={2} value={q.question}
                    onChange={(e) => updateQuestion(i, { question: e.target.value })}
                    className="w-full bg-[#17344F]/60 text-xs p-2 rounded-lg border border-white/10 text-white"
                  />
                  {q.kind === "choice" && (
                    <div className="space-y-1">
                      {(q.options || []).map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${i}`}
                            checked={!!o.is_correct}
                            onChange={() => updateChoiceOption(i, oi, o.text, true)}
                          />
                          <input
                            value={o.text}
                            onChange={(e) => updateChoiceOption(i, oi, e.target.value)}
                            className="flex-1 bg-[#17344F]/60 text-xs p-1.5 rounded border border-white/10 text-white"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {q.kind === "text" && (
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">Эталонный ответ (используется ИИ для проверки, кандидат его не видит):</div>
                      <textarea
                        rows={3} value={q.expected_answer || ""}
                        onChange={(e) => updateQuestion(i, { expected_answer: e.target.value })}
                        className="w-full bg-[#17344F]/60 text-xs p-2 rounded-lg border border-[#E7C768]/30 text-white"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button"
                disabled={test.questions.length >= MAX_QUESTIONS}
                onClick={() => setTest(t => ({
                  ...t,
                  questions: [...t.questions, {
                    id: `q${Date.now()}`, kind: "choice", question: "",
                    options: [{ text: "", is_correct: true }, { text: "" }, { text: "" }, { text: "" }],
                    correct: "", points: 5,
                  }],
                }))}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center gap-1 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Вопрос с вариантами
              </button>
              <button type="button"
                disabled={test.questions.length >= MAX_QUESTIONS}
                onClick={() => setTest(t => ({
                  ...t,
                  questions: [...t.questions, {
                    id: `q${Date.now()}`, kind: "text", question: "", expected_answer: "", points: 5,
                  }],
                }))}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white flex items-center gap-1 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Текстовый вопрос
              </button>
              {test.questions.length >= MAX_QUESTIONS && (
                <span className="text-[10px] text-amber-300 self-center">Достигнут лимит {MAX_QUESTIONS} вопросов.</span>
              )}
            </div>

            {test.questions.length > 0 && (
              <div className="space-y-1.5">
                <button type="button" onClick={saveTest} disabled={saving}
                  className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  {saving
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Сохраняем в базу данных…</>
                    : <><Save className="w-4 h-4" /> Сохранить тест</>}
                </button>
                {savedFlashTest && !saving && (
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300 animate-fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Тест сохранён в базе данных
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-100 leading-relaxed">
            ℹ️ Кандидат увидит этап «{STAGES.find(s => s.key === stage)?.title}» в кабинете. Тест можно перепроходить неограниченно — пока не наберёт {test.pass_score} баллов. Следующий этап откроется только после сдачи текущего.
          </div>
          </>)}
        </>
      )}
    </div>
  );
}