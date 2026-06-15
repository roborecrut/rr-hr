import { useEffect, useMemo, useRef, useState } from "react";
import { Loader, FileText, CheckCircle, MessageSquare, Award, RefreshCw, Send, Upload, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import { getCandidateSession } from "@/lib/candidateSession";
import { aiRestart } from "@/lib/aiClient";
import { useAIReady, waitForAIReady } from "@/lib/aiReady";
import EmbeddedMarkdown from "@/components/EmbeddedMarkdown";
import RichMarkdown from "@/components/RichMarkdown";
import ResumeDropzone from "@/components/ResumeDropzone";
import { VacancyPausedDialog, isVacancyPausedError } from "@/components/VacancyPausedDialog";
import { toUserError, formatUserError } from "@/lib/userError";

type Stage = "resume" | "checklist" | "situations" | "done";

type Question = { id: string; kind: "choice" | "text"; question: string; options?: string[] | null };
type Situation = { id: string; title: string; brief: string };

function shuffleArr<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type Props = {
  projectId: string;
  candidateId: string;
  onCompleted?: (passed: boolean, score: number) => void;
};

// FN импортируется из единого конфига — используется только для multipart/FormData запросов.
import { FN } from "@/config";

async function call(fn: string, body: any) {
  // Кандидат не использует Supabase Auth — передаём его opaque-токен из localStorage.
  let candidateToken: string | null = null;
  try {
    const raw = localStorage.getItem("cand_session");
    if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
  } catch { /* ignore */ }
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { ...body, candidate_token: candidateToken },
    headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
  });
  if (error) {
    const code = (data as any)?.error || (error as any)?.message || `fn_${fn}_failed`;
    throw new Error(code);
  }
  if (data && typeof data === "object" && "error" in (data as any) && (data as any).error) {
    throw new Error((data as any).error);
  }
  return data as any;
}

