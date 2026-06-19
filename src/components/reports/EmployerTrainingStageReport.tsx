import { AlertTriangle, ShieldAlert, Check, ListChecks } from "lucide-react";
import { toStrArr, toObjArr } from "@/lib/normalizeArrays";
import { scoreTone, formatScore } from "@/lib/scoreTone";
import { mergeStageItems, deriveStageSummary, type StageQuestionMap } from "@/lib/trainingStageMerge";

type Item = { question_id: string; score: number; feedback?: string; evidence?: string };
type Risk = { title: string; evidence: string; severity?: string; how_to_verify?: string };

export type EmployerStageSummary = {
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  risks?: Risk[];
  red_flags?: Risk[];
  items?: Item[];
  recommendation?: string;
};

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}

type LegacyProps = {
  status: "passed" | "in_progress" | "not_started";
  score: number | null;
  max: number;
  passScore: number;
  /** Back-compat: pre-built per-question list. New code passes feedback+answers instead. */
  summary?: EmployerStageSummary | null;
  perQuestionLegacy?: any[];
  lastAnswers?: any[];
};

type MergeProps = {
  status: "passed" | "in_progress" | "not_started";
  score: number | null;
  max: number;
  passScore: number;
  /** Stage key (`professional` | `product` | `system` | aliases). */
  stage: string;
  /** Raw `candidate_stage_progress.employer_summary` jsonb, or null. */
  employerSummary?: unknown;
  /** Raw `candidate_stage_progress.last_feedback` jsonb (array of items). */
  feedback?: unknown;
  /** Raw `candidate_stage_progress.last_answers` jsonb (array of items). */
  answers?: unknown;
  /** Map produced by buildStageQuestionMap (training_stage_tests rows). */
  questionsMap?: StageQuestionMap | null;
};

