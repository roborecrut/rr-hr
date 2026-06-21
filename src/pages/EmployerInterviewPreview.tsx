/**
 * §5 — Бесплатное демо интервью для работодателя.
 *
 * Грузит сохранённые блоки интервью по `projectId` (resume criteria_md,
 * checklist, situations) и проигрывает их полностью на клиенте. Все ответы и
 * результаты хранятся в localStorage — никаких списаний с RR-баланса,
 * никаких записей в `candidates` / `candidate_scores`, никакой регистрации.
 *
 * Цель — дать работодателю прогнать вакансию глазами кандидата, увидеть
 * автоматическую оценку чек-листа и подобрать проходной балл.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle2, FileText, ListChecks, MessageSquare, Award, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import RichMarkdown from "@/components/RichMarkdown";

type ChecklistQ = {
  id: string;
  kind: "choice" | "text";
  question: string;
  options?: string[] | null;
  correct?: string | null;
};
type Situation = { id: string; title: string; brief: string; criteria?: string };
type Stage = "resume" | "checklist" | "situations" | "done";

type Saved = {
  stage: Stage;
  resumeText: string;
  resumeSelfScore: number;
  checklistAnswers: Record<string, string>;
  checklistSelfText: Record<string, number>; // self-rated 0..100 for text Qs
  situationsAnswers: Record<string, string>;
  situationsSelf: Record<string, number>;
};

function emptyState(): Saved {
  return {
    stage: "resume",
    resumeText: "",
    resumeSelfScore: 75,
    checklistAnswers: {},
    checklistSelfText: {},
    situationsAnswers: {},
    situationsSelf: {},
  };
}

function lsKey(projectId: string) { return `emp_preview:${projectId}`; }

function loadSaved(projectId: string): Saved {
  try {
    const raw = localStorage.getItem(lsKey(projectId));
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch { return emptyState(); }
}
function saveSaved(projectId: string, s: Saved) {
  try { localStorage.setItem(lsKey(projectId), JSON.stringify(s)); } catch {}
}

export default function EmployerInterviewPreview() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [passScore, setPassScore] = useState(75);
  const [resumeMd, setResumeMd] = useState("");
  const [checklist, setChecklist] = useState<ChecklistQ[]>([]);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [s, setS] = useState<Saved>(() => loadSaved(projectId));

  useEffect(() => { setS(loadSaved(projectId)); }, [projectId]);
  useEffect(() => { if (projectId) saveSaved(projectId, s); }, [s, projectId]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [{ data: blocks }, { data: pr }] = await Promise.all([
        (supabase as any).from("interview_blocks").select("kind,payload").eq("project_id", projectId),
        (supabase as any).from("projects").select("role_name,interview_pass_score").eq("id", projectId).maybeSingle(),
      ]);
      setProjectName(String((pr as any)?.role_name || ""));
      setPassScore(Number((pr as any)?.interview_pass_score ?? 75));
      const map: any = {};
      (blocks || []).forEach((b: any) => map[b.kind] = b.payload || {});
      setResumeMd(String(map.resume?.criteria_md || ""));
      setChecklist(Array.isArray(map.checklist?.questions) ? map.checklist.questions : []);
      setSituations(Array.isArray(map.situations?.situations) ? map.situations.situations : []);
      setLoading(false);
    })();
  }, [projectId]);

  /** Авто-оценка чек-листа: choice по совпадению с `correct`,
   *  текстовые вопросы — пользовательская самооценка 0..100. */
  const checklistScore = useMemo(() => {
    if (!checklist.length) return 0;
    let total = 0, max = 0;
    for (const q of checklist) {
      max += 100;
      if (q.kind === "choice") {
        const ans = s.checklistAnswers[q.id];
        if (ans && q.correct && String(ans).trim() === String(q.correct).trim()) total += 100;
      } else {
        const self = Number(s.checklistSelfText[q.id] ?? 0);
        total += Math.max(0, Math.min(100, self));
      }
    }
    return max > 0 ? Math.round((total / max) * 100) : 0;
  }, [checklist, s.checklistAnswers, s.checklistSelfText]);

  const situationsScore = useMemo(() => {
    if (!situations.length) return 0;
    const vals = situations.map(x => Math.max(0, Math.min(100, Number(s.situationsSelf[x.id] ?? 0))));
    return Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length));
  }, [situations, s.situationsSelf]);

  const overall = useMemo(() => {
    const a = Number(s.resumeSelfScore || 0);
    const b = checklistScore;
    const c = situationsScore;
    return Math.round((a + b + c) / 3);
  }, [s.resumeSelfScore, checklistScore, situationsScore]);

  const resetStage = (stage: Stage) => {
    setS(prev => {
      const next = { ...prev };
      if (stage === "resume") { next.resumeText = ""; next.resumeSelfScore = 75; }
      if (stage === "checklist") { next.checklistAnswers = {}; next.checklistSelfText = {}; }
      if (stage === "situations") { next.situationsAnswers = {}; next.situationsSelf = {}; }
      next.stage = stage;
      return next;
    });
  };

  const goto = (stage: Stage) => setS(prev => ({ ...prev, stage }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#17344F] to-[#265582] text-white">
        <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin"/>Загружаем вакансию…</div>
      </div>
    );
  }

  if (!resumeMd && !checklist.length && !situations.length) {
    return (
      <div className="min-h-screen brand-editor p-6 text-white">
        <Link to="/employer" className="inline-flex items-center gap-1 text-[#E7C768] hover:underline text-sm">
          <ArrowLeft className="w-4 h-4"/> К панели работодателя
        </Link>
        <div className="mt-6 max-w-xl mx-auto bg-[#17344F]/60 border border-[#E7C768]/40 rounded-2xl p-6">
          <h1 className="text-lg font-bold text-[#E7C768] mb-2">Интервью ещё не настроено</h1>
          <p className="text-sm text-slate-200">Сначала сгенерируйте блоки интервью (резюме, чек-лист, ситуации) в редакторе вакансии.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen brand-editor p-6 text-white">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/employer" className="inline-flex items-center gap-1 text-[#E7C768] hover:underline text-sm">
            <ArrowLeft className="w-4 h-4"/> К панели работодателя
          </Link>
          <span className="text-[10px] uppercase tracking-wider font-bold text-[#E7C768] bg-[#E7C768]/10 border border-[#E7C768]/40 rounded-full px-3 py-1">
            Демо для работодателя · без списаний
          </span>
        </div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-[#E7C768] to-amber-200 bg-clip-text text-transparent">
          {projectName || "Вакансия"}
        </h1>
        <p className="text-xs text-slate-300">
          Все ответы сохраняются только в этом браузере. Результаты помогут вам подобрать проходной балл (сейчас: <b>{passScore}</b>).
        </p>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {([
            { k: "resume",     label: "1. Резюме",   Icon: FileText     },
            { k: "checklist",  label: "2. Чек-лист", Icon: ListChecks   },
            { k: "situations", label: "3. Ситуации", Icon: MessageSquare},
            { k: "done",       label: "Итог",        Icon: Award        },
          ] as { k: Stage; label: string; Icon: any }[]).map(({ k, label, Icon }) => (
            <button key={k} onClick={() => goto(k)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1 ${
                s.stage === k ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]"
                              : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>
              <Icon className="w-3.5 h-3.5"/>{label}
            </button>
          ))}
        </div>

        {s.stage === "resume" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#E7C768]">Этап 1 · Скрининг резюме</h2>
              <button onClick={() => resetStage("resume")} className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3"/>Сбросить
              </button>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Критерии для ИИ</div>
            <div className="bg-black/30 border border-white/10 rounded-xl p-3 max-h-64 overflow-y-auto">
              <RichMarkdown>{resumeMd || "_не задано_"}</RichMarkdown>
            </div>
            <label className="block">
              <span className="text-[11px] text-slate-300 font-bold">Текст резюме (любой, для демо)</span>
              <textarea value={s.resumeText} onChange={e => setS(p => ({ ...p, resumeText: e.target.value }))}
                rows={6} className="mt-1 w-full bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm"/>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-300 font-bold">Самооценка соответствия 0–100 (вместо ИИ-оценки)</span>
              <input type="number" min={0} max={100} value={s.resumeSelfScore}
                onChange={e => setS(p => ({ ...p, resumeSelfScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                className="mt-1 w-32 bg-black/30 text-white border border-white/10 rounded-lg px-3 py-2 text-sm"/>
            </label>
            <button onClick={() => goto("checklist")} className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg">
              Дальше → Чек-лист
            </button>
          </div>
        )}

        {s.stage === "checklist" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#E7C768]">Этап 2 · Чек-лист</h2>
              <button onClick={() => resetStage("checklist")} className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3"/>Сбросить
              </button>
            </div>
            {checklist.length === 0 && <p className="text-sm text-slate-300">Чек-лист пуст.</p>}
            <ol className="space-y-3 list-decimal pl-5">
              {checklist.map(q => (
                <li key={q.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-white">{q.question}</div>
                  {q.kind === "choice" && Array.isArray(q.options) ? (
                    <div className="space-y-1">
                      {q.options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-[12px] text-slate-200">
                          <input type="radio" name={`q-${q.id}`} checked={s.checklistAnswers[q.id] === opt}
                            onChange={() => setS(p => ({ ...p, checklistAnswers: { ...p.checklistAnswers, [q.id]: opt } }))}/>
                          {opt}
                        </label>
                      ))}
                      {s.checklistAnswers[q.id] && q.correct && (
                        <div className={`text-[11px] font-bold ${String(s.checklistAnswers[q.id]).trim() === String(q.correct).trim() ? "text-emerald-300" : "text-rose-300"}`}>
                          {String(s.checklistAnswers[q.id]).trim() === String(q.correct).trim() ? "✓ Верно" : `✗ Верный ответ: ${q.correct}`}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <textarea rows={2} value={s.checklistAnswers[q.id] || ""}
                        onChange={e => setS(p => ({ ...p, checklistAnswers: { ...p.checklistAnswers, [q.id]: e.target.value } }))}
                        className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs"/>
                      <label className="text-[11px] text-slate-400 inline-flex items-center gap-2">
                        Самооценка 0–100:
                        <input type="number" min={0} max={100} value={Number(s.checklistSelfText[q.id] ?? 0)}
                          onChange={e => setS(p => ({ ...p, checklistSelfText: { ...p.checklistSelfText, [q.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))}
                          className="w-20 bg-black/40 text-white border border-white/10 rounded px-2 py-0.5"/>
                      </label>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-300">Текущий балл: <b className="text-[#E7C768]">{checklistScore}</b> / 100</div>
              <button onClick={() => goto("situations")} className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg">
                Дальше → Ситуации
              </button>
            </div>
          </div>
        )}

        {s.stage === "situations" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#E7C768]">Этап 3 · Ситуации</h2>
              <button onClick={() => resetStage("situations")} className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3"/>Сбросить
              </button>
            </div>
            {situations.length === 0 && <p className="text-sm text-slate-300">Ситуации не заданы.</p>}
            <div className="space-y-3">
              {situations.map(sit => (
                <div key={sit.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm font-bold text-[#E7C768]">{sit.title}</div>
                  <div className="text-xs text-slate-300 whitespace-pre-line">{sit.brief}</div>
                  {sit.criteria && (
                    <div className="text-[11px] text-slate-400"><b>Критерии:</b> {sit.criteria}</div>
                  )}
                  <textarea rows={3} value={s.situationsAnswers[sit.id] || ""}
                    onChange={e => setS(p => ({ ...p, situationsAnswers: { ...p.situationsAnswers, [sit.id]: e.target.value } }))}
                    className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs"/>
                  <label className="text-[11px] text-slate-400 inline-flex items-center gap-2">
                    Самооценка 0–100:
                    <input type="number" min={0} max={100} value={Number(s.situationsSelf[sit.id] ?? 0)}
                      onChange={e => setS(p => ({ ...p, situationsSelf: { ...p.situationsSelf, [sit.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))}
                      className="w-20 bg-black/40 text-white border border-white/10 rounded px-2 py-0.5"/>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-300">Балл по ситуациям: <b className="text-[#E7C768]">{situationsScore}</b> / 100</div>
              <button onClick={() => goto("done")} className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg">
                Завершить → Итог
              </button>
            </div>
          </div>
        )}

        {s.stage === "done" && (
          <div className="bg-[#1E4468]/60 border border-[#E7C768]/40 rounded-2xl p-5 space-y-3">
            <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-2"><Award className="w-5 h-5"/>Итог демо-интервью</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Резюме",   v: Number(s.resumeSelfScore || 0) },
                { label: "Чек-лист", v: checklistScore },
                { label: "Ситуации", v: situationsScore },
              ].map(x => (
                <div key={x.label} className="bg-black/30 border border-white/10 rounded-xl p-3">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">{x.label}</div>
                  <div className="text-xl font-bold text-white">{x.v}</div>
                </div>
              ))}
            </div>
            <div className="bg-black/30 border border-[#E7C768]/40 rounded-xl p-4 text-center">
              <div className="text-[11px] uppercase text-slate-400 font-bold">Средний балл</div>
              <div className="text-3xl font-bold text-[#E7C768]">{overall}</div>
              <div className={`text-xs font-bold mt-1 ${overall >= passScore ? "text-emerald-300" : "text-rose-300"}`}>
                {overall >= passScore ? `✓ Проходит порог ${passScore}` : `✗ Ниже порога ${passScore}`}
              </div>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Используйте этот результат, чтобы скорректировать проходной балл в редакторе вакансии. Любой этап можно перепройти,
              нажав «Сбросить» в его карточке — данные хранятся только в этом браузере.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { try { localStorage.removeItem(lsKey(projectId)); } catch {}; setS(emptyState()); }}
                className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3"/>Очистить и пройти заново
              </button>
              <Link to="/employer" className="ml-auto text-xs bg-[#E7C768] text-[#17344F] font-bold px-4 py-2 rounded-lg inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5"/>Готово
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}