export default function CandidateInterview({ projectId, candidateId, onCompleted }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const restartFiredRef = useRef(false);
  const [stage, setStage] = useState<Stage>("resume");
  const [passScore, setPassScore] = useState(75);
  // Vacancy paused (no employer funds)
  const [paused, setPaused] = useState<null | { email?: string|null; phone?: string|null; telegram?: string|null }>(null);
  // Rich AI feedback restored from DB
  const [checklistFeedback, setChecklistFeedback] = useState<any>(null);

  // resume
  const [resumeText, setResumeText] = useState("");
  const [resumeResult, setResumeResult] = useState<{ score: number; summary: string; strengths: string[]; gaps: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ bucket: string; path: string; filename: string } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeEditMode, setResumeEditMode] = useState(false);
  const [pausedOpen, setPausedOpen] = useState(false);

  // checklist
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffleChecklist, setShuffleChecklist] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checklistScore, setChecklistScore] = useState<number | null>(null);

  // situations
  const [situations, setSituations] = useState<Situation[]>([]);
  const [sitAnswers, setSitAnswers] = useState<Record<string, string>>({});
  const [situationsScore, setSituationsScore] = useState<number | null>(null);
  const [situationsFeedback, setSituationsFeedback] = useState<{ id: string; feedback: string; score: number }[]>([]);

  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      // Reset RR dialog context for this candidate before any AI calls.
      // Overlay (AIRestartGate) is driven by beginAIRestart() inside aiRestart().
      if (!restartFiredRef.current) {
        restartFiredRef.current = true;
        aiRestart().catch(() => {});
      }
      // Gate 1: can this candidate actually start an interview right now?
      try {
        const { data: gate } = await (supabase as any).rpc("can_start_interview", { _candidate: candidateId });
        if (gate && gate.ok === false && gate.reason === "no_funds") {
          setPaused(gate.employer_contacts || {});
          return;
        }
      } catch {}

      const { data: pr } = await (supabase as any).from("projects").select("interview_pass_score").eq("id", projectId).maybeSingle();
      setPassScore((pr as any)?.interview_pass_score ?? 75);
      const r = await call("ai-list-interview-checklist", { project_id: projectId });
      const qs: Question[] = r.questions || [];
      const doShuffle = r.shuffle !== false;
      setShuffleChecklist(doShuffle);
      setQuestions(doShuffle
        ? shuffleArr(qs).map(q => q.kind === "choice" && q.options ? { ...q, options: shuffleArr(q.options) } : q)
        : qs);
      setSituations(r.situations || []);
      // try fetch existing scores
      const { data: sc } = await (supabase as any).from("candidate_scores")
        .select("resume_score,checklist_score,situations_score,assessment_summary,resume_feedback,checklist_feedback,situations_feedback")
        .eq("candidate_id", candidateId).maybeSingle();
      if (sc) {
        if (sc.resume_score != null) {
          const rf = sc.resume_feedback || {};
          setResumeResult({
            score: sc.resume_score,
            summary: sc.assessment_summary || rf.summary || "",
            strengths: Array.isArray(rf.strengths) ? rf.strengths : [],
            gaps: Array.isArray(rf.gaps) ? rf.gaps : [],
          });
        }
        if (sc.checklist_score != null) setChecklistScore(sc.checklist_score);
        if (sc.checklist_feedback) setChecklistFeedback(sc.checklist_feedback);
        if (sc.situations_score != null) setSituationsScore(sc.situations_score);
        if (sc.situations_feedback?.items) setSituationsFeedback(sc.situations_feedback.items);
        // Auto-jump to first incomplete stage
        if (sc.situations_score == null && sc.checklist_score != null) setStage("situations");
        else if (sc.checklist_score == null && sc.resume_score != null) setStage("checklist");
      }
    })();
  }, [projectId, candidateId]);

  const submitResume = async () => {
    if (!resumeText.trim() || resumeText.length < 50) { alert("Введите резюме (минимум 50 символов)"); return; }
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка резюме",
        task: () => call("ai-interview-screen-resume", { project_id: projectId, candidate_id: candidateId, resume_text: resumeText }),
      });
      if (!r) return;
      setResumeResult(r.result);
    } catch (e: any) {
      if (isVacancyPausedError(e)) { setPausedOpen(true); }
      else { alert(formatUserError(toUserError(e))); }
    }
    finally { setBusy(false); }
  };

  const onUploadResume = async (f: File) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert("Файл больше 10 МБ"); return; }
    setUploading(true);
    setUploadError("");
    try {
      const sess = getCandidateSession();
      if (!sess?.token) throw new Error("Сессия кандидата истекла — войдите снова.");
      const form = new FormData();
      form.append("token", sess.token);
      form.append("kind", "resume");
      form.append("file", f);
      const res = await fetch(FN("candidate-upload-file"), {
        method: "POST",
        headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: form,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "upload_failed");
      setUploadedResume({ bucket: j.bucket, path: j.path, filename: f.name });
    } catch (e: any) {
      setUploadError(formatUserError(toUserError(e, { kind: "bad_file", message: "Не удалось загрузить резюме. Проверьте формат и размер файла." })));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sendResumeToRR = async () => {
    if (!uploadedResume) return;
    // Make sure /restart finished before we hit the neural network,
    // otherwise we get two parallel responses and the parser breaks.
    await waitForAIReady();
    setParsing(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание резюме",
        task: () => call("ai-ingest-document", { entity: "resume", entity_id: candidateId, bucket: uploadedResume.bucket, file_path: uploadedResume.path, filename: uploadedResume.filename }),
      });
      if (!r) return;
      const text = String(r?.text || "").slice(0, 20000);
      if (!text.trim()) throw new Error("ИИ не смог распознать резюме");
      setResumeText(text);
      setUploadedResume(null);
    } catch (e: any) {
      alert(formatUserError(toUserError(e, { kind: "ai_temporary", message: "Не удалось распознать файл. Попробуйте ещё раз." })));
    } finally {
      setParsing(false);
    }
  };

  const submitChecklist = async () => {
    if (Object.keys(answers).length < questions.length) {
      if (!confirm(`Заполнено ${Object.keys(answers).length}/${questions.length}. Отправить?`)) return;
    }
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Проверка чек-листа",
        task: () => call("ai-interview-grade-checklist", { project_id: projectId, candidate_id: candidateId, answers }),
      });
      if (!r) return;
      setChecklistScore(r.score);
      if (r.feedback) setChecklistFeedback(r.feedback);
    } catch (e: any) { alert(formatUserError(toUserError(e))); }
    finally { setBusy(false); }
  };

  const submitSituations = async () => {
    if (Object.keys(sitAnswers).length < situations.length) {
      if (!confirm(`Заполнено ${Object.keys(sitAnswers).length}/${situations.length}. Отправить?`)) return;
    }
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка ролевых ответов",
        task: () => call("ai-interview-grade-situations", { project_id: projectId, candidate_id: candidateId, answers: sitAnswers }),
      });
      if (!r) return;
      setSituationsScore(r.score);
      setSituationsFeedback(r.items || []);
      const avg = Math.round(((resumeResult?.score || 0) + (checklistScore || 0) + r.score) / 3);
      setFinalScore(avg);
      const passed = avg >= passScore;
      if (passed) {
        await (supabase as any).from("candidates").update({ current_stage: "training" }).eq("id", candidateId);
      }
      await (supabase as any).from("candidate_scores").upsert({ candidate_id: candidateId, interview_score: avg, overall_score: avg }, { onConflict: "candidate_id" });
      onCompleted?.(passed, avg);
      // Не переключаем стадию автоматически — пользователь увидит результат
      // этапа «Ситуации» и сам нажмёт кнопку «Показать итоговую оценку».
    } catch (e: any) { alert(formatUserError(toUserError(e))); }
    finally { setBusy(false); }
  };

  const reset = () => {
    setStage("resume"); setResumeResult(null); setResumeText(""); setAnswers({}); setChecklistScore(null);
    setSitAnswers({}); setSituationsScore(null); setSituationsFeedback([]); setFinalScore(null);
  };

  const stageBadge = (s: Stage, label: string, score: number | null) => (
    <button onClick={() => setStage(s)} disabled={stageLocked(s)} className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${stage === s ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>
      {label}{score != null && <span className="text-[10px] bg-emerald-500/30 text-emerald-100 px-1.5 py-0.5 rounded">{score}</span>}
    </button>
  );

  const stageLocked = (s: Stage) => {
    if (s === "checklist") return resumeResult?.score == null;
    if (s === "situations") return checklistScore == null;
    if (s === "done") return finalScore == null;
    return false;
  };

  if (paused) {
    const tg = (paused.telegram || "").trim().replace(/^@/, "");
    return (
      <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border border-[#E7C768]/40 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
        <div className="inline-flex w-14 h-14 rounded-full bg-amber-500/20 items-center justify-center text-3xl">⏸</div>
        <h2 className="text-xl font-extrabold text-[#E7C768]">Вакансия временно на паузе</h2>
        <p className="text-sm text-white/90 max-w-md mx-auto">
          У работодателя сейчас закончились средства для проведения ИИ-собеседования. Свяжитесь с ним напрямую — возможно, отбор продолжается через личное общение.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs max-w-xl mx-auto">
          {paused.email ? (
            <a className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-white break-all" href={`mailto:${paused.email}`}>
              <div className="text-[10px] uppercase text-[#E7C768] font-bold">Email</div>
              <div className="mt-1 font-bold">{paused.email}</div>
            </a>
          ) : null}
          {paused.phone ? (
            <a className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-white" href={`tel:${paused.phone.replace(/[^\d+]/g, "")}`}>
              <div className="text-[10px] uppercase text-[#E7C768] font-bold">Телефон</div>
              <div className="mt-1 font-bold">{paused.phone}</div>
            </a>
          ) : null}
          {tg ? (
            <a className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-white" href={tg.startsWith("http") ? tg : `https://t.me/${tg}`} target="_blank" rel="noopener noreferrer">
              <div className="text-[10px] uppercase text-[#E7C768] font-bold">Telegram</div>
              <div className="mt-1 font-bold">@{tg}</div>
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#1D3E5E]/80 border border-white/10 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#E7C768]/20 flex items-center justify-center text-[#E7C768]"><MessageSquare className="w-5 h-5"/></div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">ИИ-Интервью</h2>
            <p className="text-xs text-slate-300">Пройдите 3 этапа. Проходной средний балл: <b className="text-[#E7C768]">{passScore}</b>. При неуспехе можно пересдать.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stageBadge("resume", "1. Резюме", resumeResult?.score ?? null)}
          {stageBadge("checklist", "2. Чек-лист", checklistScore)}
          {stageBadge("situations", "3. Ситуации", situationsScore)}
          {stageBadge("done", "4. Итог", finalScore)}
        </div>
      </div>

      {stage === "resume" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 1: Скрининг резюме</h3>
          {resumeResult ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{resumeResult.score}/100</div>
              <div className="text-sm text-white"><RichMarkdown tone="resume">{resumeResult.summary || ""}</RichMarkdown></div>
              {resumeResult.strengths?.length > 0 && (<div><div className="text-xs text-emerald-300 font-bold uppercase">Сильные стороны</div><ul className="text-sm text-slate-200 list-disc pl-5">{resumeResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              {resumeResult.gaps?.length > 0 && (<div><div className="text-xs text-amber-300 font-bold uppercase">Что улучшить</div><ul className="text-sm text-slate-200 list-disc pl-5">{resumeResult.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              <div className="flex gap-2">
                <button onClick={() => setStage("checklist")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Перейти к чек-листу →</button>
                <button onClick={() => { setResumeResult(null); }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : (
            <>
              <ResumeDropzone
                uploading={uploading}
                parsing={parsing}
                uploaded={uploadedResume ? { filename: uploadedResume.filename } : null}
                error={uploadError}
                busy={busy}
                onFile={onUploadResume}
                onClear={() => setUploadedResume(null)}
                onSend={aiReady ? sendResumeToRR : undefined}
                sendLabel={aiReady ? "Распознать резюме" : "Готовим ИИ…"}
                sendDisabled={!aiReady}
              />
              {resumeText && !resumeEditMode ? (
                <div className="relative w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setResumeEditMode(true)}
                    className="absolute top-2 right-2 text-[10px] uppercase tracking-wider font-bold bg-white/10 hover:bg-white/20 text-[#E7C768] px-2 py-1 rounded-md"
                  >
                    Редактировать
                  </button>
                  <RichMarkdown tone="resume">{resumeText}</RichMarkdown>
                </div>
              ) : (
                <>
                  <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={12} maxLength={20000} placeholder="Вставьте текст вашего резюме или загрузите файл — ИИ распознает и заполнит это поле автоматически. Поддерживается Markdown." className="w-full bg-black/30 text-white border border-white/10 rounded-xl px-3 py-2 text-sm font-mono" />
                  {resumeText && (
                    <button
                      type="button"
                      onClick={() => setResumeEditMode(false)}
                      className="text-[10px] uppercase tracking-wider font-bold bg-white/10 hover:bg-white/20 text-[#E7C768] px-2 py-1 rounded-md self-start"
                    >
                      Предпросмотр
                    </button>
                  )}
                </>
              )}
              {busy && <LoadingPhrase entity="interview" />}
              <button disabled={busy} onClick={submitResume} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>} Отправить на оценку
              </button>
            </>
          )}
        </div>
      )}

      {stage === "checklist" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 2: Чек-лист ({questions.length} вопросов)</h3>
          {stageLocked("checklist") ? (
            <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              ⛔ Сначала пройдите этап «Резюме» — без оценки резюме чек-лист недоступен.
              <button onClick={() => setStage("resume")} className="ml-2 underline text-[#E7C768]">Перейти к резюме</button>
            </div>
          ) : checklistScore != null ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{checklistScore}/100</div>
              {checklistFeedback?.summary ? (
                <p className="text-sm text-white/90 italic">{checklistFeedback.summary}</p>
              ) : null}
              {(checklistFeedback?.strengths?.length || checklistFeedback?.gaps?.length) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {checklistFeedback.strengths?.length ? (
                    <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-emerald-300">Сильные стороны</div>
                      <ul className="list-disc pl-5 text-xs text-emerald-100 mt-1 space-y-0.5">
                        {checklistFeedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {checklistFeedback.gaps?.length ? (
                    <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
                      <div className="text-[10px] uppercase font-bold text-amber-300">Что улучшить</div>
                      <ul className="list-disc pl-5 text-xs text-amber-100 mt-1 space-y-0.5">
                        {checklistFeedback.gaps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {checklistFeedback?.items?.length ? (
                <details className="bg-black/30 border border-white/10 rounded-xl">
                  <summary className="cursor-pointer p-3 text-xs font-bold text-[#E7C768]">Подробный разбор по каждому вопросу</summary>
                  <div className="p-3 space-y-2">
                    {checklistFeedback.items.map((it: any) => (
                      <div key={it.id} className="bg-black/20 border border-white/5 rounded-lg p-2">
                        <div className="text-xs font-bold text-white">{it.question}</div>
                        <div className="text-[11px] text-slate-300 mt-1">Ваш ответ: <span className="text-white">{it.answer || "—"}</span></div>
                        {it.correct ? <div className="text-[11px] text-emerald-300 mt-0.5">Эталон: {it.correct}</div> : null}
                        <div className={`text-[11px] mt-1 ${it.verdict === "correct" ? "text-emerald-200" : it.verdict === "partial" ? "text-amber-200" : "text-red-200"}`}>
                          {it.score}/{it.max} · {it.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              <div className="flex gap-2">
                <button onClick={() => setStage("situations")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Перейти к ситуациям →</button>
                <button onClick={() => {
                  setChecklistScore(null);
                  setChecklistFeedback(null);
                  setAnswers({});
                  if (shuffleChecklist) {
                    setQuestions(qs => shuffleArr(qs).map(q => q.kind === "choice" && q.options ? { ...q, options: shuffleArr(q.options) } : q));
                  }
                }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-amber-300">Чек-лист ещё не настроен работодателем.</p>
          ) : (
            <>
              {questions.map((q, i) => (
                <div key={q.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-white font-semibold">#{i+1}. {q.question}</div>
                  {q.kind === "choice" ? (
                    <div className="space-y-1">
                      {(q.options || []).map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer hover:bg-white/5 rounded px-2 py-1">
                          <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => setAnswers({ ...answers, [q.id]: opt })} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea value={answers[q.id] || ""} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} rows={3} placeholder="Ваш ответ..." className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm" />
                  )}
                </div>
              ))}
              {busy && <LoadingPhrase entity="interview" />}
              <button disabled={busy} onClick={submitChecklist} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Отправить ответы
              </button>
            </>
          )}
        </div>
      )}

      {stage === "situations" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 3: Ролевые ситуации</h3>
          {stageLocked("situations") ? (
            <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              ⛔ Сначала пройдите этап «Чек-лист» — без него ролевые ситуации недоступны.
              <button onClick={() => setStage("checklist")} className="ml-2 underline text-[#E7C768]">Перейти к чек-листу</button>
            </div>
          ) : situationsScore != null ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{situationsScore}/100</div>
              {situationsFeedback.map(f => (
                <div key={f.id} className="bg-black/30 border border-white/10 rounded-xl p-3">
                  <div className="text-xs text-[#E7C768] font-bold">{f.id}: {f.score}/100</div>
                  <div className="text-sm text-slate-200">{f.feedback}</div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {finalScore != null && (
                  <button onClick={() => setStage("done")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-1">
                    <Award className="w-4 h-4"/> Показать итоговую оценку →
                  </button>
                )}
                <button onClick={() => { setSituationsScore(null); setSitAnswers({}); setSituationsFeedback([]); setFinalScore(null); }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : situations.length === 0 ? (
            <p className="text-sm text-amber-300">Ситуации ещё не настроены работодателем.</p>
          ) : (
            <>
              {situations.map((s, i) => (
                <div key={s.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-[#E7C768] font-bold">Ситуация #{i+1}: {s.title}</div>
                  <div className="text-sm text-slate-200"><RichMarkdown tone="chat">{s.brief}</RichMarkdown></div>
                  <textarea value={sitAnswers[s.id] || ""} onChange={e => setSitAnswers({ ...sitAnswers, [s.id]: e.target.value })} rows={4} placeholder="Ваш ответ..." className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm" />
                </div>
              ))}
              {busy && <LoadingPhrase entity="interview" />}
              <button disabled={busy} onClick={submitSituations} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Award className="w-4 h-4"/>} Завершить интервью
              </button>
            </>
          )}
        </div>
      )}

      {stage === "done" && finalScore != null && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-6 space-y-3 text-center">
          <Award className="w-12 h-12 text-[#E7C768] mx-auto" />
          <div className="text-4xl font-extrabold text-white">{finalScore}/100</div>
          <p className="text-sm text-slate-200">Средний балл по 3 этапам. Проходной: <b>{passScore}</b>.</p>
          {finalScore >= passScore ? (
            <p className="text-emerald-300 font-bold">✅ Интервью пройдено — переходите к обучению!</p>
          ) : (
            <>
              <p className="text-amber-300 font-bold">Нужен более высокий балл. Можно пересдать все этапы.</p>
              <button onClick={reset} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Начать заново</button>
            </>
          )}
        </div>
      )}
      <VacancyPausedDialog open={pausedOpen} projectId={projectId} onClose={() => setPausedOpen(false)} />
    </div>
  );
}