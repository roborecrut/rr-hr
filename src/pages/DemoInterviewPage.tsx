/**
 * Free public demo of the AI interview flow.
 * Stages run REVERSED for engagement: 1. Situations → 2. Checklist → 3. Resume screening.
 * No auth, no DB persistence, no employer billing — progress lives in localStorage.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Briefcase, ArrowRight, ChevronRight, Loader, Send, RefreshCw, Award, MessageSquare, ListChecks, FileText, Sparkles, Rocket, X, Menu, Chrome } from "lucide-react";
import RRImage from "@/components/RRImage";
import Mascot from "@/components/Mascot";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import AuthModal from "@/components/AuthModal";
import { fetchJobTitles, type JobTitle } from "@/lib/jobTitles";
import { aiRestart } from "@/lib/aiClient";
import { useAIWait } from "@/components/AIWaitProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  loadDemoState, saveDemoState, clearDemoState,
  loadCachedTemplate, saveCachedTemplate, makeInitialState,
  type DemoState, type DemoTemplate, type DemoStage,
} from "@/lib/demoSession";

const FN = (n: string) => `https://rjhtauzookkvlipvqpvr.supabase.co/functions/v1/${n}`;

async function call(fn: string, body: any) {
  const res = await fetch(FN(fn), {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) throw new Error(j?.error || `HTTP ${res.status}`);
  return j;
}

const STAGE_ORDER: DemoStage[] = ["situations", "checklist", "resume"];
const STAGE_LABEL: Record<DemoStage, string> = {
  pick: "Выбор",
  restart: "Подготовка",
  situations: "Ситуация",
  checklist: "Чек-лист",
  resume: "Резюме",
  done: "Итог",
};

export default function DemoInterviewPage() {
  const navigate = useNavigate();
  const { run: aiWaitRun } = useAIWait();

  const [state, setState] = useState<DemoState | null>(() => loadDemoState());
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prepError, setPrepError] = useState("");
  const preparingRef = useRef(false);

  // Load catalog
  useEffect(() => {
    (async () => {
      const rows = await fetchJobTitles(true);
      setTitles(rows);
    })();
  }, []);

  // Persist state
  useEffect(() => { if (state) saveDemoState(state); }, [state]);

  // Auto-prepare template when entering the restart stage
  useEffect(() => {
    if (!state || state.stage !== "restart" || state.template || preparingRef.current) return;
    preparingRef.current = true;
    setPrepError("");

    (async () => {
      try {
        // 1) reset AI dialog (overlay shows automatically)
        aiRestart().catch(() => {});

        // 2) cached template?
        const cached = loadCachedTemplate(state.titleId);
        if (cached) {
          setState(s => s ? { ...s, template: cached, stage: "situations" } : s);
          return;
        }

        // 3) fetch vacancy_text from job_titles (best-effort, public read)
        let vacancyText = "";
        try {
          const { data } = await supabase.from("job_titles").select("field_templates").eq("id", state.titleId).maybeSingle();
          const ft = (data as any)?.field_templates || {};
          vacancyText = String(ft.vacancy_text || "").slice(0, 5000);
        } catch { /* ignore */ }

        // 4) ask AI for the demo bundle
        const r = await call("ai-demo-prepare", { title: state.title, vacancy_text: vacancyText });
        const tpl: DemoTemplate = {
          titleId: state.titleId,
          title: state.title,
          vacancy_text: vacancyText,
          situations: r.situations || [],
          checklist: r.checklist || [],
          resume_criteria: r.resume_criteria || "",
        };
        saveCachedTemplate(tpl);
        setState(s => s ? { ...s, template: tpl, stage: "situations" } : s);
      } catch (e: any) {
        setPrepError(e?.message || "Не удалось подготовить демо. Попробуйте ещё раз.");
      } finally {
        preparingRef.current = false;
      }
    })();
  }, [state?.stage, state?.titleId, state?.template]);

  const startWithTitle = (t: JobTitle) => {
    const s = makeInitialState(t.id, t.title);
    setState(s);
    saveDemoState(s);
  };

  const restartAll = () => {
    clearDemoState();
    setState(null);
    setPrepError("");
    preparingRef.current = false;
  };

  const submitSituations = async () => {
    if (!state?.template) return;
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка ролевых ответов",
        task: () => call("ai-demo-grade-situations", { title: state.title, situations: state.template!.situations, answers: state.sitAnswers }),
      });
      if (!r) return;
      setState(s => s ? { ...s, sitResult: { score: r.score, items: r.items, advice: r.advice } } : s);
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  const submitChecklist = async () => {
    if (!state?.template) return;
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Проверка чек-листа",
        task: () => call("ai-demo-grade-checklist", { title: state.title, questions: state.template!.checklist, answers: state.checkAnswers }),
      });
      if (!r) return;
      setState(s => s ? { ...s, checkResult: { score: r.score, feedback: r.feedback } } : s);
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  const submitResume = async () => {
    if (!state?.template) return;
    if (!state.resumeText.trim() || state.resumeText.trim().length < 50) { alert("Введите резюме (минимум 50 символов)"); return; }
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка резюме",
        task: () => call("ai-demo-screen-resume", {
          title: state.title, vacancy_text: state.template!.vacancy_text || "",
          criteria_md: state.template!.resume_criteria, resume_text: state.resumeText,
        }),
      });
      if (!r) return;
      const resumeResult = r.result;
      const scores = [state.sitResult?.score, state.checkResult?.score, resumeResult?.score].filter((x): x is number => typeof x === "number");
      const finalScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      setState(s => s ? { ...s, resumeResult, finalScore, stage: "done" } : s);
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  const filteredTitles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter(t => t.title.toLowerCase().includes(q));
  }, [titles, search]);

  return (
    <div className="bg-gradient-to-b from-[#17344F] to-[#265582] min-h-screen text-white font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#17344F]/95 backdrop-blur-md border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage src="https://rjhtauzookkvlipvqpvr.supabase.co/storage/v1/object/public/Logos/RR-Logo.png" w={40} alt="RR Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">Робот Рекрутер</span>
              <span className="text-[10px] font-mono tracking-wider uppercase text-slate-300">Демо-интервью</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-2 text-sm font-semibold">
            <button onClick={() => navigate("/")} className="px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10">Главная</button>
            <button className="px-3 py-2 rounded-xl text-[#E7C768] bg-white/10 border border-[#E7C768]/20">Демо-интервью</button>
          </nav>
          <button onClick={() => setAuthOpen(true)} className="hidden md:inline-flex items-center gap-2 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-sm px-4 py-2 rounded-xl shadow-lg">
            <Chrome className="w-4 h-4" /> Войти / Регистрация
          </button>
          <button onClick={() => setMobileMenuOpen(o => !o)} className="md:hidden p-2 text-white">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            <button onClick={() => { navigate("/"); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl text-slate-200 hover:bg-white/10">Главная</button>
            <button onClick={() => { setAuthOpen(true); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] font-bold">Войти / Регистрация</button>
          </div>
        )}
      </header>

      <main className="brand-editor max-w-5xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 flex-1 space-y-6">
        {/* Step indicator */}
        {state && state.stage !== "pick" && (
          <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
            <div className="text-xs text-slate-300">Вакансия:</div>
            <div className="text-sm font-bold text-[#E7C768]">{state.title}</div>
            <button onClick={restartAll} className="ml-auto text-[11px] text-slate-300 hover:text-white underline">Сменить должность</button>
            <div className="w-full flex items-center gap-2 mt-2">
              {STAGE_ORDER.map((s, i) => {
                const done = state.stage === "done" || STAGE_ORDER.indexOf(state.stage) > i;
                const active = state.stage === s;
                return (
                  <React.Fragment key={s}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${active ? "bg-[#E7C768] text-[#17344F]" : done ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30" : "bg-white/5 text-slate-300 border border-white/10"}`}>
                      <span>{i + 1}</span> {STAGE_LABEL[s]}
                    </div>
                    {i < STAGE_ORDER.length - 1 && <div className="flex-1 h-px bg-white/10" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* PICK STAGE */}
        {(!state || state.stage === "pick") && (
          <PickStage
            titles={filteredTitles}
            search={search}
            onSearch={setSearch}
            onPick={startWithTitle}
            totalCount={titles.length}
          />
        )}

        {/* RESTART STAGE */}
        {state && state.stage === "restart" && (
          <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-8 text-center space-y-5">
            <div className="flex justify-center">
              <Mascot state="recruitment" size="lg" speechBubble={`Готовлю интервью для "${state.title}"…`} />
            </div>
            {prepError ? (
              <div className="space-y-3">
                <p className="text-amber-300 text-sm">{prepError}</p>
                <button onClick={() => { preparingRef.current = false; setPrepError(""); setState(s => s ? { ...s } : s); }} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">
                  Попробовать снова
                </button>
              </div>
            ) : (
              <>
                <LoadingPhrase entity="interview" />
                <p className="text-xs text-slate-300">Это займёт ~20-40 секунд — ИИ генерирует ситуации, чек-лист и критерии резюме.</p>
              </>
            )}
          </div>
        )}

        {/* SITUATIONS */}
        {state && state.stage === "situations" && state.template && (
          <StageCard
            icon={<MessageSquare className="w-5 h-5"/>}
            title="Этап 1 · Ролевая ситуация"
            subtitle="Представьте, что ситуация происходит прямо сейчас. Напишите, что и как вы скажете/сделаете."
          >
            {state.sitResult ? (
              <div className="space-y-3">
                <ScoreBig score={state.sitResult.score} />
                {state.sitResult.advice && <p className="text-sm text-white/90 italic">{state.sitResult.advice}</p>}
                {state.sitResult.items.map(it => (
                  <div key={it.id} className="bg-black/30 border border-white/10 rounded-xl p-3">
                    <div className="text-xs text-[#E7C768] font-bold">{it.id}: {it.score}/100</div>
                    <div className="text-sm text-slate-200 mt-1">{it.feedback}</div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={() => setState(s => s ? { ...s, stage: "checklist" } : s)} className="btn-brand-gold inline-flex items-center gap-2">
                    Перейти к чек-листу <ArrowRight className="w-4 h-4"/>
                  </button>
                  <button onClick={() => setState(s => s ? { ...s, sitAnswers: {}, sitResult: null } : s)} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1">
                    <RefreshCw className="w-3 h-3"/> Пересдать
                  </button>
                </div>
              </div>
            ) : (
              <>
                {state.template.situations.map((s, i) => (
                  <div key={s.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="text-sm text-[#E7C768] font-bold">Ситуация #{i+1}: {s.title}</div>
                    <div className="text-sm text-slate-200 whitespace-pre-wrap">{s.brief}</div>
                    <textarea
                      value={state.sitAnswers[s.id] || ""}
                      onChange={e => setState(st => st ? { ...st, sitAnswers: { ...st.sitAnswers, [s.id]: e.target.value } } : st)}
                      rows={4}
                      placeholder="Ваш ответ..."
                      className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm"
                    />
                  </div>
                ))}
                {busy && <LoadingPhrase entity="interview" />}
                <button disabled={busy} onClick={submitSituations} className="btn-brand-gold inline-flex items-center gap-2 disabled:opacity-60">
                  {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Отправить на оценку
                </button>
              </>
            )}
          </StageCard>
        )}

        {/* CHECKLIST */}
        {state && state.stage === "checklist" && state.template && (
          <StageCard
            icon={<ListChecks className="w-5 h-5"/>}
            title="Этап 2 · Чек-лист профессии"
            subtitle="Несколько проверочных вопросов на знания и опыт."
          >
            {state.checkResult ? (
              <div className="space-y-3">
                <ScoreBig score={state.checkResult.score} />
                {state.checkResult.feedback?.summary && <p className="text-sm text-white/90 italic">{state.checkResult.feedback.summary}</p>}
                {(state.checkResult.feedback?.strengths?.length || state.checkResult.feedback?.gaps?.length) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {state.checkResult.feedback.strengths?.length ? (
                      <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3">
                        <div className="text-[10px] uppercase font-bold text-emerald-300">Сильные стороны</div>
                        <ul className="list-disc pl-5 text-xs text-emerald-100 mt-1 space-y-0.5">
                          {state.checkResult.feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {state.checkResult.feedback.gaps?.length ? (
                      <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
                        <div className="text-[10px] uppercase font-bold text-amber-300">Что улучшить</div>
                        <ul className="list-disc pl-5 text-xs text-amber-100 mt-1 space-y-0.5">
                          {state.checkResult.feedback.gaps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {state.checkResult.feedback?.items?.length ? (
                  <details className="bg-black/30 border border-white/10 rounded-xl">
                    <summary className="cursor-pointer p-3 text-xs font-bold text-[#E7C768]">Подробный разбор по каждому вопросу</summary>
                    <div className="p-3 space-y-2">
                      {state.checkResult.feedback.items.map((it: any) => (
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
                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={() => setState(s => s ? { ...s, stage: "resume" } : s)} className="btn-brand-gold inline-flex items-center gap-2">
                    Перейти к резюме <ArrowRight className="w-4 h-4"/>
                  </button>
                  <button onClick={() => setState(s => s ? { ...s, checkAnswers: {}, checkResult: null } : s)} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1">
                    <RefreshCw className="w-3 h-3"/> Пересдать
                  </button>
                </div>
              </div>
            ) : (
              <>
                {state.template.checklist.map((q, i) => (
                  <div key={q.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="text-sm text-white font-semibold">#{i+1}. {q.question}</div>
                    {q.kind === "choice" ? (
                      <div className="space-y-1">
                        {(q.options || []).map((opt, oi) => (
                          <label key={oi} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer hover:bg-white/5 rounded px-2 py-1">
                            <input
                              type="radio" name={q.id}
                              checked={state.checkAnswers[q.id] === opt}
                              onChange={() => setState(st => st ? { ...st, checkAnswers: { ...st.checkAnswers, [q.id]: opt } } : st)}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={state.checkAnswers[q.id] || ""}
                        onChange={e => setState(st => st ? { ...st, checkAnswers: { ...st.checkAnswers, [q.id]: e.target.value } } : st)}
                        rows={3}
                        placeholder="Ваш ответ..."
                        className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm"
                      />
                    )}
                  </div>
                ))}
                {busy && <LoadingPhrase entity="interview" />}
                <button disabled={busy} onClick={submitChecklist} className="btn-brand-gold inline-flex items-center gap-2 disabled:opacity-60">
                  {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Отправить ответы
                </button>
              </>
            )}
          </StageCard>
        )}

        {/* RESUME */}
        {state && state.stage === "resume" && state.template && (
          <StageCard
            icon={<FileText className="w-5 h-5"/>}
            title="Этап 3 · Скрининг резюме"
            subtitle="Вставьте текст своего резюме — ИИ оценит соответствие должности."
          >
            {state.template.resume_criteria && (
              <details className="bg-black/20 border border-white/10 rounded-xl">
                <summary className="cursor-pointer p-3 text-xs font-bold text-[#E7C768]">Критерии оценки (что ищет ИИ)</summary>
                <div className="p-3 text-xs text-slate-200 whitespace-pre-wrap">{state.template.resume_criteria}</div>
              </details>
            )}
            <textarea
              value={state.resumeText}
              onChange={e => setState(s => s ? { ...s, resumeText: e.target.value } : s)}
              rows={12} maxLength={20000}
              placeholder="Вставьте текст вашего резюме (минимум 50 символов)..."
              className="w-full bg-black/30 text-white border border-white/10 rounded-xl px-3 py-2 text-sm font-mono"
            />
            {busy && <LoadingPhrase entity="interview" />}
            <button disabled={busy} onClick={submitResume} className="btn-brand-gold inline-flex items-center gap-2 disabled:opacity-60">
              {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Award className="w-4 h-4"/>} Завершить демо
            </button>
          </StageCard>
        )}

        {/* DONE */}
        {state && state.stage === "done" && state.template && (
          <DoneStage state={state} onRestart={restartAll} onSignup={() => setAuthOpen(true)} />
        )}
      </main>

      <footer className="bg-[#17344F] border-t-2 border-[#E7C768] py-8 text-center text-xs text-slate-300">
        © 2026 Робот Рекрутер RR · <button onClick={() => navigate("/")} className="underline hover:text-[#E7C768]">На главную</button>
      </footer>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} intent="employer" />
    </div>
  );
}

function PickStage({ titles, search, onSearch, onPick, totalCount }: {
  titles: JobTitle[]; search: string; onSearch: (v: string) => void; onPick: (t: JobTitle) => void; totalCount: number;
}) {
  return (
    <div className="space-y-6">
      {/* Promo header */}
      <div className="bg-[#1D3E5E]/60 border border-white/10 rounded-3xl p-6 md:p-8 grid md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2 space-y-3">
          <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 rounded-full px-3 py-1.5">
            <Sparkles className="w-4 h-4 text-[#E7C768]" />
            <span className="text-[11px] font-semibold text-[#E7C768] uppercase tracking-wider">Бесплатное демо · без регистрации</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight">
            Попробуй интервью с <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">Роботом Рекрутером</span>
          </h1>
          <p className="text-sm text-slate-200">
            Выбери должность — ИИ сгенерирует ролевую ситуацию, чек-лист и оценит твоё резюме. Без регистрации, прямо в браузере.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="bg-white/5 border border-white/10 px-2 py-1 rounded-md">1. Ситуация</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#E7C768] mt-1.5" />
            <span className="bg-white/5 border border-white/10 px-2 py-1 rounded-md">2. Чек-лист</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#E7C768] mt-1.5" />
            <span className="bg-white/5 border border-white/10 px-2 py-1 rounded-md">3. Резюме</span>
          </div>
        </div>
        <div className="flex justify-center">
          <Mascot state="greeting" size="md" />
        </div>
      </div>

      {/* Search */}
      <div className="bg-[#1D3E5E]/40 border border-white/10 rounded-3xl p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-2"><Briefcase className="w-5 h-5"/> Выбери должность</h2>
          <div className="text-xs text-slate-300 font-mono">{titles.length} из {totalCount}</div>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text" value={search} onChange={e => onSearch(e.target.value)}
            placeholder="Поиск: Менеджер по продажам, Бухгалтер, SMM..."
            className="w-full bg-[#17344F]/60 text-sm text-white pl-10 pr-4 py-3 rounded-2xl border border-white/15 focus:outline-none focus:border-[#E7C768] transition"
          />
        </div>
        {titles.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Подходящих должностей не нашлось. Попробуйте другой запрос.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto pr-2">
            {titles.map(t => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                className="text-left bg-[#1D3E5E]/60 hover:bg-[#1D3E5E]/90 hover:border-[#E7C768] border border-white/5 rounded-xl p-3 transition flex items-center justify-between group"
              >
                <div className="truncate pr-2">
                  <div className="text-xs font-bold text-slate-100 truncate">{t.title}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.is_basic ? "базовая модель" : "✨ пользовательская"}</div>
                </div>
                <div className="shrink-0 bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white p-1.5 rounded-lg group-hover:scale-110 transition">
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StageCard({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1E4468]/40 border border-white/10 rounded-3xl p-5 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#E7C768]/20 flex items-center justify-center text-[#E7C768]">{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-300">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ScoreBig({ score }: { score: number }) {
  const color = score >= 75 ? "text-emerald-300" : score >= 50 ? "text-amber-300" : "text-red-300";
  return <div className={`text-4xl font-extrabold ${color}`}>{score}/100</div>;
}

function DoneStage({ state, onRestart, onSignup }: { state: DemoState; onRestart: () => void; onSignup: () => void }) {
  const navigate = useNavigate();
  const final = state.finalScore ?? 0;
  return (
    <section className="bg-[#1E4468]/40 border border-[#E7C768]/40 rounded-3xl p-6 md:p-8 space-y-6">
      <div className="text-center space-y-3">
        <Award className="w-14 h-14 text-[#E7C768] mx-auto" />
        <div className="text-5xl font-extrabold text-white">{final}/100</div>
        <p className="text-sm text-slate-200">Итоговая оценка по 3 этапам демо-интервью для <b className="text-[#E7C768]">«{state.title}»</b>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile label="Ситуация" score={state.sitResult?.score ?? null} />
        <Tile label="Чек-лист" score={state.checkResult?.score ?? null} />
        <Tile label="Резюме" score={state.resumeResult?.score ?? null} />
      </div>

      {state.resumeResult && (
        <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="text-xs font-bold text-[#E7C768] uppercase">Комментарий ИИ по резюме</div>
          <p className="text-sm text-white whitespace-pre-wrap">{state.resumeResult.summary}</p>
          {state.resumeResult.strengths?.length > 0 && (
            <div><div className="text-[11px] text-emerald-300 font-bold uppercase">Сильные стороны</div>
              <ul className="list-disc pl-5 text-xs text-slate-200">{state.resumeResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          )}
          {state.resumeResult.gaps?.length > 0 && (
            <div><div className="text-[11px] text-amber-300 font-bold uppercase">Что улучшить</div>
              <ul className="list-disc pl-5 text-xs text-slate-200">{state.resumeResult.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          )}
        </div>
      )}

      {/* CTA — рекламный блок */}
      <div className="bg-gradient-to-br from-[#E7C768]/15 to-[#D99E41]/10 border-2 border-[#E7C768]/40 rounded-3xl p-6 text-center space-y-4">
        <h3 className="text-2xl font-bold text-[#E7C768]">Хочешь так же — у себя?</h3>
        <p className="text-sm text-white max-w-xl mx-auto">
          Создай свою систему найма за пару кликов: лендинг вакансии, ИИ-интервью под вашу должность и систему обучения. Бонус +1000 RR при регистрации.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button onClick={onSignup} className="cursor-pointer bg-gradient-to-r from-[#FF1A1A] to-[#E54C00] text-white font-bold text-base px-6 py-3.5 rounded-xl shadow-xl hover:-translate-y-0.5 transition inline-flex items-center justify-center gap-2">
            <Rocket className="w-5 h-5" /> Создать свою систему найма
          </button>
          <button onClick={onRestart} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-5 py-3.5 rounded-xl inline-flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Попробовать другую должность
          </button>
          <button onClick={() => navigate("/")} className="text-slate-300 hover:text-white text-sm px-3 py-3.5">
            На главную
          </button>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, score }: { label: string; score: number | null }) {
  const v = score ?? 0;
  const color = v >= 75 ? "text-emerald-300" : v >= 50 ? "text-amber-300" : "text-red-300";
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-4 text-center">
      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold ${color} mt-1`}>{score == null ? "—" : `${score}/100`}</div>
    </div>
  );
}