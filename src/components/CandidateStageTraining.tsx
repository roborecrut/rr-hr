import { useEffect, useMemo, useState } from "react";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { BookOpen, CheckCircle2, Lock, RefreshCw, Sparkles, GraduationCap, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import Reveal from "@/components/Reveal";

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

  const callEdge = async <T,>(fn: string, body: any): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as any)?.error || `http_${res.status}`);
    return json as T;
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
        task: () => callEdge<any>("ai-check-stage-answers", {
          candidate_id: candidateId, project_id: projectId, stage: active, answers: payload,
        }),
      });
      if (!r) return;
      // Списание лимита у работодателя — только после получения первой оценки от ИИ
      // по первому профессиональному тесту. RPC spend_pack идемпотентен по idem_key,
      // повторные тесты ничего не списывают.
      if (active === "professional") {
        try {
          await supabase.rpc("spend_pack", { _candidate: candidateId, _kind: "training" });
        } catch (e) {
          console.warn("spend_pack(training) failed", e);
        }
      }
      setLastResult({ score: r.score, passed: r.passed, per_question: r.per_question });
      setProgress(p => ({ ...p, [active]: { passed: r.passed || p[active].passed, best: Math.max(p[active].best, r.score), attempts: r.attempts } }));
      setMode("result");
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    } catch (e: any) {
      alert("Ошибка проверки: " + (e?.message || ""));
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
      <div className="bg-[#1E4468]/30 border border-white/10 rounded-3xl p-5">
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
      </div>

      {loading ? (
        <div className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-[#E7C768] mx-auto mb-2" />
          <LoadingPhrase entity="training" />
        </div>
      ) : !canEnter(active) ? (
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-3xl p-8 text-center text-amber-100">
          <Lock className="w-8 h-8 mx-auto mb-2" />
          Сначала сдайте предыдущий этап.
        </div>
      ) : mode === "reading" ? (
        <div className="space-y-4">
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
        </div>
      ) : mode === "exam" ? (
        <div className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Тест: {STAGES.find(s => s.key === active)?.title}</h3>
          {examQuestions.map((q, i) => (
            <div key={q.id} className="bg-black/25 border border-white/5 rounded-xl p-4 space-y-2">
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
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("reading")} className="flex-1 bg-white/10 text-white text-sm py-2.5 rounded-xl">← К материалу</button>
            <button type="button" onClick={submit} disabled={checking}
              className="flex-[2] bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-sm py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {checking ? <><RefreshCw className="w-4 h-4 animate-spin" /> Проверяем…</> : "Сдать тест"}
            </button>
          </div>
          {checking && <LoadingPhrase entity="training" />}
        </div>
      ) : (
        <div className="bg-[#1E4468]/20 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className={`p-4 rounded-2xl flex items-center gap-3 ${lastResult?.passed ? "bg-emerald-900/30 border border-emerald-500/40" : "bg-amber-900/30 border border-amber-500/40"}`}>
            {lastResult?.passed ? <CheckCircle2 className="w-8 h-8 text-emerald-400" /> : <AlertTriangle className="w-8 h-8 text-amber-400" />}
            <div className="flex-1">
              <div className="text-base font-bold text-white">
                {lastResult?.passed ? "Этап сдан!" : "Не сдан — попробуйте ещё раз"}
              </div>
              <div className="text-xs text-slate-300">Ваш балл: {lastResult?.score} / {totalScore} (проходной {passScore})</div>
            </div>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {(lastResult?.per_question || []).map((pq: any, i: number) => {
              const q = questions.find(qq => qq.id === pq.id);
              return (
                <div key={pq.id} className="bg-black/20 border border-white/5 rounded-lg p-3 text-xs">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Вопрос {i + 1}</span><span className={pq.score === pq.max ? "text-emerald-400" : pq.score > 0 ? "text-amber-300" : "text-rose-400"}>{pq.score}/{pq.max}</span>
                  </div>
                  <div className="text-white mt-1">{q?.question}</div>
                  {pq.comment && <div className="text-slate-400 mt-1 italic">{pq.comment}</div>}
                </div>
              );
            })}
          </div>
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
        </div>
      )}
    </div>
  );
}