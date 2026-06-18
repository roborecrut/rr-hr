import { Trophy, Sparkles } from "lucide-react";

export type TrainingSummaryCandidate = {
  summary: string;
  completed_stages: string[];
  missing_stages: string[];
  strengths: string[];
  topics_to_repeat: string[];
  revision_plan: string[];
  next_steps: string[];
};

function S({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}

export default function CandidateTrainingSummaryReport({ report }: { report: TrainingSummaryCandidate | null }) {
  if (!report) return null;
  return (
    <div className="space-y-4" data-testid="cand-training-summary">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-[#E7C768]" />
        <div className="text-sm font-bold text-white">Итог обучения</div>
      </div>
      <p className="text-[13px] text-slate-100 leading-relaxed">{report.summary}</p>
      {!!report.completed_stages?.length && (
        <S title="Пройденные этапы">
          <ul className="text-[12.5px] text-emerald-200 space-y-0.5 list-disc list-inside">
            {report.completed_stages.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.strengths?.length && (
        <S title="Сильные стороны">
          <ul className="text-[12.5px] text-slate-100 space-y-0.5 list-disc list-inside">
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.topics_to_repeat?.length && (
        <S title="Что повторить">
          <ul className="text-[12.5px] text-slate-100 space-y-0.5 list-disc list-inside">
            {report.topics_to_repeat.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.revision_plan?.length && (
        <S title="План повторения">
          <ul className="text-[12.5px] text-slate-100 space-y-0.5 list-disc list-inside">
            {report.revision_plan.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.next_steps?.length && (
        <S title="Следующие шаги">
          <ul className="text-[12.5px] text-slate-100 space-y-1 list-disc list-inside">
            {report.next_steps.map((s, i) => <li key={i} className="flex items-start gap-1.5"><Sparkles className="w-3 h-3 text-[#E7C768] mt-1" /><span>{s}</span></li>)}
          </ul>
        </S>
      )}
    </div>
  );
}