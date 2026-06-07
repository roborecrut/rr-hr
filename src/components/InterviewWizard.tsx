import { useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Save, Plus, Trash2, Wand2, FileText, ArrowLeft, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import type { JobProject } from "../types";

type Kind = "resume" | "checklist" | "situations";
type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;

type ChecklistQ = {
  id: string; kind: "choice" | "text"; question: string;
  options?: string[] | null; correct?: string | null; expected_answer?: string | null; explanation?: string;
};
type Situation = { id: string; title: string; brief: string; criteria: string };

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

const KINDS: { key: Kind; title: string; hint: string }[] = [
  { key: "resume",     title: "1. Резюме",    hint: "Важные критерии для скрининга" },
  { key: "checklist",  title: "2. Чек-лист",  hint: "20 вопросов: 10 выбор + 10 текст" },
  { key: "situations", title: "3. Ситуации",  hint: "3 ролевые ситуации" },
];

const WISH_PLACEHOLDER: Record<Kind, string> = {
  resume:     "Например: «Обязательно опыт от 2 лет в B2B-продажах», «Кандидаты только из РФ», «Игнорировать резюме без релевантного опыта в FMCG».",
  checklist:  "Например: «Больше вопросов про CRM Bitrix24», «Добавь 3 каверзных вопроса с НЕ», «Включи проверку знания скриптов холодных звонков».",
  situations: "Например: «Ситуация со сложным клиентом, требующим скидку 30%», «Ситуация эскалации жалобы», «Кейс срыва сделки в последний момент».",
};
const WISH_EXAMPLE: Record<Kind, string> = {
  resume:     "Что писать: 1) обязательные/желательные навыки и опыт; 2) красные флаги (что отсеивает кандидата сразу); 3) на что обратить особое внимание в этой конкретной вакансии (отрасль, продукт, локация).",
  checklist:  "Что писать: 1) акцент на конкретные технологии/продукты, которые надо проверить; 2) формат вопросов (каверзные, кейсы, термины); 3) что НЕ должно быть в вопросах (исключаемые темы).",
  situations: "Что писать: 1) тип конфликтных ситуаций, характерных для вашей компании; 2) стиль поведения «контрагента» (агрессивный/мягкий клиент); 3) на какие компетенции делать упор (эмпатия, аргументация, навыки переговоров).",
};

const FN_URL = (fn: string) => `https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/${fn}`;

export default function InterviewWizard({ projects, refreshProjects, addAuditEvent, initialProjectId, createMode, onBack }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const lockedProject = !!initialProjectId && !createMode;
  const [kind, setKind] = useState<Kind>("resume");
  const [resumeMd, setResumeMd] = useState("");
  const [checklist, setChecklist] = useState<ChecklistQ[]>([]);
  const [checklistShuffle, setChecklistShuffle] = useState(true);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [passScore, setPassScore] = useState(75);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<null | Kind | "pass">(null);
  const [savedFlash, setSavedFlash] = useState<null | Kind | "pass">(null);
  const [wishes, setWishes] = useState<Record<Kind, string>>({ resume: "", checklist: "", situations: "" });
  const [showExample, setShowExample] = useState<Record<Kind, boolean>>({ resume: false, checklist: false, situations: false });
  const [existingSystems, setExistingSystems] = useState<Set<string>>(new Set());

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

  // Don't auto-pick a project in list/create flow — the user must choose explicitly
  // when creating, and the picker is locked when editing.
  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    if (!createMode) return;
    (async () => {
      const ids = projects.map(p => p.id);
      if (!ids.length) return;
      const { data } = await (supabase as any).from("interview_blocks").select("project_id").in("project_id", ids);
      const set = new Set<string>();
      (data || []).forEach((r: any) => set.add(r.project_id));
      setExistingSystems(set);
    })();
  }, [createMode, projects]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: blocks }, { data: pr }] = await Promise.all([
        (supabase as any).from("interview_blocks").select("*").eq("project_id", projectId),
        (supabase as any).from("projects").select("interview_pass_score,role_name").eq("id", projectId).maybeSingle(),
      ]);
      setPassScore(((pr as any)?.interview_pass_score) ?? 75);
      const map: any = {};
      (blocks || []).forEach((b: any) => map[b.kind] = b.payload || {});
      setResumeMd(String(map.resume?.criteria_md || ""));
      setChecklist(Array.isArray(map.checklist?.questions) ? map.checklist.questions : []);
      setChecklistShuffle(map.checklist?.shuffle !== false);
      setSituations(Array.isArray(map.situations?.situations) ? map.situations.situations : []);
    })();
  }, [projectId]);

  const callEdge = async (fn: string, body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(FN_URL(fn), {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) throw new Error(j?.error || `HTTP ${res.status}`);
    return j;
  };

  const flash = (key: Kind | "pass") => {
    setSavedFlash(key);
    setTimeout(() => setSavedFlash(s => (s === key ? null : s)), 2200);
  };

  const saveBlock = async (k: Kind, payload: any) => {
    if (!projectId) return;
    setSaving(k);
    try {
      const { data: existing } = await (supabase as any).from("interview_blocks").select("id").eq("project_id", projectId).eq("kind", k).maybeSingle();
      if (existing?.id) {
        await (supabase as any).from("interview_blocks").update({ payload }).eq("id", existing.id);
      } else {
        await (supabase as any).from("interview_blocks").insert({ project_id: projectId, kind: k, payload });
      }
      addAuditEvent("success", "Сохранено в БД", `Блок интервью (${k}) сохранён`);
      flash(k);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка", e?.message || "save failed");
    } finally { setSaving(null); }
  };

  const savePassScore = async () => {
    if (!projectId) return;
    setSaving("pass");
    try {
      await (supabase as any).from("projects").update({ interview_pass_score: passScore }).eq("id", projectId);
      addAuditEvent("success", "Сохранено в БД", `Проходной балл интервью: ${passScore}`);
      flash("pass");
    } finally { setSaving(null); }
  };

  const generate = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      if (kind === "resume") {
        const r = await aiWaitRun({
          title: "Генерация критериев резюме",
          task: () => callEdge("ai-generate-interview-resume-criteria", { project_id: projectId, wishes: wishes.resume || undefined }),
        });
        if (!r) return;
        setResumeMd(r.criteria_md || "");
      } else if (kind === "checklist") {
        const r = await aiWaitRun({
          title: "Генерация чек-листа интервью",
          task: () => callEdge("ai-generate-interview-checklist", { project_id: projectId, wishes: wishes.checklist || undefined }),
        });
        if (!r) return;
        const { data } = await (supabase as any).from("interview_blocks").select("payload").eq("project_id", projectId).eq("kind","checklist").maybeSingle();
        setChecklist((data as any)?.payload?.questions || []);
      } else {
        const r = await aiWaitRun({
          title: "Генерация ролевых ситуаций",
          task: () => callEdge("ai-generate-interview-situations", { project_id: projectId, wishes: wishes.situations || undefined }),
        });
        if (!r) return;
        const { data } = await (supabase as any).from("interview_blocks").select("payload").eq("project_id", projectId).eq("kind","situations").maybeSingle();
        setSituations((data as any)?.payload?.situations || []);
      }
      addAuditEvent("success", "ИИ сгенерировал", `${kind}`);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка ИИ", e?.message || "failed");
    } finally { setBusy(false); }
  };

  const fillFromTemplate = async () => {
    if (!project?.roleName) return;
    const { data } = await supabase.rpc("job_title_get_interview_template" as any, { _title: project.roleName });
    const tpl: any = data || {};
    const rc = typeof tpl.resume_criteria === "string"
      ? tpl.resume_criteria
      : (typeof tpl.resume_criteria?.criteria_md === "string" ? tpl.resume_criteria.criteria_md : "");
    const chk = Array.isArray(tpl.checklist) ? tpl.checklist
      : Array.isArray(tpl.checklist?.questions) ? tpl.checklist.questions : null;
    const sit = Array.isArray(tpl.situations) ? tpl.situations
      : Array.isArray(tpl.situations?.situations) ? tpl.situations.situations : null;
    if (rc) { setResumeMd(rc); await saveBlock("resume", { criteria_md: rc }); }
    if (chk) { setChecklist(chk); await saveBlock("checklist", { questions: chk }); }
    if (sit) { setSituations(sit); await saveBlock("situations", { situations: sit }); }
    addAuditEvent("success", "Шаблон применён", `${project.roleName}`);
  };

  return (
    <div className="space-y-5">
      {onBack && (
        <button type="button" onClick={onBack}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> К списку систем интервью
        </button>
      )}
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E7C768]/20 flex items-center justify-center text-[#E7C768]">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-bold text-white">
              {createMode ? "Создание системы интервью" : "Редактор системы интервью"}
            </h2>
            <p className="text-xs text-slate-300">3 этапа: Резюме → Чек-лист → Ситуации. ИИ генерирует, вы редактируете.</p>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
              Вакансия{createMode ? " (обязательно)" : ""}
            </label>
            <select value={projectId} disabled={lockedProject} onChange={e => setProjectId(e.target.value)}
              className="bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-70 min-w-[260px]">
              <option value="">— выберите вакансию —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.roleName || "(без названия)"} · {p.companyName || ""}
                  {createMode && existingSystems.has(p.id) ? " · уже есть система" : ""}
                </option>
              ))}
            </select>
            {createMode && projectId && existingSystems.has(projectId) && (
              <p className="text-[11px] text-amber-300 mt-1.5">
                ⚠️ Для этой вакансии уже создана система интервью. Сохранение перезапишет существующие блоки.
              </p>
            )}
          </div>
        </div>
      </div>

      {projectId && (
        <>
          <div className="bg-[#17344F]/60 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div>
              <div className="text-[10px] uppercase text-slate-400 font-bold">Проходной средний балл (по 3 этапам)</div>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={1} max={100} value={passScore} onChange={e => setPassScore(Math.max(1, Math.min(100, Number(e.target.value) || 75)))} className="bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm w-24" />
                <button onClick={savePassScore} disabled={saving === "pass"} className="bg-[#E7C768]/20 hover:bg-[#E7C768]/30 border border-[#E7C768]/40 text-[#E7C768] font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-60">
                  {saving === "pass"
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем…</>
                    : <><Save className="w-3.5 h-3.5"/> Сохранить</>}
                </button>
                {savedFlash === "pass" && saving !== "pass" && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                    <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto">
              <button onClick={fillFromTemplate} className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1">
                <FileText className="w-3.5 h-3.5"/>Заполнить из шаблона должности
              </button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {KINDS.map(k => (
              <button key={k.key} onClick={() => setKind(k.key)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${kind === k.key ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>
                {k.title} <span className="opacity-70 font-normal text-[10px] block">{k.hint}</span>
              </button>
            ))}
          </div>

          <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#E7C768]">{KINDS.find(k => k.key === kind)?.title}</h3>
              <button onClick={generate} disabled={busy} className="bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/40 text-[#E7C768] font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-60">
                {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Wand2 className="w-3.5 h-3.5"/>} Сгенерировать ИИ
              </button>
            </div>

            {/* Wishes textarea + example tip — same for every block, content varies */}
            <div className="bg-[#0F2A42]/60 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-200 font-bold">
                  Пожелания к блоку «{KINDS.find(k => k.key === kind)?.title.replace(/^\d+\.\s*/, "")}» (передаются ИИ)
                </label>
                <button type="button" onClick={() => setShowExample(s => ({ ...s, [kind]: !s[kind] }))}
                  className="text-[10px] text-[#E7C768] hover:underline flex items-center gap-1">
                  <Info className="w-3 h-3" /> {showExample[kind] ? "Скрыть пример" : "Показать пример"}
                </button>
              </div>
              {showExample[kind] && (
                <div className="text-[11px] text-slate-300 bg-black/30 border border-[#E7C768]/30 rounded-lg p-2 leading-relaxed">
                  {WISH_EXAMPLE[kind]}
                </div>
              )}
              <textarea rows={3} maxLength={1000}
                value={wishes[kind]}
                onChange={e => setWishes(w => ({ ...w, [kind]: e.target.value }))}
                placeholder={WISH_PLACEHOLDER[kind]}
                className="w-full bg-[#17344F]/60 text-xs p-2.5 rounded-lg border border-white/10 text-white focus:outline-[#E7C768]" />
              <div className="text-[10px] text-slate-500 text-right">{wishes[kind].length}/1000 — учитывается при «Сгенерировать ИИ»</div>
            </div>

            {busy && <LoadingPhrase entity="interview" />}

            {kind === "resume" && (
              <div className="space-y-2">
                <textarea value={resumeMd} onChange={e => setResumeMd(e.target.value)} rows={14} maxLength={10000}
                  placeholder="Markdown: важные критерии для оценки резюме..."
                  className="w-full bg-black/30 text-white border border-white/10 rounded-xl px-3 py-2 text-sm font-mono" />
                <div className="flex justify-end items-center gap-2">
                  {savedFlash === "resume" && saving !== "resume" && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                      <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                    </span>
                  )}
                  <button onClick={() => saveBlock("resume", { criteria_md: resumeMd })} disabled={saving === "resume"}
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
                    {saving === "resume"
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем в БД…</>
                      : <><Save className="w-3.5 h-3.5"/> Сохранить в БД</>}
                  </button>
                </div>
              </div>
            )}

            {kind === "checklist" && (
              <div className="space-y-3">
                <div className="text-[10px] text-slate-400 font-bold">Вопросов: {checklist.length}/30</div>
                <label className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={checklistShuffle}
                    onChange={e => setChecklistShuffle(e.target.checked)}
                    className="accent-[#E7C768] w-4 h-4" />
                  <span className="text-[11px] text-slate-200 font-bold">Случайный порядок вопросов и вариантов ответа</span>
                  <span className="text-[10px] text-slate-500 ml-auto">При повторной сдаче — новый порядок.</span>
                </label>
                {checklist.length === 0 && <p className="text-xs text-slate-400">Нет вопросов. Нажмите «Сгенерировать ИИ» или добавьте вручную.</p>}
                {checklist.map((q, i) => (
                  <div key={q.id || i} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 font-bold">
                      <span>#{i+1} · {q.kind === "choice" ? "Выбор" : "Текст"}</span>
                      <button onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3"/></button>
                    </div>
                    <textarea value={q.question} onChange={e => { const c = [...checklist]; c[i] = { ...q, question: e.target.value }; setChecklist(c); }} rows={2} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm" />
                    {q.kind === "choice" && (
                      <div className="space-y-1">
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input type="radio" checked={q.correct === opt} onChange={() => { const c = [...checklist]; c[i] = { ...q, correct: opt }; setChecklist(c); }} />
                            <input value={opt} onChange={e => { const c = [...checklist]; const opts = [...(q.options || [])]; opts[oi] = e.target.value; c[i] = { ...q, options: opts, correct: q.correct === opt ? e.target.value : q.correct }; setChecklist(c); }} className="flex-1 bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.kind === "text" && (
                      <textarea value={q.expected_answer || ""} onChange={e => { const c = [...checklist]; c[i] = { ...q, expected_answer: e.target.value }; setChecklist(c); }} rows={2} placeholder="Эталонный ответ" className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <button disabled={checklist.length >= 30} onClick={() => setChecklist([...checklist, { id: `q${Date.now()}`, kind: "choice", question: "", options: ["","","",""], correct: "" }])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"><Plus className="w-3 h-3"/>С вариантами</button>
                  <button disabled={checklist.length >= 30} onClick={() => setChecklist([...checklist, { id: `q${Date.now()}`, kind: "text", question: "", expected_answer: "" }])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"><Plus className="w-3 h-3"/>Текстовый</button>
                  <div className="ml-auto flex items-center gap-2">
                    {savedFlash === "checklist" && saving !== "checklist" && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                        <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                      </span>
                    )}
                    <button onClick={() => saveBlock("checklist", { questions: checklist, shuffle: checklistShuffle })} disabled={saving === "checklist"}
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
                      {saving === "checklist"
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем в БД…</>
                        : <><Save className="w-3.5 h-3.5"/> Сохранить в БД</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {kind === "situations" && (
              <div className="space-y-3">
                {situations.length === 0 && <p className="text-xs text-slate-400">Нет ситуаций. Сгенерируйте или добавьте.</p>}
                {situations.map((s, i) => (
                  <div key={s.id || i} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 font-bold">
                      <span>Ситуация #{i+1}</span>
                      <button onClick={() => setSituations(situations.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3"/></button>
                    </div>
                    <input value={s.title} placeholder="Тема" onChange={e => { const c = [...situations]; c[i] = { ...s, title: e.target.value }; setSituations(c); }} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm font-bold"/>
                    <textarea value={s.brief} placeholder="Описание ситуации для кандидата" rows={3} onChange={e => { const c = [...situations]; c[i] = { ...s, brief: e.target.value }; setSituations(c); }} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                    <textarea value={s.criteria} placeholder="Критерии хорошего ответа (для ИИ)" rows={2} onChange={e => { const c = [...situations]; c[i] = { ...s, criteria: e.target.value }; setSituations(c); }} className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-xs"/>
                  </div>
                ))}
                <div className="flex gap-2">
                  {situations.length < 3 && <button onClick={() => setSituations([...situations, { id: `s${situations.length+1}`, title: "", brief: "", criteria: "" }])} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1"><Plus className="w-3 h-3"/>Ситуация</button>}
                  <div className="ml-auto flex items-center gap-2">
                    {savedFlash === "situations" && saving !== "situations" && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-300 animate-fade-in">
                        <CheckCircle2 className="w-3 h-3" /> Сохранено в БД
                      </span>
                    )}
                    <button onClick={() => saveBlock("situations", { situations })} disabled={saving === "situations"}
                      className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:opacity-90 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
                      {saving === "situations"
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Сохраняем в БД…</>
                        : <><Save className="w-3.5 h-3.5"/> Сохранить в БД</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}