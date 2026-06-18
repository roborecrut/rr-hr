// =============================================================================
// CandidateSituationsReport — safe presentation of situations v2 feedback for
// the CANDIDATE side. Receives a pre-adapted view (see adaptCandidateSituations)
// so employer-only fields (criteria, employer_feedback, risks, red_flags,
// evidence) never reach this component's props or DOM.
// =============================================================================
import { type CandidateSituationsView } from "@/lib/feedbackAdapters";

type Props = {
  view: CandidateSituationsView;
  score?: number | null;
};

export default function CandidateSituationsReport({ view, score }: Props) {
  if (view.kind === "empty") {
    return (
      <div className="text-sm text-slate-300 italic">
        Подробный разбор ещё не сформирован.
      </div>
    );
  }

  if (view.kind === "legacy_text") {
    return (
      <div className="space-y-3">
        {typeof score === "number" && (
          <div className="text-3xl font-extrabold text-emerald-300">{score}/100</div>
        )}
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 text-[14px] leading-[1.6] text-white/90 whitespace-pre-wrap">
          {view.legacyText}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="candidate-situations-report">
      {typeof score === "number" && (
        <div className="text-3xl font-extrabold text-emerald-300">{score}/100</div>
      )}
      {view.summary && (
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 text-[14px] leading-[1.6] text-white/95">
          {view.summary}
        </div>
      )}
      {(view.strengths.length > 0 || view.areasToImprove.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {view.strengths.length > 0 && (
            <section className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-4">
              <h4 className="text-[11px] uppercase font-bold text-emerald-300 tracking-wider mb-2">
                Сильные стороны
              </h4>
              <ul className="list-disc pl-5 text-[13px] text-emerald-50 leading-[1.6] space-y-1">
                {view.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}
          {view.areasToImprove.length > 0 && (
            <section className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4">
              <h4 className="text-[11px] uppercase font-bold text-amber-300 tracking-wider mb-2">
                Что можно улучшить
              </h4>
              <ul className="list-disc pl-5 text-[13px] text-amber-50 leading-[1.6] space-y-1">
                {view.areasToImprove.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
      {view.items.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase font-bold text-[#E7C768] tracking-wider">
            Разбор ситуаций
          </h4>
          <div className="space-y-2">
            {view.items.map((it, idx) => (
              <article key={it.situationId} className="bg-black/20 border border-white/10 rounded-xl p-4 space-y-1.5">
                <header className="flex items-start justify-between gap-3">
                  <div className="text-[13px] font-semibold text-white leading-[1.5]">
                    {idx + 1}. {it.title || "Ситуация"}
                  </div>
                  {typeof it.score === "number" && (
                    <span className="text-[12px] font-mono font-black shrink-0 text-[#E7C768]">
                      {it.score}
                    </span>
                  )}
                </header>
                {it.feedback && (
                  <p className="text-[13px] text-white/90 leading-[1.6]">{it.feedback}</p>
                )}
                {it.recommendation && (
                  <p className="text-[12px] text-emerald-200 leading-[1.6]">
                    <span className="font-bold">Рекомендация: </span>{it.recommendation}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}