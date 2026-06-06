import { useEffect, useMemo, useState } from "react";
import { GraduationCap, RefreshCw, Sparkles, BookOpen, FileQuestion, Eye, Pencil } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { DocumentIngestField } from "@/components/DocumentIngestField";
import type { JobProject } from "../types";

type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;
type Stage = "professional" | "product" | "system";

interface Props {
  projects: JobProject[];
  refreshProjects: () => Promise<void> | void;
  addAuditEvent: AuditFn;
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
type TestRow = { id?: string; questions: QuestionRow[]; pass_score: number; total_score: number };

export default function TrainingWizard({ projects, refreshProjects, addAuditEvent }: Props) {
  const [projectId, setProjectId] = useState<string>("");
  const [stage, setStage] = useState<Stage>("professional");
  const [block, setBlock] = useState<BlockRow | null>(null);
  const [materials, setMaterials] = useState<string>("");
  const [test, setTest] = useState<TestRow>({ questions: [], pass_score: 70, total_score: 100 });
  const [source, setSource] = useState<string>("");
  const [busyMaterial, setBusyMaterial] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMd, setPreviewMd] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("project");
    if (q && projects.some(p => p.id === q)) setProjectId(q);
  }, [projects]);

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

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
      });
    })();
    return () => { cancelled = true; };
  }, [project?.id, stage]);

  const callEdge = async <T,>(fn: string, body: any): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as any)?.error || `http_${res.status}`);
    return json as T;
  };

  const generateMaterial = async () => {
    if (!project) return;
    setBusyMaterial(true);
    try {
      const r = await callEdge<{ text: string }>("ai-generate-stage-material", {
        project_id: project.id, stage, source_text: source || undefined,
      });
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
      const r = await callEdge<{ count: number; total_score: number }>("ai-generate-stage-test", {
        project_id: project.id, stage,
      });
      // reload test
      const { data: t } = await supabase.from("training_stage_tests")
        .select("*").eq("project_id", project.id).eq("stage", stage).maybeSingle();
      setTest({
        id: (t as any)?.id,
        questions: ((t as any)?.questions as QuestionRow[]) || [],
        pass_score: (t as any)?.pass_score || 70,
        total_score: (t as any)?.total_score || 100,
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
      if (!silent) addAuditEvent("success", "Материалы сохранены", `Этап: ${stage}`);
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
        await supabase.from("training_stage_tests").update({
          questions: test.questions, pass_score: test.pass_score, total_score: total,
        }).eq("id", test.id);
      } else {
        const { data, error } = await supabase.from("training_stage_tests").insert({
          project_id: project.id, stage,
          questions: test.questions, pass_score: test.pass_score, total_score: total,
        }).select("*").single();
        if (error) throw error;
        setTest(t => ({ ...t, id: (data as any).id, total_score: total }));
      }
      addAuditEvent("success", "Тест сохранён", `${test.questions.length} вопросов`);
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
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E7C768]/15 flex items-center justify-center text-[#E7C768]">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-xl font-bold text-white">Мастер Обучения</h2>
            <p className="text-xs text-slate-300">
              3 последовательных этапа. Кандидат проходит этапы по порядку, тест каждого можно перепроходить <strong>неограниченно</strong> до достижения проходного балла.
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
        <>
          {/* Stage tabs */}
          <div className="grid grid-cols-3 gap-2">
            {STAGES.map(s => (
              <button key={s.key} type="button" onClick={() => setStage(s.key)}
                className={`p-3 rounded-2xl text-left border transition ${stage === s.key
                  ? "bg-[#E7C768] text-[#1D3E5E] border-[#E7C768]"
                  : "bg-[#1D3E5E]/60 text-white border-white/10 hover:border-[#E7C768]/40"}`}>
                <div className="text-xs font-bold">{s.title}</div>
                <div className="text-[10px] opacity-80 mt-0.5">{s.hint}</div>
              </button>
            ))}
          </div>

          {/* Materials */}
          <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 space-y-3">
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
              maxLength={10000}
            />

            <button type="button" onClick={generateMaterial} disabled={busyMaterial}
              className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busyMaterial ? <><RefreshCw className="w-4 h-4 animate-spin" /> Генерируем…</> : <><Sparkles className="w-4 h-4" /> Оформить материал ИИ</>}
            </button>
            {busyMaterial && <LoadingPhrase entity="training" />}

            {previewMd ? (
              <div className="bg-[#0F2A42]/80 border border-white/10 rounded-xl p-4 prose prose-invert prose-sm max-w-none min-h-[200px]">
                <Markdown remarkPlugins={[remarkGfm]}>{materials || "_Пусто_"}</Markdown>
              </div>
            ) : (
              <textarea
                rows={14}
                maxLength={10000}
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                placeholder="Markdown учебного материала (до 10 000 символов)…"
                className="w-full bg-[#17344F]/60 text-xs p-3 rounded-xl border border-white/10 font-mono focus:outline-[#E7C768]"
              />
            )}
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{materials.length}/10000 символов</span>
              <button type="button" onClick={() => saveMaterials(false)} disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 disabled:opacity-50">
                Сохранить материал
              </button>
            </div>
          </div>

          {/* Test */}
          <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <FileQuestion className="w-4 h-4 text-[#E7C768]" /> Тест по этапу ({test.questions.length} вопр., проходной {test.pass_score}/{test.total_score || 100})
              </div>
              <button type="button" onClick={generateTest} disabled={busyTest || !materials}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#E7C768] text-[#1D3E5E] font-bold flex items-center gap-1 disabled:opacity-40">
                {busyTest ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Сгенерировать тест ИИ
              </button>
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

            {test.questions.length > 0 && (
              <button type="button" onClick={saveTest} disabled={saving}
                className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null} Сохранить тест
              </button>
            )}
          </div>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-100 leading-relaxed">
            ℹ️ Кандидат увидит этап «{STAGES.find(s => s.key === stage)?.title}» в кабинете. Тест можно перепроходить неограниченно — пока не наберёт {test.pass_score} баллов. Следующий этап откроется только после сдачи текущего.
          </div>
        </>
      )}
    </div>
  );
}