export default function EmployerTrainingStageReport(props: LegacyProps | MergeProps) {
  const { status, score, max, passScore } = props;
  const isMerge = "stage" in props;

  // Build per-question list & summary either from new merge inputs or from
  // legacy props passed by older call sites.
  const merged = isMerge
    ? mergeStageItems({
        stage: (props as MergeProps).stage,
        feedback: (props as MergeProps).feedback,
        answers: (props as MergeProps).answers,
        questionsMap: (props as MergeProps).questionsMap || null,
      })
    : [];

  const perQuestionLegacy = isMerge
    ? merged.map(it => ({
        id: it.id,
        question: it.question,
        score: it.score,
        max: it.max,
        comment: it.comment,
        recommendation: it.recommendation,
      }))
    : ((props as LegacyProps).perQuestionLegacy || []);

  const lastAnswers = isMerge
    ? merged.map(it => ({ question_id: it.id, value: it.answer }))
    : ((props as LegacyProps).lastAnswers || []);

  const rawSummary = isMerge
    ? (props as MergeProps).employerSummary
    : (props as LegacyProps).summary;
  const hasStructuredSummary =
    rawSummary && typeof rawSummary === "object" && !Array.isArray(rawSummary) &&
    (
      typeof (rawSummary as any).summary === "string" ||
      Array.isArray((rawSummary as any).strengths) ||
      Array.isArray((rawSummary as any).gaps) ||
      Array.isArray((rawSummary as any).risks) ||
      Array.isArray((rawSummary as any).red_flags)
    );

  // Deterministic fallback: legacy rows without employer_summary still get
  // a structured stage summary derived from the per-item feedback. No AI.
  const summary: EmployerStageSummary | null = hasStructuredSummary
    ? (rawSummary as EmployerStageSummary)
    : (isMerge ? deriveStageSummary(merged) : null);

  const statusBadge = status === "passed"
    ? "bg-emerald-500/20 text-emerald-300"
    : status === "in_progress" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-slate-300";
  const statusText = status === "passed" ? "Сдан" : status === "in_progress" ? "В процессе" : "Не начат";

  // Normalize legacy/malformed jsonb cells: each field may be array | string |
  // object | null. Direct `.map` on those previously produced a white screen.
  const summaryText =
    summary && typeof summary === "object" && typeof (summary as any).summary === "string"
      ? (summary as any).summary
      : "";
  const strengths = toStrArr(summary?.strengths);
  const gaps = toStrArr(summary?.gaps);
  const risks = toObjArr<Risk>(summary?.risks, (s) => ({ title: s, evidence: "" }));
  const redFlags = toObjArr<Risk>(summary?.red_flags, (s) => ({ title: s, evidence: "" }));
  const recommendation =
    summary && typeof (summary as any).recommendation === "string"
      ? (summary as any).recommendation
      : "";

  return (
    <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-4" data-testid="emp-training-stage">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${statusBadge}`}>{statusText}</span>
        <div className="text-base font-mono font-black text-white">
          {score != null ? `${Math.round(Number(score))}/${max}` : "—"}
          <span className="text-[10px] text-slate-400 ml-2">проходной {passScore}</span>
        </div>
      </div>

      {summaryText && (
        <Section title="Общий вывод">
          <p className="text-[12.5px] text-slate-100">{summaryText}</p>
        </Section>
      )}

      {strengths.length > 0 && (
        <Section title="Сильные стороны">
          <ul className="text-[12px] text-slate-200 space-y-1 list-disc list-inside">
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {gaps.length > 0 && (
        <Section title="Пробелы в знаниях">
          <ul className="text-[12px] text-slate-200 space-y-1 list-disc list-inside">
            {gaps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {risks.length > 0 && (
        <Section title="Профессиональные риски">
          <div className="space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className="text-[12px] bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-amber-200 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />{r.title}
                  {r.severity && <span className="ml-auto text-[10px] font-mono uppercase">{r.severity}</span>}
                </div>
                <div className="text-slate-300 mt-1">{r.evidence}</div>
                {r.how_to_verify && <div className="text-slate-400 mt-0.5 italic">Как проверить: {r.how_to_verify}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {redFlags.length > 0 && (
        <Section title="Красные флаги">
          <div className="space-y-1.5">
            {redFlags.map((r, i) => (
              <div key={i} className="text-[12px] bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-rose-200 font-semibold">
                  <ShieldAlert className="w-3.5 h-3.5" />{r.title}
                </div>
                <div className="text-slate-300 mt-1">{r.evidence}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {recommendation && (
        <Section title="Рекомендация">
          <div className="text-[12px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex items-start gap-1.5">
            <Check className="w-3.5 h-3.5 mt-0.5" /><span>{recommendation}</span>
          </div>
        </Section>
      )}

      {Array.isArray(perQuestionLegacy) && perQuestionLegacy.length > 0 && (
        <Section title="Детальный разбор вопросов">
          <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
            {perQuestionLegacy.map((pq: any, idx: number) => {
              const ans = Array.isArray(lastAnswers)
                ? lastAnswers.find((a: any) => a.question_id === pq.id) : null;
              const itemMax = Number(pq.max) || 1;
              const tone = scoreTone(pq.score, itemMax);
              const qText = typeof pq.question === "string" ? pq.question : "";
              const short = qText && qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
              const answerText = typeof ans?.value === "string"
                ? ans.value
                : (ans?.value != null ? String(ans.value) : "");
              return (
                <details
                  key={pq.id || idx}
                  className={`group rounded-lg border border-l-4 bg-black/20 ${tone.bg} ${tone.border} overflow-hidden`}
                >
                  <summary className="cursor-pointer list-none px-2.5 py-2 flex items-center gap-2 select-none">
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      <ListChecks className="w-3 h-3 inline mr-1" />{idx + 1}.
                    </span>
                    <span className="text-[12px] font-semibold text-white leading-[1.4] flex-1 truncate">
                      {short || `Вопрос ${idx + 1}`}
                    </span>
                    <span className={`text-[11px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded ${tone.badge}`}>
                      {pq.score != null ? formatScore(pq.score, itemMax) : "—"}
                    </span>
                    <span className="text-slate-400 text-[10px] shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                  <div className="px-2.5 pb-2.5 pt-1 space-y-1.5 border-t border-white/5 text-[12px]">
                    {qText && (
                      <div className="text-white leading-[1.5]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">Вопрос:</span>
                        {qText}
                      </div>
                    )}
                    {answerText && (
                      <div className="text-slate-100 leading-[1.5] bg-black/25 rounded p-2 border border-white/5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">Ответ:</span>
                        <span className="whitespace-pre-wrap">{answerText}</span>
                      </div>
                    )}
                    {pq.comment && (
                      <div className={`italic ${tone.text} leading-[1.5]`}>
                        <span className="not-italic text-[10px] font-mono uppercase tracking-wider mr-1">Оценка ИИ:</span>
                        {pq.comment}
                      </div>
                    )}
                    {pq.recommendation && (
                      <div className="text-sky-100 bg-sky-500/10 border border-sky-400/30 rounded p-1.5 leading-[1.5]">
                        <span className="font-bold text-sky-200">Рекомендация: </span>{pq.recommendation}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}