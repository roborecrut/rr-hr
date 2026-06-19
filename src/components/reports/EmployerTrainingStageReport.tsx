import { AlertTriangle, ShieldAlert, Check, ListChecks } from "lucide-react";
import { toStrArr, toObjArr } from "@/lib/normalizeArrays";

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

export default function EmployerTrainingStageReport({
  status, score, max, passScore, summary, perQuestionLegacy, lastAnswers,
}: {
  status: "passed" | "in_progress" | "not_started";
  score: number | null;
  max: number;
  passScore: number;
  summary: EmployerStageSummary | null;
  perQuestionLegacy?: any[];
  lastAnswers?: any[];
}) {
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
          <div className="space-y-1.5 max-h-[24rem] overflow-y-auto pr-1">
            {perQuestionLegacy.map((pq: any, idx: number) => {
              const ans = Array.isArray(lastAnswers)
                ? lastAnswers.find((a: any) => a.question_id === pq.id) : null;
              const tone = pq.score === pq.max ? "text-emerald-300" : pq.score > 0 ? "text-amber-300" : "text-rose-300";
              return (
                <div key={pq.id || idx} className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-[12px]">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span><ListChecks className="w-3 h-3 inline mr-1" />Вопрос {idx + 1}</span>
                    <span className={`font-mono font-bold ${tone}`}>{pq.score}/{pq.max}</span>
                  </div>
                  {pq.question && <div className="text-white mt-0.5">{pq.question}</div>}
                  {ans?.value && (
                    <div className="mt-1 text-slate-200">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">Ответ:</span>
                      {ans.value}
                    </div>
                  )}
                  {pq.comment && <div className={`mt-1 italic ${tone}`}>Оценка ИИ: {pq.comment}</div>}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}