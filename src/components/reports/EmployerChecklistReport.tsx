// =============================================================================
// EmployerChecklistReport — full presentation of checklist v2 feedback for the
// EMPLOYER side. Per-question entries render as collapsed accordion cards with
// a colored score badge; expanded panel shows question, candidate answer, AI
// comment, evidence, strengths and recommendation. Legacy v1 records render
// through a safe text path; we never `pre`-dump JSON.
// =============================================================================
import { type EmployerChecklistView } from "@/lib/feedbackAdapters";
import { scoreTone, formatScore } from "@/lib/scoreTone";

type Props = {
  view: EmployerChecklistView;
  score?: number | null;
};

function severityCls(sev?: string): string {
  const s = (sev || "").toLowerCase();
  if (s === "high" || s.includes("выс")) return "bg-rose-500/15 border-rose-400/40 text-rose-100";
  if (s === "low" || s.includes("низ")) return "bg-amber-500/10 border-amber-400/30 text-amber-100";
  return "bg-amber-500/10 border-amber-400/30 text-amber-100";
}

/**
 * Per-question accordion. Defaults to closed so the screen stays scannable.
 * Uses native <details>/<summary> so keyboard a11y works for free, and so
 * jsdom tests can still find expanded content via getByText (the children
 * remain in the DOM regardless of open state).
 */
