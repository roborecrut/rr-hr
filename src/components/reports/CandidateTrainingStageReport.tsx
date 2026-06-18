import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

type Item = { question_id: string; score: number; feedback?: string; recommendation?: string };

export type CandidateStageSummary = {
  summary?: string;
  strengths?: string[];
  areas_to_improve?: string[];
  items?: Item[];
  next_steps?: string[];
};

function Section({ title, children, accent = "default" }: { title: string; children: any; accent?: "default" | "good" | "warn" }) {
  const tone = accent === "good" ? "text-emerald-300" : accent === "warn" ? "text-amber-300" : "text-[#E7C768]";
  return (
    <div className="space-y-1.5">
      <div className={`text-[11px] font-bold uppercase tracking-wider ${tone}`}>{title}</div>
      {children}
    </div>
  );
}

export default function CandidateTrainingStageReport({
  passed, score, max, passScore, summary, perQuestionLegacy,
}: {
  passed: boolean;
  score: number;
  max: number;
  passScore: number;
  summary: CandidateStageSummary | null;
  perQuestionLegacy?: any[];
}) {
  return (
    <div className="space-y-4" data-testid="cand-training-stage">
      <div className={`p-4 rounded-2xl flex items-center gap-3 ${passed ? "bg-emerald-900/30 border border-emerald-500/40" : "bg-amber-900/30 border border-amber-500/40"}`}>
        {passed ? <CheckCircle2 className="w-8 h-8 text-emerald-400" /> : <AlertCircle className="w-8 h-8 text-amber-400" />}
        <div className="flex-1">
          <div className="text-base font-bold text-white">{passed ? "Этап сдан!" : "Не сдан — попробуйте ещё раз"}</div>
          <div className="text-xs text-slate-300">Ваш балл: {score} / {max} (проходной {passScore})</div>
        </div>
      </div>

      {summary?.summary && (
        <Section title="Общий вывод">
          <p className="text-[13px] text-slate-100 leading-relaxed">{summary.summary}</p>
        </Section>
      )}

      {!!summary?.strengths?.length && (
        <Section title="Что получилось" accent="good">
          <ul className="text-[12.5px] text-slate-100 space-y-1 list-disc list-inside">
            {summary.strengths!.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {!!summary?.areas_to_improve?.length && (
        <Section title="Что стоит повторить" accent="warn">
          <ul className="text-[12.5px] text-slate-100 space-y-1 list-disc list-inside">
            {summary.areas_to_improve!.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {!!summary?.next_steps?.length && (
        <Section title="Следующие шаги">
          <ul className="text-[12.5px] text-slate-100 space-y-1 list-disc list-inside">
            {summary.next_steps!.map((s, i) => <li key={i} className="flex items-start gap-1.5"><Sparkles className="w-3 h-3 text-[#E7C768] mt-1" /><span>{s}</span></li>)}
          </ul>
        </Section>
      )}

      {Array.isArray(perQuestionLegacy) && perQuestionLegacy.length > 0 && (
        <Section title="Разбор вопросов">
          <div className="space-y-1.5 max-h-[24rem] overflow-y-auto pr-1">
            {perQuestionLegacy.map((pq: any, idx: number) => {
              const tone = pq.score === pq.max ? "text-emerald-300" : pq.score > 0 ? "text-amber-300" : "text-rose-300";
              return (
                <div key={pq.id || idx} className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-[12px]">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Вопрос {idx + 1}</span>
                    <span className={`font-mono font-bold ${tone}`}>{pq.score}/{pq.max}</span>
                  </div>
                  {pq.what_was_wrong && <div className="text-amber-200 mt-1">Что улучшить: {pq.what_was_wrong}</div>}
                  {pq.what_was_right && pq.score > 0 && <div className="text-emerald-200 mt-1">Что зачтено: {pq.what_was_right}</div>}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}