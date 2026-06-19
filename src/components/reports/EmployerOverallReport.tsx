/**
 * Employer-facing OVERALL evaluation — compact "management summary" surface.
 *
 * Renders ONLY a tight one-screen summary in the open part. Full evidence
 * (matches, gaps, risks, red flags, executive summary, per-stage) is reachable
 * only via the single bottom accordion "Подробный AI-разбор".
 *
 * This file is presentation-only. It does NOT mutate the saved JSON, never
 * triggers an AI call, and tolerates malformed / legacy payloads (renders
 * an empty-but-safe state instead of crashing).
 */
import React, { useMemo } from "react";

type AnyObj = Record<string, any>;

// Stage labels — Russian only. English keys are normalised before display.
const STAGE_LABEL: Record<string, string> = {
  resume: "Резюме",
  checklist: "Анкета",
  situations: "Ситуации",
  training: "Обучение",
};
const stageRu = (s: unknown): string => {
  const key = String(s ?? "").trim().toLowerCase();
  return STAGE_LABEL[key] || (key ? key[0].toUpperCase() + key.slice(1) : "—");
};

function tone(score: number | null | undefined): { cls: string; bg: string } {
  if (score == null || !Number.isFinite(Number(score))) {
    return { cls: "text-slate-200", bg: "bg-slate-500/10 border-slate-400/20" };
  }
  const n = Number(score);
  if (n >= 80) return { cls: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-400/30" };
  if (n >= 60) return { cls: "text-amber-300", bg: "bg-amber-500/10 border-amber-400/30" };
  return { cls: "text-rose-300", bg: "bg-rose-500/10 border-rose-400/30" };
}

function asArr(v: unknown): any[] { return Array.isArray(v) ? v : []; }
function asStr(v: unknown): string { return typeof v === "string" ? v : (v == null ? "" : String(v)); }

/** UI-only safe truncation. The full text remains available inside the
 *  collapsed "Подробный AI-разбор" accordion. */
function truncate(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/[ ,;:.\-]+$/, "")) + "…";
}

// Filter: drop any AI-generated interview item that suggests a "повторное"
// or "финальное" интервью / re-verification of competencies. Product
// positions itself such that no second interview is needed.
const REINTERVIEW_RE = /(финальн\w*\s+интервью|повторн\w*\s+интервью|дополнительн\w*\s+интервью|перепровер|повторн\w*\s+оценк)/i;
function isPracticalIntake(s: unknown): boolean {
  const t = asStr(s).trim();
  if (!t) return false;
  return !REINTERVIEW_RE.test(t);
}

const PRACTICAL_DEFAULT = [
  "Ожидаемая дата возможного выхода и условия перехода с текущего места.",
  "Финансовые ожидания и формат вознаграждения.",
  "Готовность к графику, формату и месту работы.",
];

const SubTitle = ({ children, color = "text-[#E7C768]" }: { children: React.ReactNode; color?: string }) => (
  <div className={`text-[10px] font-mono uppercase tracking-wider ${color} mb-1.5`}>{children}</div>
);

const MetricChip = ({ label, value, toneCls = "text-white", testId }: {
  label: string; value: React.ReactNode; toneCls?: string; testId?: string;
}) => (
  <div data-testid={testId} className="rounded-xl px-3 py-2 bg-black/25 border border-white/10 min-w-0">
    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-300 truncate">{label}</div>
    <div className={`text-base font-mono font-black ${toneCls} truncate`}>{value}</div>
  </div>
);

function verdictTone(v: string): string {
  const s = v.toLowerCase();
  if (s.includes("высок")) return "text-emerald-300";
  if (s.includes("частичн")) return "text-amber-300";
  if (s.includes("низк")) return "text-rose-300";
  return "text-slate-200";
}

/** Pick a one-line "главная причина" derived from the saved JSON. */
function pickMainReason(f: AnyObj): string | null {
  const risks = asArr(f.risks);
  const gaps = asArr(f.gaps);
  const strengths = asArr(f.strengths);
  const matches = asArr(f.matches).filter((m) => m && m.degree === "полностью");
  // Critical risks first.
  const high = risks.find((r) => asStr(r?.severity).toLowerCase().includes("высок"));
  if (high?.title) return `Критический риск: ${asStr(high.title)}`;
  if (risks[0]?.title) return `Ключевой риск: ${asStr(risks[0].title)}`;
  if (gaps[0]?.criterion) return `Не подтверждено: ${asStr(gaps[0].criterion)}`;
  if (matches[0]?.criterion) return `Сильное соответствие: ${asStr(matches[0].criterion)}`;
  if (typeof strengths[0] === "string" && strengths[0]) return `Сильная сторона: ${strengths[0]}`;
  return null;
}

