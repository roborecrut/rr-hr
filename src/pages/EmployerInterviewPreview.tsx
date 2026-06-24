/**
 * §2 — Бесплатное демо интервью для работодателя.
 *
 * Грузит сохранённые блоки интервью по `projectId` (resume criteria_md,
 * checklist, situations) и проигрывает их полностью на клиенте через
 * ПУБЛИЧНЫЕ demo-функции (`ai-restart`, `ai-demo-screen-resume`,
 * `ai-demo-grade-checklist`, `ai-demo-grade-situations`, `ai-ingest-document`).
 * Никаких списаний с RR-баланса, никаких записей в `candidates` /
 * `candidate_scores`, никакой регистрации.
 *
 * Сценарий шагов синхронен с кабинетом кандидата:
 *  1. Подготовка ИИ (/restart на demo_user_id)
 *  2. Резюме — загрузка файла + распознавание + ИИ-оценка
 *  3. Чек-лист — ИИ-оценка
 *  4. Ситуации — ИИ-оценка
 *  5. Итог — средний балл, сравнение с проходным
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, CheckCircle2, FileText, ListChecks,
  MessageSquare, Award, RotateCcw, Upload, Send, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import RichMarkdown from "@/components/RichMarkdown";
import { useAIWait } from "@/components/AIWaitProvider";
import { aiRestart } from "@/lib/aiClient";
import { getDemoUserId, resetDemoUserId } from "@/lib/demoSession";
import { FN } from "@/config";

type ChecklistQ = {
  id: string;
  kind: "choice" | "text";
  question: string;
  options?: string[] | null;
  correct?: string | null;
};
type Situation = { id: string; title: string; brief: string; criteria?: string };
type Stage = "intro" | "resume" | "checklist" | "situations" | "done";

async function call(fn: string, body: any) {
  const res = await fetch(FN(fn), {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) {
    const raw = String(j?.error || "");
    const code =
      res.status === 504 || /504|gateway|timed?\s*out|protalk_5\d\d/i.test(raw)
        ? "ai_timeout"
        : res.status === 402 ? "no_credits"
        : res.status === 429 ? "ai_temporary"
        : "ai_temporary";
    throw new Error(code);
  }
  return j;
}

export default function EmployerInterviewPreview() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { run: aiWaitRun } = useAIWait();

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [vacancyText, setVacancyText] = useState("");
  const [passScore, setPassScore] = useState(75);
  const [resumeMd, setResumeMd] = useState("");
  const [checklist, setChecklist] = useState<ChecklistQ[]>([]);
  const [situations, setSituations] = useState<Situation[]>([]);

  const [stage, setStage] = useState<Stage>("intro");
  const restartedRef = useRef(false);

  // Resume state
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ bucket: string; path: string; filename: string } | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeResult, setResumeResult] = useState<any>(null);

  // Checklist + situations
  const [checkAnswers, setCheckAnswers] = useState<Record<string, string>>({});
  const [checkResult, setCheckResult] = useState<any>(null);
  const [sitAnswers, setSitAnswers] = useState<Record<string, string>>({});
  const [sitResult, setSitResult] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [{ data: blocks }, { data: pr }] = await Promise.all([
        (supabase as any).from("interview_blocks").select("kind,payload").eq("project_id", projectId),
        (supabase as any).from("projects").select("role_name,vacancy_text,interview_pass_score").eq("id", projectId).maybeSingle(),
      ]);
      setProjectName(String((pr as any)?.role_name || ""));
      setVacancyText(String((pr as any)?.vacancy_text || "").slice(0, 5000));
      setPassScore(Number((pr as any)?.interview_pass_score ?? 75));
      const map: any = {};
      (blocks || []).forEach((b: any) => map[b.kind] = b.payload || {});
      setResumeMd(String(map.resume?.criteria_md || ""));
      setChecklist(Array.isArray(map.checklist?.questions) ? map.checklist.questions : []);
      setSituations(Array.isArray(map.situations?.situations) ? map.situations.situations : []);
      setLoading(false);
    })();
  }, [projectId]);

  const startRestart = async () => {
    if (restartedRef.current) { setStage("resume"); return; }
    const demoUserId = getDemoUserId();
    try {
      await aiWaitRun({
        title: "Подготовка ИИ",
        task: () => aiRestart(undefined, { demo_user_id: demoUserId }).then(() => ({ ok: true })),
      });
    } catch { /* overlay already handled the error */ }
    restartedRef.current = true;
    setStage("resume");
  };

  const onUploadResume = async (f: File) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert("Файл больше 10 МБ"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(FN("demo-upload-resume"), {
        method: "POST",
        headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: form,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setUploadedResume({ bucket: j.bucket, path: j.path, filename: f.name });
    } catch (e: any) {
      alert(e?.message || "Не удалось загрузить резюме");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const recognizeResume = async () => {
    if (!uploadedResume) return;
    setParsing(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание резюме",
        task: () => call("ai-ingest-document", {
          entity: "resume", bucket: uploadedResume.bucket,
          file_path: uploadedResume.path, filename: uploadedResume.filename,
          demo_user_id: getDemoUserId(),
        }),
      });
      if (!r) return;
      const text = String(r?.text || r?.result || r?.data?.text || r?.reply || r?.content || "")
        .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim()
        .slice(0, 20000);
      if (!text.trim()) throw new Error("ИИ не смог распознать резюме");
      setResumeText(text);
      setUploadedResume(null);
    } catch (e: any) {
      alert(e?.message || "Не удалось распознать файл");
      setUploadedResume(null);
    } finally {
      setParsing(false);
    }
  };

  const submitResume = async () => {
    if (!resumeText.trim() || resumeText.trim().length < 50) { alert("Введите резюме (минимум 50 символов)"); return; }
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка резюме",
        task: () => call("ai-demo-screen-resume", {
          title: projectName || "Вакансия",
          vacancy_text: vacancyText,
          criteria_md: resumeMd,
          resume_text: resumeText,
          demo_user_id: getDemoUserId(),
        }),
      });
      if (!r) return;
      setResumeResult(r.result);
      setStage("checklist");
    } catch (e: any) { alert(e?.message || "Ошибка"); }
  };

  const submitChecklist = async () => {
    try {
      const r = await aiWaitRun<any>({
        title: "Проверка чек-листа",
        task: () => call("ai-demo-grade-checklist", {
          title: projectName || "Вакансия",
          questions: checklist,
          answers: checkAnswers,
          demo_user_id: getDemoUserId(),
        }),
      });
      if (!r) return;
      setCheckResult({ score: r.score, feedback: r.feedback });
      setStage("situations");
    } catch (e: any) { alert(e?.message || "Ошибка"); }
  };

  const submitSituations = async () => {
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка ролевых ответов",
        task: () => call("ai-demo-grade-situations", {
          title: projectName || "Вакансия",
          situations, answers: sitAnswers,
          demo_user_id: getDemoUserId(),
        }),
      });
      if (!r) return;
      setSitResult({ score: r.score, items: r.items, advice: r.advice });
      setStage("done");
    } catch (e: any) { alert(e?.message || "Ошибка"); }
  };

  const overall = useMemo(() => {
    const scores = [resumeResult?.score, checkResult?.score, sitResult?.score].filter((x): x is number => typeof x === "number");
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }, [resumeResult, checkResult, sitResult]);

  const restartAll = () => {
    resetDemoUserId();
    restartedRef.current = false;
    setResumeText(""); setResumeResult(null); setUploadedResume(null);
    setCheckAnswers({}); setCheckResult(null);
    setSitAnswers({}); setSitResult(null);
    setStage("intro");
  };

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

  const STEPS: { k: Stage; label: string; Icon: any }[] = [
    { k: "resume",     label: "1. Резюме",   Icon: FileText     },
    { k: "checklist",  label: "2. Чек-лист", Icon: ListChecks   },
    { k: "situations", label: "3. Ситуации", Icon: MessageSquare},
    { k: "done",       label: "Итог",        Icon: Award        },
  ];

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
          Полноценный прогон ИИ-интервью по вашей вакансии. Списаний с баланса нет.
          Проходной балл: <b>{passScore}</b>.
        </p>

        {stage !== "intro" && (
          <div className="flex flex-wrap gap-2">
            {STEPS.map(({ k, label, Icon }) => (
              <div key={k}
                className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1 ${
                  stage === k ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]"
                              : "bg-white/5 text-slate-300 border-white/10"}`}>
                <Icon className="w-3.5 h-3.5"/>{label}
              </div>
            ))}
            <button onClick={restartAll} className="ml-auto text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1">
              <RotateCcw className="w-3 h-3"/>Начать заново
            </button>
          </div>
        )}

        {/* INTRO */}
        {stage === "intro" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-6 space-y-4 text-center">
            <Sparkles className="w-8 h-8 text-[#E7C768] mx-auto"/>
            <h2 className="text-lg font-bold text-[#E7C768]">Готовы пройти своё интервью глазами кандидата?</h2>
            <p className="text-sm text-slate-200">
              Это бесплатный прогон по вашей же вакансии. ИИ оценит резюме, ответы на чек-лист и ситуации —
              точно так же, как и реальному кандидату. Результаты не сохраняются и не списываются с баланса.
            </p>
            <button onClick={startRestart}
              className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-xl inline-flex items-center gap-2 hover:brightness-110">
              Начать <Send className="w-4 h-4"/>
            </button>
          </div>
        )}

        {/* RESUME */}
        {stage === "resume" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-bold text-[#E7C768]">Этап 1 · Скрининг резюме</h2>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Критерии для ИИ</div>
            <div className="bg-black/30 border border-white/10 rounded-xl p-3 max-h-40 overflow-y-auto">
              <RichMarkdown>{resumeMd || "_не задано_"}</RichMarkdown>
            </div>

            {!resumeText && !uploadedResume && (
              <div className="bg-black/30 border border-dashed border-white/15 rounded-xl p-4 text-center">
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) onUploadResume(f); }}/>
                <button disabled={uploading} onClick={() => fileRef.current?.click()}
                  className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1 disabled:opacity-60">
                  <Upload className="w-3.5 h-3.5"/>{uploading ? "Загрузка…" : "Загрузить резюме (PDF / DOC / TXT)"}
                </button>
                <div className="text-[10px] text-slate-400 mt-2">или вставьте текст резюме ниже</div>
                <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={5}
                  className="mt-2 w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-xs"
                  placeholder="Можно вставить текст резюме руками…"/>
              </div>
            )}

            {uploadedResume && (
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-[#E7C768]"/>
                <span className="text-slate-200 truncate flex-1">{uploadedResume.filename}</span>
                <button disabled={parsing} onClick={recognizeResume}
                  className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-3 py-1.5 rounded-lg disabled:opacity-60">
                  {parsing ? "Распознаём…" : "Распознать ИИ"}
                </button>
              </div>
            )}

            {resumeText && (
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Текст резюме</label>
                <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={8}
                  className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-xs"/>
                <div className="flex gap-2">
                  <button onClick={() => { setResumeText(""); setUploadedResume(null); }}
                    className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1">
                    <RotateCcw className="w-3 h-3"/>Сбросить
                  </button>
                  <button onClick={submitResume}
                    className="ml-auto bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1">
                    Отправить на оценку <Send className="w-3.5 h-3.5"/>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHECKLIST */}
        {stage === "checklist" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-bold text-[#E7C768]">Этап 2 · Чек-лист</h2>
            {checklist.length === 0 && <p className="text-sm text-slate-300">Чек-лист пуст.</p>}
            <ol className="space-y-3 list-decimal pl-5">
              {checklist.map(q => (
                <li key={q.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-white">{q.question}</div>
                  {q.kind === "choice" && Array.isArray(q.options) ? (
                    <div className="space-y-1">
                      {q.options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-[12px] text-slate-200">
                          <input type="radio" name={`q-${q.id}`} checked={checkAnswers[q.id] === opt}
                            onChange={() => setCheckAnswers(p => ({ ...p, [q.id]: opt }))}/>
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea rows={2} value={checkAnswers[q.id] || ""}
                      onChange={e => setCheckAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                      className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs"/>
                  )}
                </li>
              ))}
            </ol>
            <div className="flex justify-end pt-2">
              <button onClick={submitChecklist}
                className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1">
                Отправить на оценку <Send className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        )}

        {/* SITUATIONS */}
        {stage === "situations" && (
          <div className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-bold text-[#E7C768]">Этап 3 · Ситуации</h2>
            {situations.length === 0 && <p className="text-sm text-slate-300">Ситуации не заданы.</p>}
            <div className="space-y-3">
              {situations.map(sit => (
                <div key={sit.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm font-bold text-[#E7C768]">{sit.title}</div>
                  <div className="text-xs text-slate-300 whitespace-pre-line">{sit.brief}</div>
                  <textarea rows={3} value={sitAnswers[sit.id] || ""}
                    onChange={e => setSitAnswers(p => ({ ...p, [sit.id]: e.target.value }))}
                    className="w-full bg-black/40 text-white border border-white/10 rounded-lg px-2 py-1 text-xs"/>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={submitSituations}
                className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1">
                Отправить на оценку <Send className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        )}

        {/* DONE */}
        {stage === "done" && (
          <div className="bg-[#1E4468]/60 border border-[#E7C768]/40 rounded-2xl p-5 space-y-3">
            <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-2"><Award className="w-5 h-5"/>Итог демо-интервью</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Резюме",   v: resumeResult?.score },
                { label: "Чек-лист", v: checkResult?.score },
                { label: "Ситуации", v: sitResult?.score },
              ].map(x => (
                <div key={x.label} className="bg-black/30 border border-white/10 rounded-xl p-3">
                  <div className="text-[10px] uppercase text-slate-400 font-bold">{x.label}</div>
                  <div className="text-xl font-bold text-white">{x.v ?? "—"}</div>
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
            {resumeResult?.summary && (
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-slate-200">
                <b className="text-[#E7C768]">Резюме:</b> {resumeResult.summary}
              </div>
            )}
            {sitResult?.advice && (
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-slate-200">
                <b className="text-[#E7C768]">Совет по ситуациям:</b> {sitResult.advice}
              </div>
            )}
            <div className="flex gap-2 flex-wrap pt-2">
              <button onClick={restartAll} className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3"/>Пройти заново
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