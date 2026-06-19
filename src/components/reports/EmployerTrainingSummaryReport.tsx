import { AlertTriangle, ShieldAlert, Sparkles, Trophy, BookOpen } from "lucide-react";
import { toStrArr, toObjArr } from "@/lib/normalizeArrays";

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
  // Some legacy candidates have `training_employer_feedback` stored as a plain
  // string or an unknown shape — never call `.map` on raw fields, normalize
  // every list first.
  if (!report || typeof report !== "object") {
    return (
      <div className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
        Итоговый отчёт по обучению ещё не сформирован. Нажмите «Сформировать итог», когда будут готовы результаты этапов.
      </div>
    );
  }
  const r = report as any;
  const verdict = typeof r.verdict === "string" ? r.verdict : "—";
  const summaryText = typeof r.summary === "string" ? r.summary : "";
  const readiness = typeof r.readiness === "string" ? r.readiness : "";
  const recommendation = typeof r.recommendation === "string" ? r.recommendation : "";
  const scoreNum = Number.isFinite(Number(r.score)) ? Math.round(Number(r.score)) : null;
  const completenessNum = Number.isFinite(Number(r.data_completeness))
    ? Math.round(Number(r.data_completeness))
    : null;
  const completedStages = toStrArr(r.completed_stages);
  const missingStages = toStrArr(r.missing_stages);
  const masteredTopics = toStrArr(r.mastered_topics);
  const weakTopics = toStrArr(r.weak_topics);
  const revisionPlan = toStrArr(r.revision_plan);
  type RR = { title: string; evidence: string; severity?: string };
  const risks = toObjArr<RR>(r.risks, (s) => ({ title: s, evidence: "" }));
  const redFlags = toObjArr<RR>(r.red_flags, (s) => ({ title: s, evidence: "" }));
  return (
    <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-4" data-testid="emp-training-summary">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#E7C768]" />
          <div>
            <div className="text-sm font-bold text-white">Итог обучения</div>
            <div className="text-[11px] text-slate-300">Вердикт: <span className="font-mono">{verdict}</span></div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-black text-white">{scoreNum != null ? `${scoreNum}/100` : "—"}</div>
          <div className="text-[10px] text-slate-400">Полнота данных: {completenessNum != null ? `${completenessNum}%` : "—"}</div>
        </div>
      </div>

      {summaryText && (
        <S title="Общий вывод">
          <p className="text-[12.5px] text-slate-100">{summaryText}</p>
        </S>
      )}

      <div className="grid grid-cols-2 gap-3">
        {completedStages.length > 0 && (
          <S title="Завершено">
            <ul className="text-[12px] text-emerald-200 space-y-0.5 list-disc list-inside">
              {completedStages.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </S>
        )}
        {missingStages.length > 0 && (
          <S title="Не пройдено">
            <ul className="text-[12px] text-amber-200 space-y-0.5 list-disc list-inside">
              {missingStages.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </S>
        )}
      </div>

      {masteredTopics.length > 0 && (
        <S title="Усвоенные темы">
          <ul className="text-[12px] text-slate-100 space-y-0.5 list-disc list-inside">
            {masteredTopics.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {weakTopics.length > 0 && (
        <S title="Слабые темы">
          <ul className="text-[12px] text-slate-100 space-y-0.5 list-disc list-inside">
            {weakTopics.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}

      {risks.length > 0 && (
        <S title="Риски">
          <div className="space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className="text-[12px] bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-amber-200 font-semibold"><AlertTriangle className="w-3.5 h-3.5" />{r.title}</div>
                <div className="text-slate-300 mt-1">{r.evidence}</div>
              </div>
            ))}
          </div>
        </S>
      )}
      {redFlags.length > 0 && (
        <S title="Красные флаги">
          <div className="space-y-1.5">
            {redFlags.map((r, i) => (
              <div key={i} className="text-[12px] bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-rose-200 font-semibold"><ShieldAlert className="w-3.5 h-3.5" />{r.title}</div>
                <div className="text-slate-300 mt-1">{r.evidence}</div>
              </div>
            ))}
          </div>
        </S>
      )}

      {revisionPlan.length > 0 && (
        <S title="План повторения">
          <ul className="text-[12px] text-slate-100 space-y-0.5 list-disc list-inside">
            {revisionPlan.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}

      {readiness && (
        <S title="Готовность к практике">
          <div className="text-[12px] text-slate-100 flex items-start gap-1.5"><BookOpen className="w-3.5 h-3.5 mt-0.5 text-[#E7C768]" />{readiness}</div>
        </S>
      )}

      {recommendation && (
        <S title="Итоговая рекомендация">
          <div className="text-[12px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 mt-0.5" /><span>{recommendation}</span>
          </div>
        </S>
      )}
    </div>
  );
}