export default function EmployerOverallReport({
  fitScore, overallScore, employerFeedback,
}: {
  fitScore: number | null | undefined;
  overallScore: number | null | undefined;
  employerFeedback: AnyObj | null | undefined;
}) {
  // Defensive empty-state — never crash on null / malformed / legacy payloads.
  if (!employerFeedback || typeof employerFeedback !== "object" || Array.isArray(employerFeedback)) {
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

  // useMemo just for stable references inside the render — no AI calls, no
  // network, no side effects. Pure JSON shaping.
  const view = useMemo(() => {
    const stageSummary = asArr(f.stage_summary);
    const matches = asArr(f.matches);
    const gaps = asArr(f.gaps);
    const risks = asArr(f.risks);
    const redFlags = asArr(f.red_flags);
    const strengths = asArr(f.strengths).map(asStr).filter(Boolean);
    const interviewFocus = asArr(f.interview_focus).map(asStr).filter(Boolean);
    const fullMatches = matches.filter((m) => m && m.degree === "полностью");
    const partial = matches.filter((m) => m && m.degree === "частично");
    const recRaw = asStr(f.recommendation) || asStr(f.executive_summary);
    const intakePractical = interviewFocus.filter(isPracticalIntake);
    const topIntake = (intakePractical.length > 0 ? intakePractical : PRACTICAL_DEFAULT).slice(0, 3);
    return {
      stageSummary, fullMatches, partial, gaps, risks, redFlags, strengths,
      interviewFocus, intakePractical,
      recommendationShort: truncate(recRaw, 380),
      executiveSummary: asStr(f.executive_summary),
      recommendationFull: asStr(f.recommendation),
      verdict: asStr(f.verdict).trim(),
      confidence: f.confidence,
      dataCompleteness: f.data_completeness,
      mainReason: pickMainReason(f),
      topStrengths: strengths.slice(0, 3),
      topRisks: risks.slice(0, 3),
      topIntake,
      topFull: fullMatches.slice(0, 3),
      topPartial: partial.slice(0, 3),
      topGaps: gaps.slice(0, 3),
      wishes: asArr(f.employer_wishes_alignment),
    };
  }, [f]);

  const fitTone = tone(fitScore ?? null);
  const avgTone = tone(overallScore ?? null);
  const fitNum = fitScore != null && Number.isFinite(Number(fitScore)) ? Math.round(Number(fitScore)) : null;
  const avgNum = overallScore != null && Number.isFinite(Number(overallScore)) ? Math.round(Number(overallScore)) : null;

  return (
    <div data-testid="overall-employer-report" className="space-y-4">
      {/* 1. Compact top metrics — single row of small chips. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <MetricChip
          testId="ai-fit-score-card"
          label="AI-оценка"
          value={fitNum != null ? `${fitNum}/100` : "—"}
          toneCls={fitTone.cls}
        />
        <MetricChip
          testId="avg-stage-score-card"
          label="Средний балл этапов"
          value={avgNum != null ? `${avgNum}/100` : "—"}
          toneCls={avgTone.cls}
        />
        <MetricChip label="Вердикт" value={view.verdict || "—"} toneCls={verdictTone(view.verdict)} />
        <MetricChip
          label="Уверенность AI"
          value={view.confidence != null ? `${Math.round(Number(view.confidence))}/100` : "—"}
        />
        <div
          title="Показывает, какой объём доступной информации учтён при формировании оценки"
          className="contents"
        >
          <MetricChip
            label="Полнота оценки"
            value={view.dataCompleteness != null ? `${Math.round(Number(view.dataCompleteness))}/100` : "—"}
          />
        </div>
      </div>

      {/* 2. Вывод по кандидату — short. */}
      <div data-testid="overall-verdict-card" className="bg-black/25 border border-[#E7C768]/30 rounded-2xl p-4">
        <SubTitle>Вывод по кандидату</SubTitle>
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <span className={`text-sm font-extrabold ${verdictTone(view.verdict)}`}>
            {view.verdict || "Вердикт не сформулирован"}
          </span>
          {fitNum != null && (
            <span className={`text-xs font-mono ${fitTone.cls}`}>· AI-оценка {fitNum}/100</span>
          )}
        </div>
        {view.recommendationShort && (
          <p className="text-[13px] text-white/95 leading-relaxed">{view.recommendationShort}</p>
        )}
        {view.mainReason && (
          <div className="text-[12px] text-slate-300 mt-2">
            <span className="text-slate-400">Главная причина: </span>{view.mainReason}
          </div>
        )}
      </div>

      {/* 3. Three compact blocks: strengths / risks / intake questions. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {view.topStrengths.length > 0 && (
          <div data-testid="block-strengths" className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl p-3">
            <SubTitle color="text-emerald-300">Сильные стороны</SubTitle>
            <ul className="text-[13px] text-white list-disc pl-5 space-y-1">
              {view.topStrengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {view.topRisks.length > 0 && (
          <div data-testid="block-risks" className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
            <SubTitle color="text-amber-300">Основные риски</SubTitle>
            <ul className="text-[13px] text-white list-disc pl-5 space-y-1">
              {view.topRisks.map((r, i) => (
                <li key={i}><b>{asStr(r?.title) || "Риск"}</b></li>
              ))}
            </ul>
          </div>
        )}
        <div data-testid="block-intake" className="bg-black/25 border border-white/10 rounded-xl p-3">
          <SubTitle>Что уточнить при знакомстве</SubTitle>
          <ul className="text-[13px] text-white list-disc pl-5 space-y-1">
            {view.topIntake.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      </div>

      {/* 4. Соответствие требованиям — 3 + 3 + 3, single line each. */}
      {(view.topFull.length + view.topPartial.length + view.topGaps.length) > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {view.topFull.length > 0 && (
            <div data-testid="match-full" className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl p-3">
              <SubTitle color="text-emerald-300">Подтверждено</SubTitle>
              <ul className="text-[13px] text-white space-y-1">
                {view.topFull.map((m, i) => (
                  <li key={i}>
                    <b>{asStr(m?.criterion) || "—"}</b>
                    {m?.evidence && (
                      <span className="text-slate-300 block text-[12px] truncate">{truncate(asStr(m.evidence), 90)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.topPartial.length > 0 && (
            <div data-testid="match-partial" className="bg-amber-500/5 border border-amber-400/20 rounded-xl p-3">
              <SubTitle color="text-amber-300">Частично</SubTitle>
              <ul className="text-[13px] text-white space-y-1">
                {view.topPartial.map((m, i) => (
                  <li key={i}>
                    <b>{asStr(m?.criterion) || "—"}</b>
                    {m?.evidence && (
                      <span className="text-slate-300 block text-[12px] truncate">{truncate(asStr(m.evidence), 90)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.topGaps.length > 0 && (
            <div data-testid="match-gaps" className="bg-rose-500/5 border border-rose-400/20 rounded-xl p-3">
              <SubTitle color="text-rose-300">Не подтверждено</SubTitle>
              <ul className="text-[13px] text-white space-y-1">
                {view.topGaps.map((g, i) => (
                  <li key={i}>
                    <b>{asStr(g?.criterion) || "—"}</b>
                    {g?.finding && (
                      <span className="text-slate-300 block text-[12px] truncate">{truncate(asStr(g.finding), 90)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 6. Single collapsed accordion with the full saved payload. */}
      <details data-testid="overall-details" className="group bg-black/20 border border-white/10 rounded-2xl">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-[#E7C768] flex items-center justify-between">
          <span>Подробный AI-разбор</span>
          <span className="text-[11px] text-slate-400 group-open:hidden">раскрыть</span>
          <span className="text-[11px] text-slate-400 hidden group-open:inline">свернуть</span>
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-2">
          {view.stageSummary.length > 0 && (
            <details className="bg-black/25 border border-white/10 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                Результаты по этапам
              </summary>
              <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {view.stageSummary.map((st: any, i: number) => {
                  const t = tone(st?.score);
                  return (
                    <div key={i} className={`rounded-xl p-3 border ${t.bg}`}>
                      <div className="flex justify-between items-baseline gap-2">
                        <div className="text-xs font-bold text-slate-200">{stageRu(st?.stage)}</div>
                        <div className={`text-sm font-mono font-black ${t.cls}`}>
                          {st?.score != null ? `${Math.round(Number(st.score))}/100` : "—"}
                        </div>
                      </div>
                      {st?.conclusion && <div className="text-[13px] text-white/95 mt-1">{asStr(st.conclusion)}</div>}
                      {Array.isArray(st?.key_evidence) && st.key_evidence.length > 0 && (
                        <ul className="text-[12px] text-slate-300 list-disc pl-5 mt-1 space-y-0.5">
                          {st.key_evidence.map((e: string, j: number) => <li key={j}>{asStr(e)}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {view.fullMatches.length > 0 && (
            <details className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
                Полное соответствие требованиям
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white space-y-1.5">
                {view.fullMatches.map((m, i) => (
                  <li key={i}>
                    <b>{asStr(m?.criterion)}</b>{m?.evidence ? <> — <span className="text-slate-200">{asStr(m.evidence)}</span></> : null}
                    {m?.source && <div className="text-[11px] text-slate-400">Источник: {stageRu(m.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.partial.length > 0 && (
            <details className="bg-amber-500/5 border border-amber-400/20 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                Частичное соответствие
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white space-y-1.5">
                {view.partial.map((m, i) => (
                  <li key={i}>
                    <b>{asStr(m?.criterion)}</b>{m?.evidence ? <> — <span className="text-slate-200">{asStr(m.evidence)}</span></> : null}
                    {m?.source && <div className="text-[11px] text-slate-400">Источник: {stageRu(m.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.gaps.length > 0 && (
            <details className="bg-rose-500/5 border border-rose-400/20 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-rose-300 uppercase tracking-wider">
                Несоответствия
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white space-y-1.5">
                {view.gaps.map((g, i) => (
                  <li key={i}>
                    <b>{asStr(g?.criterion)}</b>{g?.finding ? <> — {asStr(g.finding)}</> : null}
                    {g?.impact && <div className="text-[12px] text-slate-300">Влияние: {asStr(g.impact)}</div>}
                    {g?.source && <div className="text-[11px] text-slate-400">Источник: {stageRu(g.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.strengths.length > 0 && (
            <details className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
                Все сильные стороны
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white list-disc pl-5 space-y-1">
                {view.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}

          {view.risks.length > 0 && (
            <details className="bg-amber-500/5 border border-amber-400/20 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                Все риски
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white space-y-2">
                {view.risks.map((r: any, i: number) => (
                  <li key={i}>
                    <div><b>{asStr(r?.title)}</b>{r?.severity ? <> · <span className="text-amber-200">{asStr(r.severity)}</span></> : null}</div>
                    {r?.evidence && <div className="text-slate-200">{asStr(r.evidence)}</div>}
                    {r?.impact && <div className="text-[12px] text-slate-300">Влияние: {asStr(r.impact)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.redFlags.length > 0 && (
            <details className="bg-rose-500/10 border border-rose-400/30 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-rose-300 uppercase tracking-wider">
                Красные флаги
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white space-y-2">
                {view.redFlags.map((r: any, i: number) => (
                  <li key={i}>
                    <div><b>{asStr(r?.title)}</b>{r?.severity ? <> · <span className="text-rose-200">{asStr(r.severity)}</span></> : null}</div>
                    {r?.evidence && <div className="text-slate-200">{asStr(r.evidence)}</div>}
                    {r?.source && <div className="text-[11px] text-slate-400">Источник: {stageRu(r.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.intakePractical.length > 0 && (
            <details className="bg-black/25 border border-white/10 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                Что уточнить при знакомстве
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white list-disc pl-5 space-y-1">
                {view.intakePractical.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}

          {view.wishes.length > 0 && (
            <details className="bg-black/25 border border-white/10 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                Соответствие пожеланиям работодателя
              </summary>
              <ul className="px-4 pb-3 text-[13px] text-white space-y-1.5">
                {view.wishes.map((w: any, i: number) => (
                  <li key={i}>
                    <b>{asStr(w?.wish)}</b> — <span className="text-slate-200">{asStr(w?.status)}</span>
                    {w?.evidence && <div className="text-[12px] text-slate-300">{asStr(w.evidence)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(view.executiveSummary || view.recommendationFull) && (
            <details data-testid="full-exec-summary" className="bg-[#E7C768]/10 border border-[#E7C768]/30 rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[#E7C768] uppercase tracking-wider">
                Полный управленческий вывод
              </summary>
              <div className="px-4 pb-3 space-y-2">
                {view.executiveSummary && (
                  <div className="text-[13px] text-white/95 leading-relaxed whitespace-pre-wrap">
                    {view.executiveSummary}
                  </div>
                )}
                {view.recommendationFull && (
                  <div className="text-[13px] text-white/95 leading-relaxed whitespace-pre-wrap border-t border-white/10 pt-2">
                    <span className="text-[11px] uppercase tracking-wider text-[#E7C768] mr-1">Рекомендация:</span>
                    {view.recommendationFull}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </details>
    </div>
  );
}