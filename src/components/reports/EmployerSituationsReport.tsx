// =============================================================================
// EmployerSituationsReport — full presentation of situations v2 feedback for the
// EMPLOYER side. Top block is the overall AI conclusion for the section
// (summary + competencies + risks + red flags + questions to verify). Below
// it, each situation renders as a collapsed accordion card; expanded view
// shows the full prompt, candidate answer, AI comment, evidence and any
// recommendation. Legacy v1 records render through a safe text path.
// =============================================================================
import { type EmployerSituationsView } from "@/lib/feedbackAdapters";
import { scoreTone, formatScore } from "@/lib/scoreTone";

type Props = {
  view: EmployerSituationsView;
  score?: number | null;
};

function SituationCard({
  index, title, score, prompt, answer, employerFeedback, evidence,
  recommendation, strengths, improvements,
}: {
  index: number; title?: string; score?: number;
  prompt?: string; answer?: string; employerFeedback?: string; evidence?: string;
  recommendation?: string; strengths?: string[]; improvements?: string[];
}) {
  // Situations are scored on a 0–10 scale by default (v2 schema).
  const tone = scoreTone(score, 10);
  const headline = (title || "Ситуация").trim();
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
        {prompt && (
          <div className="text-[12.5px] text-slate-100 leading-[1.6] bg-black/25 border border-white/10 rounded-lg p-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#E7C768] mb-1">Ситуация</div>
            <div className="whitespace-pre-wrap">{prompt}</div>
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
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 mr-1">Недочёты:</span>
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
            <span className="font-bold text-sky-200">Что проверить: </span>{recommendation}
          </div>
        )}
      </div>
    </details>
  );
}

export default function EmployerSituationsReport({ view, score }: Props) {
  if (view.kind === "empty") {
    return <div className="text-sm text-slate-300 italic">Разбор ситуаций ещё не готов.</div>;
  }

  const headTone = scoreTone(score, 100);

  if (view.kind === "legacy") {
    const text = typeof view.legacyRaw === "string"
      ? view.legacyRaw
      : "Результаты сохранены в устаревшем формате — детальный разбор недоступен.";
    return (
      <div className="space-y-3" data-testid="employer-situations-report">
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
    <div className="space-y-4" data-testid="employer-situations-report">
      {typeof score === "number" && (
        <div className={`text-3xl font-extrabold ${headTone.text}`}>{formatScore(score, 100)}</div>
      )}

      {/* Overall AI conclusion for the whole situations section. */}
      {view.summary && (
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 text-[14px] leading-[1.6] text-white/95">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#E7C768] mb-1">Общий вывод по ситуациям</div>
          {view.summary}
        </div>
      )}

      {(view.competenciesDemonstrated.length > 0 || view.competenciesWeak.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {view.competenciesDemonstrated.length > 0 && (
            <section className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-4">
              <h4 className="text-[11px] uppercase font-bold text-emerald-300 tracking-wider mb-2">Сильные стороны</h4>
              <ul className="list-disc pl-5 text-[13px] text-emerald-50 leading-[1.6] space-y-1">
                {view.competenciesDemonstrated.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}
          {view.competenciesWeak.length > 0 && (
            <section className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4">
              <h4 className="text-[11px] uppercase font-bold text-amber-300 tracking-wider mb-2">Слабые стороны</h4>
              <ul className="list-disc pl-5 text-[13px] text-amber-50 leading-[1.6] space-y-1">
                {view.competenciesWeak.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
      {view.risks.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase font-bold text-amber-300 tracking-wider">Профессиональные риски</h4>
          <div className="space-y-2">
            {view.risks.map((r, i) => (
              <article key={i} className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <div className="text-[13px] font-bold text-amber-100">{r.title}</div>
                <div className="text-[12px] mt-1 leading-[1.6] text-amber-50"><span className="font-semibold">Подтверждение: </span>{r.evidence}</div>
                {r.severity && <div className="text-[11px] mt-1 opacity-80 text-amber-100">Серьёзность: {r.severity}</div>}
                {r.howToVerify && <div className="text-[11px] mt-1 leading-[1.6] text-amber-50"><span className="font-semibold">Как проверить: </span>{r.howToVerify}</div>}
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
          <h4 className="text-[11px] uppercase font-bold text-[#E7C768] tracking-wider">Разбор ситуаций</h4>
          <div className="space-y-2">
            {view.items.map((it, idx) => (
              <SituationCard
                key={it.situationId}
                index={idx}
                title={it.title}
                score={it.score}
                prompt={it.prompt}
                answer={it.answer}
                employerFeedback={it.employerFeedback}
                evidence={it.evidence}
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