function QuestionCard({
  index, question, score, employerFeedback, evidence, answer,
  recommendation, strengths, improvements,
}: {
  index: number; question?: string; score?: number;
  employerFeedback?: string; evidence?: string; answer?: string;
  recommendation?: string; strengths?: string[]; improvements?: string[];
}) {
  // Checklist items are scored on a 0–10 scale by default (v2 schema).
  const tone = scoreTone(score, 10);
  const headline = (question || "Вопрос").trim();
  const short = headline.length > 80 ? headline.slice(0, 80).trimEnd() + "…" : headline;

  return (
    <details className={`group rounded-xl border border-l-4 ${tone.bg} ${tone.border} bg-black/20 overflow-hidden`}>
      <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center gap-3 select-none">
        <span className="text-[11px] font-mono text-slate-400 shrink-0 w-6">{index + 1}.</span>
        <span className="text-[13px] font-semibold text-white leading-[1.4] flex-1">{short}</span>
        {typeof score === "number" && (
          <span className={`text-[11px] font-mono font-bold shrink-0 px-2 py-0.5 rounded ${tone.badge}`}>
            {formatScore(score, 10)}
          </span>
        )}
        <span className="text-slate-400 text-xs shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5">
        {question && short !== headline && (
          <div className="text-[12.5px] text-white/90 leading-[1.6]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">Вопрос:</span>
            {question}
          </div>
        )}
        {answer && (
          <div className="text-[12.5px] text-slate-100 leading-[1.6] bg-black/25 border border-white/10 rounded-lg p-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Ответ кандидата</div>
            <div className="whitespace-pre-wrap">{answer}</div>
          </div>
        )}
        {employerFeedback && (
          <div className="text-[12.5px] text-white/90 leading-[1.6]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#E7C768] mr-1">Комментарий ИИ:</span>
            {employerFeedback}
          </div>
        )}
        {strengths && strengths.length > 0 && (
          <div className="text-[12px] text-emerald-100/90 leading-[1.6]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mr-1">Сильные стороны:</span>
            <ul className="list-disc pl-5 space-y-0.5 mt-0.5">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {improvements && improvements.length > 0 && (
          <div className="text-[12px] text-amber-100/90 leading-[1.6]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 mr-1">Что улучшить:</span>
            <ul className="list-disc pl-5 space-y-0.5 mt-0.5">{improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {evidence && (
          <div className="text-[12px] text-slate-300 leading-[1.6]">
            <span className="font-bold text-slate-200">Свидетельство: </span>{evidence}
          </div>
        )}
        {recommendation && (
          <div className="text-[12px] text-sky-100 leading-[1.6] bg-sky-500/10 border border-sky-400/30 rounded-lg p-2">
            <span className="font-bold text-sky-200">Рекомендация: </span>{recommendation}
          </div>
        )}
      </div>
    </details>
  );
}

export default function EmployerChecklistReport({ view, score }: Props) {
  if (view.kind === "empty") {
    return <div className="text-sm text-slate-300 italic">Разбор анкеты ещё не готов.</div>;
  }

  const headTone = scoreTone(score, 100);

  if (view.kind === "legacy") {
    const text = typeof view.legacyRaw === "string"
      ? view.legacyRaw
      : "Результаты сохранены в устаревшем формате — детальный разбор недоступен.";
    return (
      <div className="space-y-3" data-testid="employer-checklist-report">
        {typeof score === "number" && (
          <div className={`text-3xl font-extrabold ${headTone.text}`}>{formatScore(score, 100)}</div>
        )}
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 text-[14px] leading-[1.6] text-white/90 whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="employer-checklist-report">
      {typeof score === "number" && (
        <div className={`text-3xl font-extrabold ${headTone.text}`}>{formatScore(score, 100)}</div>
      )}
      {view.summary && (
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 text-[14px] leading-[1.6] text-white/95">
          {view.summary}
        </div>
      )}
      {view.strengths.length > 0 && (
        <section className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-4">
          <h4 className="text-[11px] uppercase font-bold text-emerald-300 tracking-wider mb-2">Сильные стороны</h4>
          <ul className="list-disc pl-5 text-[13px] text-emerald-50 leading-[1.6] space-y-1">
            {view.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}
      {view.gaps.length > 0 && (
        <section className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4">
          <h4 className="text-[11px] uppercase font-bold text-amber-300 tracking-wider mb-2">Пробелы и расхождения</h4>
          <ul className="space-y-2 text-[13px] text-amber-50 leading-[1.6]">
            {view.gaps.map((g, i) => (
              <li key={i}>
                <span className="font-bold">{g.criterion}: </span>{g.finding}
                {g.impact && <span className="text-amber-200/80"> · {g.impact}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.risks.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase font-bold text-amber-300 tracking-wider">Риски</h4>
          <div className="space-y-2">
            {view.risks.map((r, i) => (
              <article key={i} className={`rounded-xl border p-3 ${severityCls(r.severity)}`}>
                <div className="text-[13px] font-bold">{r.title}</div>
                <div className="text-[12px] mt-1 leading-[1.6]"><span className="font-semibold">Подтверждение: </span>{r.evidence}</div>
                {r.severity && <div className="text-[11px] mt-1 opacity-80">Серьёзность: {r.severity}</div>}
                {r.howToVerify && <div className="text-[11px] mt-1 leading-[1.6]"><span className="font-semibold">Как проверить: </span>{r.howToVerify}</div>}
              </article>
            ))}
          </div>
        </section>
      )}
      {view.redFlags.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase font-bold text-rose-300 tracking-wider">Красные флаги</h4>
          <div className="space-y-2">
            {view.redFlags.map((r, i) => (
              <article key={i} className="rounded-xl border border-rose-400/40 bg-rose-500/15 p-3">
                <div className="text-[13px] font-bold text-rose-100">{r.title}</div>
                <div className="text-[12px] mt-1 leading-[1.6] text-rose-50"><span className="font-semibold">Подтверждение: </span>{r.evidence}</div>
                {r.severity && <div className="text-[11px] mt-1 opacity-80 text-rose-100">Серьёзность: {r.severity}</div>}
              </article>
            ))}
          </div>
        </section>
      )}
      {view.items.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase font-bold text-[#E7C768] tracking-wider">Разбор по вопросам</h4>
          <div className="space-y-2">
            {view.items.map((it, idx) => (
              <QuestionCard
                key={it.questionId}
                index={idx}
                question={it.question}
                score={it.score}
                employerFeedback={it.employerFeedback}
                evidence={it.evidence}
                answer={it.answer}
                recommendation={it.recommendation}
                strengths={it.strengths}
                improvements={it.improvements}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
