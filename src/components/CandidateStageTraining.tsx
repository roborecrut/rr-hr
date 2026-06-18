import { useEffect, useMemo, useState } from "react";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { BookOpen, CheckCircle2, Lock, RefreshCw, Sparkles, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import Reveal from "@/components/Reveal";
import { VacancyPausedDialog, isVacancyPausedError } from "@/components/VacancyPausedDialog";
import { toUserError, formatUserError } from "@/lib/userError";
import CandidateTrainingStageReport from "@/components/reports/CandidateTrainingStageReport";

type Stage = "professional" | "product" | "system";
const STAGES: { key: Stage; title: string; icon: string }[] = [
  { key: "professional", title: "Профессиональное обучение", icon: "💼" },
  { key: "product",      title: "Продуктовое обучение",      icon: "🎁" },
  { key: "system",       title: "Системное обучение",        icon: "⚙️" },
];

type Q = { id: string; kind: "choice" | "text"; question: string; points: number; options?: { text: string }[] | null };

function shuffleArr<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function CandidateStageTraining({
  candidateId, projectId,
}: { candidateId: string; projectId: string }) {
  const { run: aiWaitRun } = useAIWait();
  const [progress, setProgress] = useState<Record<Stage, { passed: boolean; best: number; attempts: number }>>({
    professional: { passed: false, best: 0, attempts: 0 },
    product: { passed: false, best: 0, attempts: 0 },
    system: { passed: false, best: 0, attempts: 0 },
  });
  const [active, setActive] = useState<Stage>("professional");
  const [material, setMaterial] = useState<string>("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [examQuestions, setExamQuestions] = useState<Q[]>([]);
  const [shuffle, setShuffle] = useState(true);
  const [passScore, setPassScore] = useState(70);
  const [totalScore, setTotalScore] = useState(100);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"reading" | "exam" | "result">("reading");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; passed: boolean; per_question: any[] } | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<any>(null);
  const [pausedOpen, setPausedOpen] = useState(false);

  const callEdge = async <T,>(fn: string, body: any): Promise<T> => {
    // Кандидат не имеет Supabase Auth — передаём его сессионный токен в теле и в заголовке.
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
      // Извлекаем тело ответа (job_id, fallback_available) — нужно для
      // оверлея RR Pro Max. supabase-js оборачивает не-2xx как
      // FunctionsHttpError, реальное тело лежит в context.
      let bodyJson: any = null;
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") bodyJson = await ctx.json();
      } catch { /* ignore */ }
      const msg = bodyJson?.error || (data as any)?.error || (error as any)?.message || `fn_${fn}_failed`;
      const e: any = new Error(msg);
      e.jobId = bodyJson?.job_id || null;
      e.fallbackAvailable = !!bodyJson?.fallback_available;
      throw e;
    }
    if (data && typeof data === "object" && "error" in (data as any) && (data as any).error) {
      const e: any = new Error((data as any).error);
      e.jobId = (data as any).job_id || null;
      e.fallbackAvailable = !!(data as any).fallback_available;
      throw e;
    }
    return data as T;
  };

  // Load progress
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("candidate_stage_progress")
        .select("stage,best_score,attempts,passed_at").eq("candidate_id", candidateId);
      if (cancelled) return;
      const next = { ...progress };
      (data || []).forEach((r: any) => {
        next[r.stage as Stage] = { passed: !!r.passed_at, best: r.best_score || 0, attempts: r.attempts || 0 };
      });
      setProgress(next);
      // auto-jump to first unpassed stage
      const firstOpen = STAGES.find(s => !next[s.key].passed)?.key || "system";
      setActive(firstOpen);
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  // Load material + questions for active stage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMode("reading");
      setAnswers({});
      setLastResult(null);
      try {
        const { data: blocks } = await supabase.from("training_blocks")
          .select("materials_md,title,updated_at")
          .eq("project_id", projectId).eq("stage", active)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        const b: any = (blocks || [])[0];
        setMaterial(b ? (b.materials_md || "") : "");
        const r = await callEdge<{ questions: Q[]; pass_score: number; total_score: number; shuffle?: boolean }>("ai-list-stage-questions", {
          project_id: projectId, stage: active,
        });
        if (cancelled) return;
        setQuestions(r.questions || []);
        setShuffle(r.shuffle !== false);
        setPassScore(r.pass_score || 70);
        setTotalScore(r.total_score || 100);
        // Restore last attempt result from DB so it persists across reloads
        const { data: prog } = await supabase.from("candidate_stage_progress")
          .select("last_score,last_feedback,last_answers,passed_at,attempts,best_score")
          .eq("candidate_id", candidateId).eq("stage", active).maybeSingle();
        if (cancelled) return;
        if (prog && (prog.attempts || 0) > 0 && prog.last_feedback) {
          setLastResult({
            score: Number(prog.last_score || 0),
            passed: !!prog.passed_at,
            per_question: Array.isArray(prog.last_feedback) ? prog.last_feedback : [],
          });
          setCandidateSummary((prog as any).candidate_summary || null);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [active, projectId, candidateId]);

  const canEnter = (s: Stage) => {
    const idx = STAGES.findIndex(x => x.key === s);
    if (idx === 0) return true;
    return progress[STAGES[idx - 1].key].passed;
  };

  const submit = async () => {
    setChecking(true);
    try {
      const payload = examQuestions.map(q => ({ question_id: q.id, value: answers[q.id] || "" }));
      const r = await aiWaitRun<any>({
        title: "Проверка ответов",
        task: () => callEdge<any>("ai-grade-training-quiz", {
          candidate_id: candidateId, project_id: projectId, stage: active, answers: payload,
        }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data: any) => {
            // Резервная модель вернула результат — обновляем UI как при основном пути.
            if (data) {
              setLastResult({ score: data.score, passed: data.passed, per_question: data.per_question });
              setProgress(p => ({ ...p, [active]: { passed: data.passed || p[active].passed, best: Math.max(p[active].best, data.score || 0), attempts: data.attempts || p[active].attempts } }));
              setMode("result");
            }
          },
        },
      });
      if (!r) return;
      // Списание лимита у работодателя — только после получения первой оценки от ИИ
      // по первому профессиональному тесту. RPC spend_pack идемпотентен по idem_key,
      // повторные тесты ничего не списывают.
      if (active === "professional") {
        try {
          const { error: spErr } = await supabase.rpc("spend_pack", { _candidate: candidateId, _kind: "training" });
          if (spErr && isVacancyPausedError(spErr)) {
            setPausedOpen(true);
            return;
          }
        } catch (e) {
          if (isVacancyPausedError(e)) { setPausedOpen(true); return; }
          console.warn("spend_pack(training) failed", e);
        }
      }
      setLastResult({ score: r.score, passed: r.passed, per_question: r.per_question });
      // Refresh candidate-facing summary from DB (saved by edge function).
      try {
        const { data: prog } = await supabase.from("candidate_stage_progress")
          .select("candidate_summary").eq("candidate_id", candidateId).eq("stage", active).maybeSingle();
        setCandidateSummary((prog as any)?.candidate_summary || null);
      } catch { /* ignore */ }
      setProgress(p => ({ ...p, [active]: { passed: r.passed || p[active].passed, best: Math.max(p[active].best, r.score), attempts: r.attempts } }));
      // Re-sync FULL progress from DB so locked/unlocked state of next stages
      // refreshes immediately without page reload.
      try {
        const { data: prog } = await supabase.from("candidate_stage_progress")
          .select("stage,best_score,attempts,passed_at").eq("candidate_id", candidateId);
        if (prog) {
          const next = { ...progress };
          (prog as any[]).forEach((row) => {
            next[row.stage as Stage] = { passed: !!row.passed_at, best: row.best_score || 0, attempts: row.attempts || 0 };
          });
          setProgress(next);
        }
      } catch { /* ignore */ }
      setMode("result");
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    } catch (e: any) {
      if (isVacancyPausedError(e)) setPausedOpen(true);
      else alert("Ошибка проверки: " + formatUserError(toUserError(e)));
    } finally { setChecking(false); }
  };

  const overall = useMemo(() => {
    const passed = STAGES.filter(s => progress[s.key].passed).length;
    return Math.round((passed / STAGES.length) * 100);
  }, [progress]);

  const startExam = () => {
    let qs = questions;
    if (shuffle) {
      qs = shuffleArr(qs).map(q => q.kind === "choice" && q.options
        ? { ...q, options: shuffleArr(q.options) }
        : q);
    }
    setExamQuestions(qs);
    setAnswers({});
    setMode("exam");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  };

  return (
    <div className="space-y-5">
      {/* Progress header */}
      <Reveal direction="down" className="bg-[#1E4468]/30 border border-white/10 rounded-3xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <GraduationCap className="w-6 h-6 text-[#E7C768]" />
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">Курс обучения — 3 этапа</h2>
            <p className="text-[11px] text-slate-300">Этапы открываются по очереди. Тест каждого можно перепроходить неограниченно — пока не наберёте {passScore} баллов.</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-[#E7C768]">{overall}%</div>
            <div className="text-[10px] text-slate-400">общий прогресс</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {STAGES.map(s => {
            const st = progress[s.key];
            const locked = !canEnter(s.key);
            const isActive = active === s.key;
            return (
              <button key={s.key} type="button" disabled={locked}
                onClick={() => setActive(s.key)}
                className={`p-3 rounded-xl text-left border transition ${isActive
                  ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]"
                  : locked
                    ? "bg-white/5 text-slate-500 border-white/5 cursor-not-allowed"
                    : "bg-white/5 text-white border-white/10 hover:border-[#E7C768]/40"}`}>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>{s.icon} {s.title}</span>
                  {locked ? <Lock className="w-3 h-3" /> : st.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : null}
                </div>
                <div className="text-[10px] opacity-80 mt-1">
                  {st.passed ? `Сдан • ${st.best}/${totalScore}` : st.attempts > 0 ? `Попыток: ${st.attempts}, лучший: ${st.best}` : "Не начат"}
                </div>
              </button>
            );
          })}
        </div>
      </Reveal>

      {loading ? (
        <Reveal direction="fade" className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-[#E7C768] mx-auto mb-2" />
          <LoadingPhrase entity="training" />
        </Reveal>
      ) : !canEnter(active) ? (
        <Reveal direction="scale" className="bg-amber-950/30 border border-amber-500/30 rounded-3xl p-8 text-center text-amber-100">
          <Lock className="w-8 h-8 mx-auto mb-2" />
          Сначала сдайте предыдущий этап.
        </Reveal>
      ) : mode === "reading" ? (
        <Reveal direction="up" className="space-y-4">
          {questions.length > 0 && (
            <button type="button" onClick={startExam}
              className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white text-sm py-3.5 px-6 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:opacity-95 transition">
              <Sparkles className="w-4 h-4" />
              {progress[active].attempts > 0
                ? `Перепройти тест (${questions.length} вопр., проходной ${passScore}/${totalScore})`
                : `Перейти к тесту (${questions.length} вопр., проходной ${passScore}/${totalScore})`}
            </button>
          )}
          {material ? (
            <RichTrainingMaterialCard title={STAGES.find(s => s.key === active)?.title}>
              {material}
            </RichTrainingMaterialCard>
          ) : (
            <div className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-6">
              <p className="text-slate-400 text-xs">Материалы по этапу ещё не подготовлены работодателем.</p>
            </div>
          )}
          {questions.length > 0 ? (
            <button type="button" onClick={startExam}
              className="w-full bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white text-sm py-3.5 px-6 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:opacity-95 transition">
              <Sparkles className="w-4 h-4" />
              {progress[active].attempts > 0
                ? `Перепройти тест (${questions.length} вопр., проходной ${passScore}/${totalScore})`
                : `Перейти к тесту (${questions.length} вопр., проходной ${passScore}/${totalScore})`}
            </button>
          ) : (
            <div className="w-full bg-white/5 border border-white/10 text-slate-300 text-xs py-3 px-4 rounded-xl text-center">
              Тест по этому этапу ещё не сформирован работодателем.
            </div>
          )}
        </Reveal>
      ) : mode === "exam" ? (
        <Reveal direction="up" className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Тест: {STAGES.find(s => s.key === active)?.title}</h3>
          {examQuestions.map((q, i) => (
            <Reveal key={q.id} direction="left" delay={i * 60} className="bg-black/25 border border-white/5 rounded-xl p-4 space-y-2">
              <div className="text-[11px] text-[#E7C768] font-bold">Вопрос {i + 1} • {q.points} б.</div>
              <div className="text-sm text-white">{q.question}</div>
              {q.kind === "choice" ? (
                <div className="space-y-1.5">
                  {(q.options || []).map((o, oi) => (
                    <label key={oi} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border ${
                      answers[q.id] === o.text ? "bg-[#E7C768]/15 border-[#E7C768]" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === o.text}
                        onChange={() => setAnswers(a => ({ ...a, [q.id]: o.text }))} className="mt-1" />
                      <span className="text-xs text-slate-100">{o.text}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea rows={3} value={answers[q.id] || ""}
                  onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Ваш развёрнутый ответ…"
                  className="w-full bg-[#17344F] text-xs text-white p-2.5 rounded-lg border border-white/10 focus:outline-[#E7C768]" />
              )}
            </Reveal>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("reading")} className="flex-1 bg-white/10 text-white text-sm py-2.5 rounded-xl">← К материалу</button>
            <button type="button" onClick={submit} disabled={checking}
              className="flex-[2] bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {checking ? <><RefreshCw className="w-4 h-4 animate-spin" /> Проверяем…</> : "Сдать тест"}
            </button>
          </div>
          {checking && <LoadingPhrase entity="training" />}
        </Reveal>
      ) : (
        <Reveal direction="scale" className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-6 space-y-4">
          <CandidateTrainingStageReport
            passed={!!lastResult?.passed}
            score={Number(lastResult?.score || 0)}
            max={totalScore}
            passScore={passScore}
            summary={candidateSummary}
            perQuestionLegacy={(lastResult?.per_question || []).map((pq: any) => ({
              ...pq,
              question: questions.find((qq) => qq.id === pq.id)?.question,
            }))}
          />
          <div className="flex gap-2">
            {!lastResult?.passed && (
              <button type="button" onClick={() => { setLastResult(null); startExam(); }}
                className="flex-1 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 rounded-xl font-bold">
                Перепройти тест
              </button>
            )}
            <button type="button" onClick={() => setMode("reading")} className="flex-1 bg-white/10 text-white text-sm py-2.5 rounded-xl">К материалу</button>
            {lastResult?.passed && (() => {
              const idx = STAGES.findIndex(s => s.key === active);
              const next = STAGES[idx + 1];
              if (!next) return <div className="flex-1 text-center text-[#E7C768] text-sm font-bold py-2.5">🎓 Курс пройден полностью!</div>;
              return (
                <button type="button" onClick={() => setActive(next.key)}
                  className="flex-1 bg-[#E7C768] text-[#17344F] text-sm py-2.5 rounded-xl font-bold">
                  Следующий этап → {next.icon}
                </button>
              );
            })()}
          </div>
        </Reveal>
      )}
      <VacancyPausedDialog open={pausedOpen} projectId={projectId} onClose={() => setPausedOpen(false)} />
    </div>
  );
}