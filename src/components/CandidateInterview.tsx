import { useEffect, useMemo, useRef, useState } from "react";
import { Loader, FileText, CheckCircle, MessageSquare, Award, RefreshCw, Send, Upload, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import { getCandidateSession } from "@/lib/candidateSession";

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

const FN = (n: string) => `https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/${n}`;

async function call(fn: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FN(fn), {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) throw new Error(j?.error || `HTTP ${res.status}`);
  return j;
}

export default function CandidateInterview({ projectId, candidateId, onCompleted }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const [stage, setStage] = useState<Stage>("resume");
  const [passScore, setPassScore] = useState(75);

  // resume
  const [resumeText, setResumeText] = useState("");
  const [resumeResult, setResumeResult] = useState<{ score: number; summary: string; strengths: string[]; gaps: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ bucket: string; path: string; filename: string } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
      const { data: sc } = await (supabase as any).from("candidate_scores").select("resume_score,checklist_score,situations_score,assessment_summary").eq("candidate_id", candidateId).maybeSingle();
      if (sc) {
        if (sc.resume_score != null) setResumeResult({ score: sc.resume_score, summary: sc.assessment_summary || "", strengths: [], gaps: [] });
        if (sc.checklist_score != null) setChecklistScore(sc.checklist_score);
        if (sc.situations_score != null) setSituationsScore(sc.situations_score);
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
    } catch (e: any) { alert(e?.message || "Ошибка"); }
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
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setUploadedResume({ bucket: j.bucket, path: j.path, filename: f.name });
    } catch (e: any) {
      setUploadError(e?.message || "Не удалось загрузить резюме");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sendResumeToRR = async () => {
    if (!uploadedResume) return;
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
      alert(e?.message || "Не удалось распознать файл");
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
    } catch (e: any) { alert(e?.message || "Ошибка"); }
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
      setStage("done");
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  const reset = () => {
    setStage("resume"); setResumeResult(null); setResumeText(""); setAnswers({}); setChecklistScore(null);
    setSitAnswers({}); setSituationsScore(null); setSituationsFeedback([]); setFinalScore(null);
  };

  const stageBadge = (s: Stage, label: string, score: number | null) => (
    <button onClick={() => setStage(s)} className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${stage === s ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>
      {label}{score != null && <span className="text-[10px] bg-emerald-500/30 text-emerald-100 px-1.5 py-0.5 rounded">{score}</span>}
    </button>
  );

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
        </div>
      </div>

      {stage === "resume" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 1: Скрининг резюме</h3>
          {resumeResult ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{resumeResult.score}/100</div>
              <p className="text-sm text-white whitespace-pre-wrap">{resumeResult.summary}</p>
              {resumeResult.strengths?.length > 0 && (<div><div className="text-xs text-emerald-300 font-bold uppercase">Сильные стороны</div><ul className="text-sm text-slate-200 list-disc pl-5">{resumeResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              {resumeResult.gaps?.length > 0 && (<div><div className="text-xs text-amber-300 font-bold uppercase">Что улучшить</div><ul className="text-sm text-slate-200 list-disc pl-5">{resumeResult.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              <div className="flex gap-2">
                <button onClick={() => setStage("checklist")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Перейти к чек-листу →</button>
                <button onClick={() => { setResumeResult(null); }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={parsing || busy || uploading} onClick={() => fileRef.current?.click()} className="bg-white/10 hover:bg-white/15 text-white text-xs px-3 py-2 rounded-xl flex items-center gap-2 disabled:opacity-60">
                  {uploading ? <Loader className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                  {uploading ? "Загружаем в Supabase…" : "Загрузить файл резюме (PDF/DOC/TXT)"}
                </button>
                <input ref={fileRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadResume(f); }} />
              </div>
              {uploadedResume && !parsing && (
                <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs text-white" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(231,199,104,0.3)"}}>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#E7C768]"/>Резюме загружено: {uploadedResume.filename}</span>
                  <button type="button" disabled={parsing} onClick={sendResumeToRR} className="bg-[#E7C768] text-[#17344F] font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5"/> Отправить резюме в RR
                  </button>
                </div>
              )}
              {uploadError && <div className="text-xs text-[#FF4C4C]">{uploadError}</div>}
              {parsing && <LoadingPhrase entity="interview" />}
              <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={12} maxLength={20000} placeholder="Вставьте текст вашего резюме или загрузите файл — ИИ распознает и заполнит это поле автоматически." className="w-full bg-black/30 text-white border border-white/10 rounded-xl px-3 py-2 text-sm" />
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
          {checklistScore != null ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{checklistScore}/100</div>
              <div className="flex gap-2">
                <button onClick={() => setStage("situations")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Перейти к ситуациям →</button>
                <button onClick={() => {
                  setChecklistScore(null);
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
          {situationsScore != null ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{situationsScore}/100</div>
              {situationsFeedback.map(f => (
                <div key={f.id} className="bg-black/30 border border-white/10 rounded-xl p-3">
                  <div className="text-xs text-[#E7C768] font-bold">{f.id}: {f.score}/100</div>
                  <div className="text-sm text-slate-200">{f.feedback}</div>
                </div>
              ))}
              <button onClick={() => { setSituationsScore(null); setSitAnswers({}); setSituationsFeedback([]); }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
            </div>
          ) : situations.length === 0 ? (
            <p className="text-sm text-amber-300">Ситуации ещё не настроены работодателем.</p>
          ) : (
            <>
              {situations.map((s, i) => (
                <div key={s.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-[#E7C768] font-bold">Ситуация #{i+1}: {s.title}</div>
                  <div className="text-sm text-slate-200 whitespace-pre-wrap">{s.brief}</div>
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
    </div>
  );
}