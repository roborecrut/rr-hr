import { AlertTriangle, ShieldAlert, Sparkles, Trophy, BookOpen } from "lucide-react";

export type TrainingSummaryEmployer = {
  score: number;
  data_completeness: number;
  verdict: string;
  summary: string;
  completed_stages: string[];
  missing_stages: string[];
  mastered_topics: string[];
  weak_topics: string[];
  risks?: { title: string; evidence: string; severity?: string }[];
  red_flags?: { title: string; evidence: string; severity?: string }[];
  revision_plan?: string[];
  readiness?: string;
  recommendation?: string;
};

function S({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}

export default function EmployerTrainingSummaryReport({ report }: { report: TrainingSummaryEmployer | null }) {
  if (!report) {
    return (
      <div className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
        Итоговый отчёт по обучению ещё не сформирован. Нажмите «Сформировать итог», когда будут готовы результаты этапов.
      </div>
    );
  }
  return (
    <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-4" data-testid="emp-training-summary">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#E7C768]" />
          <div>
            <div className="text-sm font-bold text-white">Итог обучения</div>
            <div className="text-[11px] text-slate-300">Вердикт: <span className="font-mono">{report.verdict}</span></div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-black text-white">{report.score}/100</div>
          <div className="text-[10px] text-slate-400">Полнота данных: {report.data_completeness}%</div>
        </div>
      </div>

      {report.summary && (
        <S title="Общий вывод">
          <p className="text-[12.5px] text-slate-100">{report.summary}</p>
        </S>
      )}

      <div className="grid grid-cols-2 gap-3">
        {!!report.completed_stages?.length && (
          <S title="Завершено">
            <ul className="text-[12px] text-emerald-200 space-y-0.5 list-disc list-inside">
              {report.completed_stages.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </S>
        )}
        {!!report.missing_stages?.length && (
          <S title="Не пройдено">
            <ul className="text-[12px] text-amber-200 space-y-0.5 list-disc list-inside">
              {report.missing_stages.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </S>
        )}
      </div>

      {!!report.mastered_topics?.length && (
        <S title="Усвоенные темы">
          <ul className="text-[12px] text-slate-100 space-y-0.5 list-disc list-inside">
            {report.mastered_topics.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.weak_topics?.length && (
        <S title="Слабые темы">
          <ul className="text-[12px] text-slate-100 space-y-0.5 list-disc list-inside">
            {report.weak_topics.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}

      {!!report.risks?.length && (
        <S title="Риски">
          <div className="space-y-1.5">
            {report.risks.map((r, i) => (
              <div key={i} className="text-[12px] bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-amber-200 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />{r.title}</div>
                <div className="text-slate-300 mt-1">{r.evidence}</div>
              </div>
            ))}
          </div>
        </S>
      )}
      {!!report.red_flags?.length && (
        <S title="Красные флаги">
          <div className="space-y-1.5">
            {report.red_flags.map((r, i) => (
              <div key={i} className="text-[12px] bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-rose-200 font-semibold"><ShieldAlert className="w-3.5 h-3.5" />{r.title}</div>
                <div className="text-slate-300 mt-1">{r.evidence}</div>
              </div>
            ))}
          </div>
        </S>
      )}

      {!!report.revision_plan?.length && (
        <S title="План повторения">
          <ul className="text-[12px] text-slate-100 space-y-0.5 list-disc list-inside">
            {report.revision_plan.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}

      {report.readiness && (
        <S title="Готовность к практике">
          <div className="text-[12px] text-slate-100 flex items-start gap-1.5"><BookOpen className="w-3.5 h-3.5 mt-0.5 text-[#E7C768]" />{report.readiness}</div>
        </S>
      )}

      {report.recommendation && (
        <S title="Итоговая рекомендация">
          <div className="text-[12px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 mt-0.5" /><span>{report.recommendation}</span>
          </div>
        </S>
      )}
    </div>
  );
}