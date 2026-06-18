// =============================================================================
// EmployerChecklistReport — full presentation of checklist v2 feedback for the
// EMPLOYER side. Receives a pre-adapted view (see adaptEmployerChecklist) that
// preserves risks, red_flags, gaps and evidence. Hides empty sections.
// Legacy v1 records render through a safe text path; we never `pre`-dump JSON.
// =============================================================================
import { type EmployerChecklistView } from "@/lib/feedbackAdapters";

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

export default function EmployerChecklistReport({ view, score }: Props) {
  if (view.kind === "empty") {
    return <div className="text-sm text-slate-300 italic">Разбор анкеты ещё не готов.</div>;
  }

  if (view.kind === "legacy") {
    const text = typeof view.legacyRaw === "string"
      ? view.legacyRaw
      : "Результаты сохранены в устаревшем формате — детальный разбор недоступен.";
    return (
      <div className="space-y-3" data-testid="employer-checklist-report">
        {typeof score === "number" && (
          <div className="text-3xl font-extrabold text-emerald-300">{score}/100</div>
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
        <div className="text-3xl font-extrabold text-emerald-300">{score}/100</div>
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
              <article key={it.questionId} className="bg-black/20 border border-white/10 rounded-xl p-4 space-y-1.5">
                <header className="flex items-start justify-between gap-3">
                  <div className="text-[13px] font-semibold text-white leading-[1.5]">{idx + 1}. {it.question || "Вопрос"}</div>
                  {typeof it.score === "number" && (
                    <span className="text-[12px] font-mono font-black shrink-0 text-[#E7C768]">{it.score}</span>
                  )}
                </header>
                {it.employerFeedback && <p className="text-[13px] text-white/90 leading-[1.6]">{it.employerFeedback}</p>}
                {it.evidence && (
                  <p className="text-[12px] text-slate-300 leading-[1.6]">
                    <span className="font-bold text-slate-200">Свидетельство: </span>{it.evidence}
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