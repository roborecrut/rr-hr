/**
 * Candidate-facing compact summary after all stages. Strictly soft and
 * stripped of employer-only fields (risks, red_flags, recommendation,
 * employer_wishes_alignment, verdict, fit_score).
 *
 * Source: `candidate_overall_feedback` jsonb on candidate_scores. Renders
 * nothing when missing — never falls back to assessment_summary or to the
 * employer overall report.
 */
import React from "react";

type AnyObj = Record<string, any>;

const FORBIDDEN_KEYS = new Set([
  "risks", "red_flags", "gaps", "matches", "verdict", "fit_score",
  "confidence", "recommendation", "employer_wishes_alignment",
  "employer_wishes", "interview_focus", "executive_summary",
]);

function safeArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean);
}

export default function CandidateOverallReport({
  feedback,
}: { feedback: AnyObj | null | undefined }) {
  if (!feedback || typeof feedback !== "object") return null;
  // Defensive: strip employer-only keys if model leaked them past validator.
  const f: AnyObj = {};
  for (const k of Object.keys(feedback)) {
    if (!FORBIDDEN_KEYS.has(k)) f[k] = (feedback as AnyObj)[k];
  }
  const summary = String(f.summary || "").trim();
  if (!summary) return null;
  const strengths = safeArr(f.strengths);
  const areas = safeArr(f.areas_to_improve);
  const next = safeArr(f.next_steps);
  const missing = safeArr(f.missing_sections);
  const stageFb: any[] = Array.isArray(f.stage_feedback) ? f.stage_feedback : [];

  return (
    <div
      data-testid="candidate-overall-summary"
      className="bg-[#1E4468]/20 border border-white/10 rounded-2xl p-4 space-y-3 text-left"
    >
      <div className="text-[11px] font-mono uppercase tracking-wider text-[#E7C768]">
        Итог по пройденным этапам
      </div>
      <p className="text-[14px] text-white/95 leading-relaxed whitespace-pre-wrap">{summary}</p>

      {strengths.length > 0 && (
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 mb-1">Сильные стороны</div>
          <ul className="text-[13px] text-white list-disc pl-5 space-y-0.5">
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {areas.length > 0 && (
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300 mb-1">Что можно усилить</div>
          <ul className="text-[13px] text-white list-disc pl-5 space-y-0.5">
            {areas.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {stageFb.length > 0 && (
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-300 mb-1">По этапам</div>
          <ul className="text-[13px] text-white space-y-0.5">
            {stageFb.map((it: any, i: number) => (
              <li key={i}><b>{String(it.stage || "")}:</b> {String(it.conclusion || "")}</li>
            ))}
          </ul>
        </div>
      )}

      {next.length > 0 && (
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#E7C768] mb-1">Следующие шаги</div>
          <ul className="text-[13px] text-white list-disc pl-5 space-y-0.5">
            {next.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div className="text-[12px] text-slate-300">
          Недостаточно данных по этапам: {missing.join(", ")}.
        </div>
      )}
    </div>
  );
}