/**
 * Employer-facing structured overall report (Phase 4).
 *
 * Reads the `employer_overall_feedback` jsonb saved by the v2 RPC and
 * renders only the sections present in the payload. Distinguishes the
 * mathematical average (overall_score) from the AI fit score (ai_fit_score).
 *
 * Empty sections are hidden — the spec forbids "wall of text" output.
 * Employer-only sections (risks, red_flags, employer_wishes_alignment,
 * recommendation, interview_focus) live here and ONLY here.
 */
import React from "react";

type AnyObj = Record<string, any>;

function toneFor(score: number | null | undefined): { cls: string; bg: string } {
  if (score == null || !Number.isFinite(Number(score))) {
    return { cls: "text-slate-200", bg: "bg-slate-500/10 border-slate-400/20" };
  }
  const n = Number(score);
  if (n >= 80) return { cls: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-400/30" };
  if (n >= 60) return { cls: "text-amber-300", bg: "bg-amber-500/10 border-amber-400/30" };
  return { cls: "text-rose-300", bg: "bg-rose-500/10 border-rose-400/30" };
}

const SectionTitle = ({ children, color = "text-[#E7C768]" }: { children: React.ReactNode; color?: string }) => (
  <div className={`text-[10px] font-mono uppercase tracking-wider ${color} mb-1.5`}>{children}</div>
);

export default function EmployerOverallReport({
  fitScore, overallScore, employerFeedback,
}: {
  fitScore: number | null | undefined;
  overallScore: number | null | undefined;
  employerFeedback: AnyObj | null | undefined;
}) {
  if (!employerFeedback || typeof employerFeedback !== "object") {
    return (
      <div
        data-testid="overall-employer-empty"
        className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-300 space-y-1"
      >
        <div>Общая AI-оценка ещё не сформирована.</div>
        <div className="text-xs text-slate-400">
          Нажмите «Пересчитать AI-оценку», чтобы запустить совокупный анализ кандидата.
        </div>
      </div>
    );
  }
  const f = employerFeedback;
  const fitTone = toneFor(fitScore ?? null);
  const avgTone = toneFor(overallScore ?? null);

  const stageSummary: any[] = Array.isArray(f.stage_summary) ? f.stage_summary : [];
  const matches: any[] = Array.isArray(f.matches) ? f.matches : [];
  const partial = matches.filter((m) => m.degree === "частично");
  const full = matches.filter((m) => m.degree === "полностью");
  const gaps: any[] = Array.isArray(f.gaps) ? f.gaps : [];
  const risks: any[] = Array.isArray(f.risks) ? f.risks : [];
  const redFlags: any[] = Array.isArray(f.red_flags) ? f.red_flags : [];
  const wishes: any[] = Array.isArray(f.employer_wishes_alignment) ? f.employer_wishes_alignment : [];
  const strengths: any[] = Array.isArray(f.strengths) ? f.strengths : [];
  const interview: any[] = Array.isArray(f.interview_focus) ? f.interview_focus : [];
  const missing: any[] = Array.isArray(f.missing_sections) ? f.missing_sections : [];

  return (
    <div data-testid="overall-employer-report" className="space-y-4">
      {/* Top scoreboard — explicit two different metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div data-testid="ai-fit-score-card" className={`rounded-2xl p-4 border ${fitTone.bg}`}>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
            AI-оценка соответствия вакансии
          </div>
          <div className={`text-4xl font-mono font-black ${fitTone.cls}`}>
            {fitScore != null ? `${Math.round(Number(fitScore))}/100` : "—"}
          </div>
          <div className="text-[12px] text-slate-300 mt-1">
            Экспертный вывод ИИ по совокупности этапов
          </div>
        </div>
        <div data-testid="avg-stage-score-card" className={`rounded-2xl p-4 border ${avgTone.bg}`}>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
            Средний балл этапов
          </div>
          <div className={`text-4xl font-mono font-black ${avgTone.cls}`}>
            {overallScore != null ? `${Math.round(Number(overallScore))}/100` : "—"}
          </div>
          <div className="text-[12px] text-slate-300 mt-1">
            Математическое среднее по пройденным этапам
          </div>
        </div>
      </div>

      {/* Vердикт / confidence / completeness */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl p-3 bg-black/20 border border-white/10">
          <SectionTitle color="text-slate-300">Вердикт</SectionTitle>
          <div className="text-[14px] font-bold text-white">{f.verdict || "—"}</div>
        </div>
        <div className="rounded-xl p-3 bg-black/20 border border-white/10">
          <SectionTitle color="text-slate-300">Уверенность ИИ</SectionTitle>
          <div className="text-[14px] font-bold text-white">
            {f.confidence != null ? `${Math.round(Number(f.confidence))}/100` : "—"}
          </div>
        </div>
        <div className="rounded-xl p-3 bg-black/20 border border-white/10">
          <SectionTitle color="text-slate-300">Полнота данных</SectionTitle>
          <div className="text-[14px] font-bold text-white">
            {f.data_completeness != null ? `${Math.round(Number(f.data_completeness))}/100` : "—"}
          </div>
        </div>
      </div>

      {f.executive_summary && (
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
          <SectionTitle>Краткий управленческий вывод</SectionTitle>
          <div className="text-[14px] text-white/95 leading-relaxed whitespace-pre-wrap">
            {f.executive_summary}
          </div>
        </div>
      )}

      {stageSummary.length > 0 && (
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
          <SectionTitle>Результаты по этапам</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {stageSummary.map((st: any, i: number) => {
              const t = toneFor(st.score);
              return (
                <div key={i} className={`rounded-xl p-3 border ${t.bg}`}>
                  <div className="flex justify-between items-baseline gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-200">{st.stage}</div>
                    <div className={`text-sm font-mono font-black ${t.cls}`}>
                      {st.score != null ? `${Math.round(Number(st.score))}/100` : "—"}
                    </div>
                  </div>
                  <div className="text-[13px] text-white/95 mt-1">{st.conclusion}</div>
                  {Array.isArray(st.key_evidence) && st.key_evidence.length > 0 && (
                    <ul className="text-[12px] text-slate-300 list-disc pl-5 mt-1 space-y-0.5">
                      {st.key_evidence.map((e: string, j: number) => <li key={j}>{e}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {full.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3">
          <SectionTitle color="text-emerald-300">Соответствует требованиям</SectionTitle>
          <ul className="text-[13px] text-white space-y-1.5">
            {full.map((m: any, i: number) => (
              <li key={i}><b>{m.criterion}</b>{m.evidence ? <> — <span className="text-slate-200">{m.evidence}</span></> : null}</li>
            ))}
          </ul>
        </div>
      )}

      {partial.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
          <SectionTitle color="text-amber-300">Частично подтверждено</SectionTitle>
          <ul className="text-[13px] text-white space-y-1.5">
            {partial.map((m: any, i: number) => (
              <li key={i}><b>{m.criterion}</b>{m.evidence ? <> — <span className="text-slate-200">{m.evidence}</span></> : null}</li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-400/30 rounded-xl p-3">
          <SectionTitle color="text-rose-300">Не подтверждено или расходится</SectionTitle>
          <ul className="text-[13px] text-white space-y-1.5">
            {gaps.map((g: any, i: number) => (
              <li key={i}>
                <b>{g.criterion}</b> — {g.finding}
                {g.impact && <div className="text-[12px] text-slate-300">Влияние: {g.impact}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {wishes.length > 0 && (
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
          <SectionTitle>Соответствие пожеланиям работодателя</SectionTitle>
          <ul className="text-[13px] text-white space-y-1.5">
            {wishes.map((w: any, i: number) => (
              <li key={i}>
                <b>{w.wish}</b> — <span className="text-slate-200">{w.status}</span>
                {w.evidence && <div className="text-[12px] text-slate-300">{w.evidence}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {strengths.length > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl p-3">
          <SectionTitle color="text-emerald-300">Сильные стороны</SectionTitle>
          <ul className="text-[13px] text-white list-disc pl-5 space-y-1">
            {strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
          <SectionTitle color="text-amber-300">Риски</SectionTitle>
          <ul className="text-[13px] text-white space-y-2">
            {risks.map((r: any, i: number) => (
              <li key={i}>
                <div><b>{r.title}</b> · <span className="text-amber-200">{r.severity}</span></div>
                <div className="text-slate-200">{r.evidence}</div>
                {r.impact && <div className="text-[12px] text-slate-300">Влияние: {r.impact}</div>}
                {r.how_to_verify && <div className="text-[12px] text-slate-300">Как проверить: {r.how_to_verify}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {redFlags.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-400/40 rounded-xl p-3">
          <SectionTitle color="text-rose-300">Красные флаги</SectionTitle>
          <ul className="text-[13px] text-white space-y-2">
            {redFlags.map((r: any, i: number) => (
              <li key={i}>
                <div><b>{r.title}</b> · <span className="text-rose-200">{r.severity}</span></div>
                <div className="text-slate-200">{r.evidence}</div>
                {r.source && <div className="text-[12px] text-slate-400">Источник: {r.source}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {interview.length > 0 && (
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
          <SectionTitle>Что уточнить на финальном интервью</SectionTitle>
          <ul className="text-[13px] text-white list-disc pl-5 space-y-1">
            {interview.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {f.recommendation && (
        <div className="bg-[#E7C768]/10 border border-[#E7C768]/40 rounded-2xl p-4">
          <SectionTitle color="text-[#E7C768]">Итоговая рекомендация</SectionTitle>
          <div className="text-[14px] text-white/95 leading-relaxed whitespace-pre-wrap">{f.recommendation}</div>
        </div>
      )}

      {missing.length > 0 && (
        <div className="bg-slate-500/10 border border-slate-400/20 rounded-xl p-3">
          <SectionTitle color="text-slate-300">Недостающие данные</SectionTitle>
          <ul className="text-[13px] text-slate-200 list-disc pl-5 space-y-0.5">
            {missing.map((s: string, i: number) => <li key={i}>Недостаточно данных по этапу: {s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}