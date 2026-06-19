/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full candidate details modal: profile, resume + screening score, checklist,
 * situations, training results. Used in employer CRM and admin CRM.
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import RichMarkdown from "@/components/RichMarkdown";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adaptEmployerChecklist, adaptEmployerSituations } from "@/lib/feedbackAdapters";
import EmployerChecklistReport from "@/components/reports/EmployerChecklistReport";
import EmployerSituationsReport from "@/components/reports/EmployerSituationsReport";
import EmployerOverallReport from "@/components/reports/EmployerOverallReport";
import EmployerTrainingStageReport from "@/components/reports/EmployerTrainingStageReport";
import EmployerTrainingSummaryReport from "@/components/reports/EmployerTrainingSummaryReport";
import { scoreTone as toneFor, formatScore as toneFormat, type Tone } from "@/lib/scoreTone";
import { buildStageQuestionMap, type StageQuestionMap } from "@/lib/trainingStageMerge";
import {
  startOverallCandidateV2, pollEmployerJobUntilTerminal,
  getEmployerActiveJob, clearEmployerActiveJob, fetchEmployerJobStatus,
  isTerminal, isSuccess,
} from "@/lib/aiJobs";

/**
 * Compact, non-PII diagnostics object passed into the Error Boundary.
 * Built by the modal body and rebuilt on every render so the boundary
 * always has a fresh snapshot of what was on screen when the crash hit.
 *
 * NEVER include: full public_id (masked only), name, email, phone,
 * resume text, raw feedback objects, AI prompts.
 */
type CandidateBoundaryDiag = {
  pid_masked: string;
  has_resume_score: boolean;
  resume_feedback_type: string;
  checklist_feedback_type: string;
  situations_feedback_type: string;
  overall_feedback_type: string;
  training_feedback_type: string;
  arrays_empty: boolean;
};

function describeFeedbackShape(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `array(${v.length})`;
  const t = typeof v;
  if (t !== "object") return t;
  return `object(${Object.keys(v as Record<string, unknown>).length})`;
}

function maskPublicId(pid: unknown): string {
  const s = String(pid ?? "").trim();
  if (!s) return "?";
  if (s.length <= 3) return "***";
  return `***${s.slice(-3)}`;
}

/**
 * Local error boundary around the candidate card body. A render error in one
 * report component (e.g. legacy candidate with unexpected feedback shape) must
 * NOT take down the whole EmployerPanel and turn the page white. We show a
 * compact fallback inside the modal so the employer can close and try again.
 */
class CandidateBodyErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void; diag?: CandidateBoundaryDiag },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // Safe diagnostics — never logs PII or raw feedback content.
    // eslint-disable-next-line no-console
    console.error("[CandidateDetailsModal] render error", {
      message: String(error?.message || "").slice(0, 200),
      name: String(error?.name || ""),
      component_stack: String(info?.componentStack || "").slice(0, 1500),
      diag: this.props.diag || null,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center space-y-3">
          <div className="text-4xl">🤖</div>
          <div className="text-sm text-rose-200">
            Не удалось загрузить часть данных кандидата.
            Закройте карточку и попробуйте снова.
          </div>
          <button
            type="button"
            onClick={this.props.onClose}
            className="inline-flex items-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs"
          >
            Закрыть
          </button>
        </div>
      );
    }
    return this.props.children as any;
  }
}

/** Map raw job status / thrown error codes to user-facing copy. */
function humanizeAiError(code: string | null | undefined): string {
  const s = String(code || "").toLowerCase();
  if (!s) return "";
  if (s.includes("source_data_changed"))
    return "Данные кандидата изменились во время анализа. Запустите пересчёт ещё раз.";
  if (s === "validation_failed" || s.startsWith("schema_invalid"))
    return "ИИ вернул некорректный отчёт. Запустите пересчёт ещё раз.";
  if (s === "save_failed") return "Не удалось сохранить отчёт. Попробуйте позже.";
  if (s === "fallback_failed" || s === "primary_failed")
    return "ИИ-провайдеры временно недоступны. Повторите попытку чуть позже.";
  if (s === "orchestration_failed") return "Внутренняя ошибка. Попробуйте позже.";
  if (s === "runtime_no_background") return "Среда временно недоступна. Попробуйте позже.";
  if (s === "forbidden" || s === "candidate_not_found")
    return "Нет доступа к этому кандидату.";
  return "Не удалось сформировать общую AI-оценку.";
}
import {
  X, User as UserIcon, Mail, Phone, MessageSquare, FileText,
  CheckSquare, Briefcase, GraduationCap, Loader2, ExternalLink, Award,
  Building2, UserCheck, UserX, ChevronDown, ChevronUp, Clock, RefreshCw
} from "lucide-react";

/**
 * Employer-facing structured resume report (v2 / Phase 3B-2A).
 * Renders matches / gaps / strengths / risks / red_flags / questions_to_verify
 * when the new schema is present; falls back to the legacy {summary,strengths,
 * gaps} shape from the old synchronous function.
 *
 * IMPORTANT: this view is the ONLY place that shows employer-only fields
 * (verdict, risks, red_flags, questions_to_verify, employer_wishes). The
 * candidate cabinet must NEVER render these.
 */
function EmployerResumeReportView({ score, feedback, fallbackSummary, resumeText }: {
  score: any; feedback: any; fallbackSummary?: string | null; resumeText?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasFeedback = feedback && typeof feedback === "object" && !Array.isArray(feedback);
  const isV2 = hasFeedback && typeof (feedback as any).verdict === "string";
  const tone = scoreTone(score);

  const renderBody = () => {
    if (!hasFeedback && !fallbackSummary && !resumeText) {
      return (
        <div className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
          Резюме ещё не загружено и не оценено ИИ.
        </div>
      );
    }
    if (!isV2) {
      // Legacy fallback: old schema {summary,strengths,gaps} OR just a text summary.
      const f: any = hasFeedback ? feedback : {};
      const summary = f.summary || fallbackSummary || "";
      const strengths = Array.isArray(f.strengths) ? f.strengths : [];
      const gaps      = Array.isArray(f.gaps) ? f.gaps : [];
      return (
        <div className="space-y-3">
          {summary && (
            <div className={`text-[13px] rounded-xl p-3 border ${toneBg(tone.label)} text-white`}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-300 mb-1">Резюме оценил ИИ</div>
              <RichMarkdown tone="resume">{summary}</RichMarkdown>
            </div>
          )}
          {strengths.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mb-1">Сильные стороны</div>
              <ul className="text-[13px] text-slate-100 list-disc pl-5 space-y-1">{strengths.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}</ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300 mb-1">Пробелы</div>
              <ul className="text-[13px] text-slate-100 list-disc pl-5 space-y-1">{gaps.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}</ul>
            </div>
          )}
        </div>
      );
    }
    const f: any = feedback;
    const matches  = Array.isArray(f.matches) ? f.matches : [];
    const gaps     = Array.isArray(f.gaps) ? f.gaps : [];
    const strengths= Array.isArray(f.strengths) ? f.strengths : [];
    const risks    = Array.isArray(f.risks) ? f.risks : [];
    const redFlags = Array.isArray(f.red_flags) ? f.red_flags : [];
    const questions= Array.isArray(f.questions_to_verify) ? f.questions_to_verify : [];
    return (
      <div className="space-y-3">
        <div className={`rounded-xl p-3 border ${toneBg(tone.label)} text-white space-y-1.5`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">Вердикт</span>
            <span className={`text-[12px] font-bold ${tone.cls}`}>{String(f.verdict || "—")}</span>
            {Number.isFinite(Number(score)) && (
              <span className={`text-[12px] font-mono font-black ml-auto ${tone.cls}`}>{Math.round(Number(score))}/100</span>
            )}
          </div>
          <div className="text-[13.5px] leading-relaxed text-white">
            <RichMarkdown tone="resume">{String(f.summary || "")}</RichMarkdown>
          </div>
        </div>
        {matches.length > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">Соответствия требованиям</div>
            <ul className="space-y-1.5">
              {matches.map((m: any, i: number) => (
                <li key={i} className="text-[13px] text-slate-100">
                  <div className="font-semibold text-white">{m.criterion} <span className="text-[10px] font-mono uppercase text-emerald-300 ml-1">{m.degree}</span></div>
                  {m.evidence && <div className="text-slate-300 text-[12.5px]">{m.evidence}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {gaps.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300">Пробелы и расхождения</div>
            <ul className="space-y-1.5">
              {gaps.map((g: any, i: number) => (
                <li key={i} className="text-[13px] text-slate-100">
                  <div className="font-semibold text-white">{g.criterion}</div>
                  {g.finding && <div className="text-slate-300 text-[12.5px]">{g.finding}</div>}
                  {g.impact && <div className="text-[11.5px] italic text-amber-200/90">Влияние: {g.impact}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {strengths.length > 0 && (
          <div className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mb-1">Сильные стороны</div>
            <ul className="text-[13px] text-slate-100 list-disc pl-5 space-y-1">{strengths.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}</ul>
          </div>
        )}
        {risks.length > 0 && (
          <div className="bg-rose-500/5 border border-rose-400/30 rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-300">Риски</div>
            <ul className="space-y-1.5">
              {risks.map((r: any, i: number) => (
                <li key={i} className="text-[13px] text-slate-100">
                  <div className="font-semibold text-white">{r.title} <span className="text-[10px] font-mono uppercase text-rose-300 ml-1">{r.severity}</span></div>
                  {r.evidence && <div className="text-slate-300 text-[12.5px]">Свидетельство: {r.evidence}</div>}
                  {r.how_to_verify && <div className="text-[11.5px] italic text-slate-300">Как проверить: {r.how_to_verify}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {redFlags.length > 0 && (
          <div className="bg-rose-500/15 border border-rose-400/50 rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-200">Красные флаги</div>
            <ul className="space-y-1.5">
              {redFlags.map((r: any, i: number) => (
                <li key={i} className="text-[13px] text-slate-100">
                  <div className="font-semibold text-white">{r.title} <span className="text-[10px] font-mono uppercase text-rose-200 ml-1">{r.severity}</span></div>
                  {r.evidence && <div className="text-slate-200 text-[12.5px]">{r.evidence}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {questions.length > 0 && (
          <div className="bg-sky-500/10 border border-sky-400/30 rounded-xl p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-sky-300 mb-1">Что проверить на интервью</div>
            <ul className="text-[13px] text-slate-100 list-disc pl-5 space-y-1">{questions.map((q: any, i: number) => <li key={i}>{String(q)}</li>)}</ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderBody()}
      {resumeText && (
        <div className="bg-black/20 border border-white/10 rounded-2xl">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-mono uppercase tracking-wider text-slate-300 hover:text-white"
          >
            <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> Распознанный текст резюме</span>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {open && (
            <div className="px-4 pb-4 text-[14px] text-slate-100 leading-relaxed max-h-96 overflow-y-auto">
              <RichMarkdown tone="resume">{resumeText}</RichMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  registration: "Регистрация",
  screening: "Скрининг",
  checklist: "Чеклист",
  situations: "Ситуации",
  professional: "Профессия",
  product: "Продукт",
  systems: "Система",
  certified: "Сертификат",
};

/**
 * Backwards-compatible wrappers around the shared scoreTone helper so the
 * existing call sites (`scoreTone(v).cls`, `toneBg(tone.label)`) keep working
 * after we centralised the colour rules in `@/lib/scoreTone`.
 */
function scoreTone(value: any, max: number = 100): Tone & { cls: string } {
  const t = toneFor(value, max);
  return { ...t, cls: t.text };
}
function toneBg(label: Tone["label"]): string {
  return toneFor(label === "good" ? 100 : label === "mid" ? 50 : label === "bad" ? 10 : NaN).bg;
}

function Score({ label, value }: { label: string; value: any }) {
  const n = value === null || value === undefined ? null : Number(value);
  const tone = scoreTone(value);
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${toneBg(tone.label)}`}>
      <span className="text-[12px] text-slate-200 font-semibold">{label}</span>
      <span className={`text-base font-mono font-black ${tone.cls}`}>
        {n === null || Number.isNaN(n) ? "—" : `${Math.round(n)}/100`}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  const empty = value === null || value === undefined || value === "";
  if (empty) return null;
  return (
    <div className="bg-black/25 border border-white/10 rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[14px] mt-1 break-words text-white font-semibold">
        {String(value)}
      </div>
    </div>
  );
}

/**
 * Default export wraps the inner modal in an outer error boundary so a
 * render error in ANY part of the modal (including pre-JSX destructuring
 * of candidate_full_details, scores, or per-report adapters) cannot escape
 * into the parent EmployerPanel / AdminPanel and produce a white screen.
 *
 * Why this exists (root cause Phase A-3):
 *  - The previous inner `CandidateBodyErrorBoundary` sat INSIDE the modal
 *    component's own return tree, so any throw during the modal body's
 *    execution (e.g. legacy `employer_summary` with non-array `risks`,
 *    legacy `training_employer_feedback` shaped as a string, or
 *    `chkFbItems.map(...)` over a malformed jsonb cell) propagated PAST it
 *    to React root, unmounting EmployerPanel into a blank screen.
 *  - Wrapping at the OUTER boundary via this default export makes the
 *    boundary a true parent of every render path in the modal.
 *  - `key={candidateId ?? "none"}` resets the boundary state when the
 *    employer opens a different candidate so the fallback never sticks
 *    after switching cards.
 */
export default function CandidateDetailsModal(props: {
  candidateId: string | null;
  onClose: () => void;
}) {
  return (
    <CandidateBodyErrorBoundary
      key={props.candidateId ?? "none"}
      onClose={props.onClose}
    >
      <CandidateDetailsModalInner {...props} />
    </CandidateBodyErrorBoundary>
  );
}

export { CandidateBodyErrorBoundary };

function CandidateDetailsModalInner({
  candidateId,
  onClose,
}: {
  candidateId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState<null | "invited" | "rejected">(null);
  const [decisionMsg, setDecisionMsg] = useState("");
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [overallSaving, setOverallSaving] = useState(false);
  const [overallErr, setOverallErr] = useState<string | null>(null);
  const [overallStatus, setOverallStatus] = useState<string>("");
  const [trainingSummary, setTrainingSummary] = useState<any>(null);
  const [trainingSummaryLoading, setTrainingSummaryLoading] = useState(false);
  const [trainingSummaryErr, setTrainingSummaryErr] = useState<string | null>(null);
  const [stageQuestionMap, setStageQuestionMap] = useState<StageQuestionMap | null>(null);

  const loadTrainingSummary = React.useCallback(async () => {
    if (!candidateId) return;
    const { data: row } = await supabase
      .from("candidate_scores")
      .select("training_employer_feedback,training_candidate_feedback,training_summary_score,training_summary_generated_at,training_summary_source_hash")
      .eq("candidate_id", candidateId).maybeSingle();
    setTrainingSummary(row || null);
  }, [candidateId]);

  useEffect(() => { loadTrainingSummary(); }, [loadTrainingSummary]);

  const recomputeTrainingSummary = async () => {
    if (!candidateId) return;
    setTrainingSummaryLoading(true);
    setTrainingSummaryErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-evaluate-training-summary-v2", {
        body: { candidate_id: candidateId },
      });
      if (error) {
        let body: any = null;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") body = await ctx.json();
        } catch { /* ignore */ }
        throw new Error(body?.error || (error as any)?.message || "summary_failed");
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      await loadTrainingSummary();
    } catch (e: any) {
      setTrainingSummaryErr(e?.message || "Не удалось сформировать итог");
    } finally {
      setTrainingSummaryLoading(false);
    }
  };

  const markReview = async () => {
    if (!candidateId) return;
    setReviewSaving(true);
    setDecisionErr(null);
    try {
      const { error } = await (supabase as any).rpc("candidate_invite_decision", {
        _candidate: candidateId,
        _decision: "review",
        _message: "Кандидат взят на дополнительное рассмотрение.",
      });
      if (error) throw error;
      const { data: fresh } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
      setData(fresh);
    } catch (e: any) {
      setDecisionErr(e?.message || "Не удалось поставить статус «На рассмотрении»");
    } finally {
      setReviewSaving(false);
    }
  };

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      const { data, error } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setData(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  if (!candidateId) return null;

  const submitDecision = async () => {
    if (!candidateId || !decisionOpen) return;
    setDecisionSaving(true); setDecisionErr(null);
    try {
      const { error } = await (supabase as any).rpc("candidate_invite_decision", {
        _candidate: candidateId,
        _decision: decisionOpen,
        _message: decisionMsg.trim() || null,
      });
      if (error) throw error;
      // refresh
      const { data: fresh } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
      setData(fresh);
      setDecisionOpen(null);
      setDecisionMsg("");
    } catch (e: any) {
      setDecisionErr(e?.message || "Не удалось сохранить решение");
    } finally {
      setDecisionSaving(false);
    }
  };

  const c = data?.candidate || {};
  const p = data?.profile || {};
  const s = data?.scores || {};
  const co = data?.company || {};
  const pr = data?.project || {};
  const answers: any[] = data?.answers || [];
  const stageProgress: any[] = data?.stage_progress || [];
  const trainingProgress: any[] = data?.training_progress || [];
  const interviews: any[] = data?.interviews || [];
  const interviewBlocks: any[] = data?.interview_blocks || [];

  // Split answers by question category. The DB enum question_category has
  // values: checklist_prof, checklist_sys, train_prof, train_product,
  // train_sys, roleplay. Match by prefix so retakes / legacy free-form
  // categories ("чек-лист", "ситуация") are also captured.
  const catOf = (a: any) => String(a.question_category || a.category || "").toLowerCase();
  const checklistAnswers = answers.filter((a: any) => {
    const k = catOf(a);
    return k.startsWith("checklist") || k.includes("чек");
  });
  const situationAnswers = answers.filter((a: any) => {
    const k = catOf(a);
    return k === "roleplay" || k.includes("situation") || k.includes("ситуац") || k.includes("кейс");
  });
  const otherAnswers = answers.filter((a: any) => !checklistAnswers.includes(a) && !situationAnswers.includes(a));

  // Новый поток интервью хранит детальные ответы внутри candidate_scores.*_feedback.items,
  // а не в таблице candidate_answers. Достаём их оттуда, если основная коллекция пуста.
  const chkFbItems: any[] = Array.isArray((s as any)?.checklist_feedback?.items)
    ? (s as any).checklist_feedback.items
    : [];
  const sitFbItems: any[] = Array.isArray((s as any)?.situations_feedback?.items)
    ? (s as any).situations_feedback.items
    : [];
  const checklistAnswersView = checklistAnswers.length > 0
    ? checklistAnswers.map((a: any) => ({
        id: a.id,
        question_text: a.question_text,
        answer_text: a.answer_text,
        feedback: a.feedback,
        score: a.score,
        is_correct: a.is_correct,
        max: undefined,
      }))
    : chkFbItems.map((it: any, i: number) => ({
        id: it.id || `chk_${i}`,
        question_text: it.question || it.id,
        answer_text: it.answer || "",
        feedback: it.explanation || it.what_was_wrong || "",
        score: it.score,
        max: it.max,
        is_correct: it.verdict === "correct",
      }));
  const situationBlock = interviewBlocks.find((b: any) => String(b?.kind || "") === "situations");
  const situationCases: any[] = Array.isArray(situationBlock?.payload?.situations) ? situationBlock.payload.situations : [];
  const caseById = new Map(situationCases.map((x: any, i: number) => [String(x.id || `s${i + 1}`), x]));
  const situationAnswersView = situationAnswers.length > 0
    ? situationAnswers.map((a: any) => ({
        id: a.id,
        question_text: a.question_text,
        case_text: a.question_text,
        answer_text: a.answer_text,
        feedback: a.feedback,
        score: a.score,
        is_correct: a.is_correct,
      }))
    : sitFbItems.map((it: any, i: number) => ({
        id: it.id || `sit_${i}`,
        question_text: caseById.get(String(it.id))?.title || it.title || it.id,
        case_text: caseById.get(String(it.id))?.brief || it.brief || it.question || "",
        criteria: caseById.get(String(it.id))?.criteria || it.criteria || "",
        answer_text: it.answer || "",
        feedback: it.feedback || "",
        score: it.score,
        is_correct: undefined,
      }));

  /**
   * Phase 4 — overall AI candidate evaluation via the async v2 lifecycle.
   *
   * The button:
   *  - mints ONE request_id per click (`crypto.randomUUID`);
   *  - blocks double-click via `overallSaving`;
   *  - calls `ai-evaluate-overall-candidate-v2` (employer JWT);
   *  - polls `get_ai_job_safe_status` RPC until terminal;
   *  - re-reads candidate_full_details on success;
   *  - shows safe error on failure (terminal failures need a NEW request_id
   *    to retry, which means another button click).
   *
   * No RR billing, no overwrite of `overall_score`, no overwrite of
   * `assessment_summary` — the v2 RPC only touches the new fit fields.
   */
  const runOverallEvaluation = async () => {
    if (!candidateId || overallSaving) return;
    setOverallSaving(true);
    setOverallErr(null);
    setOverallStatus("primary_running");
    try {
      const started = await startOverallCandidateV2({ candidateId });
      if (started.terminal) {
        // Reused terminal — just refetch and surface the state.
        if (!isSuccess(started.status)) {
          setOverallErr(humanizeAiError(started.status));
        }
        clearEmployerActiveJob("overall_candidate", candidateId);
      } else {
        const final = await pollEmployerJobUntilTerminal({
          jobId: started.job_id,
          onTick: (row) => setOverallStatus(row.status),
        });
        clearEmployerActiveJob("overall_candidate", candidateId);
        if (!isSuccess(final.status)) {
          setOverallErr(humanizeAiError(final.status));
        }
      }
      const { data: fresh } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
      setData(fresh);
    } catch (e: any) {
      setOverallErr(humanizeAiError(e?.message || "Не удалось сформировать общую AI-оценку"));
    } finally {
      setOverallSaving(false);
      setOverallStatus("");
    }
  };

  // Restore an in-flight overall job if the modal was closed while polling.
  useEffect(() => {
    if (!candidateId) return;
    const rec = getEmployerActiveJob("overall_candidate", candidateId);
    if (!rec) return;
    let cancelled = false;
    (async () => {
      const row = await fetchEmployerJobStatus(rec.job_id);
      if (cancelled) return;
      if (!row) { clearEmployerActiveJob("overall_candidate", candidateId); return; }
      if (isTerminal(row.status)) {
        clearEmployerActiveJob("overall_candidate", candidateId);
        return;
      }
      setOverallSaving(true);
      setOverallStatus(row.status);
      try {
        const final = await pollEmployerJobUntilTerminal({
          jobId: rec.job_id,
          onTick: (r) => !cancelled && setOverallStatus(r.status),
        });
        if (cancelled) return;
        clearEmployerActiveJob("overall_candidate", candidateId);
        if (!isSuccess(final.status)) setOverallErr(humanizeAiError(final.status));
        const { data: fresh } = await supabase.rpc("candidate_full_details" as any, { _candidate: candidateId });
        if (!cancelled) setData(fresh);
      } catch (e: any) {
        if (!cancelled) setOverallErr(humanizeAiError(e?.message || "poll_failed"));
      } finally {
        if (!cancelled) { setOverallSaving(false); setOverallStatus(""); }
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  const name = c.full_name || c.resume_name || p.display_name || c.email || `Кандидат #${c.public_id || ""}`;
  const photo = p.avatar_url;
  const initials = (name || "?").split(/\s+/).slice(0, 2).map((x: string) => x[0]).join("").toUpperCase();
  const candidateLink = c.public_id && co.slug && pr.public_id
    ? `/${co.slug}/${pr.public_id}/cand${c.public_id}/profile`
    : null;

  // Итоговый бейдж ИИ-вердикта на основе среднего балла.
  const overallTone = scoreTone(s.overall_score);
  const overallBadge = (() => {
    if (overallTone.label === "good") return { text: "✓ Одобрен ИИ", cls: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40" };
    if (overallTone.label === "mid") return { text: "Подходит частично", cls: "bg-amber-500/20 text-amber-200 border-amber-400/40" };
    if (overallTone.label === "bad") return { text: "Не подходит", cls: "bg-rose-500/20 text-rose-200 border-rose-400/40" };
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl bg-gradient-to-b from-[#1E4468] to-[#17344F] border border-[#E7C768]/40 rounded-3xl shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-slate-200 z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="p-16 text-center text-slate-300 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Загрузка карточки...
          </div>
        ) : err ? (
          <div className="p-12 text-center text-rose-300">Ошибка: {err}</div>
        ) : !data ? (
          <div className="p-12 text-center text-slate-300">Нет данных</div>
        ) : (
          <div className="p-6 md:p-8 space-y-6 text-left">
            {/* Header / profile */}
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E7C768]/30 to-[#E7C768]/10 border border-[#E7C768]/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                {photo
                  ? <img src={photo} alt={name} className="w-full h-full object-cover" />
                  : <span className="text-[#E7C768] font-black text-xl">{initials || "?"}</span>}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-white truncate">{name}</h2>
                  {overallBadge && (
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${overallBadge.cls}`}>
                      {overallBadge.text}
                    </span>
                  )}
                  {c.hire_decision === "review" && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-amber-500/20 text-amber-200 border-amber-400/40">
                      На рассмотрении
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-300">{c.role_name || pr.role_name || "—"} · {co.name || "—"}</div>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-200">
                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                  {p.email && p.email !== c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {p.email}</span>}
                  {(c.phone || p.phone) && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone || p.phone}</span>}
                  {p.google_email && <span className="flex items-center gap-1 text-slate-400">Google: {p.google_email}</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {candidateLink && (
                    <a href={candidateLink} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300">
                      <ExternalLink className="w-3 h-3" /> Анкета кандидата
                    </a>
                  )}
                  {pr?.public_id && co?.slug && (
                    <a href={`/${co.slug}/${pr.public_id}`} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300">
                      <ExternalLink className="w-3 h-3" /> Вакансия
                    </a>
                  )}
                  {co?.slug && (
                    <a href={`/${co.slug}`} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-300">
                      <ExternalLink className="w-3 h-3" /> Компания
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Scores grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Score label="Резюме" value={s.resume_score} />
              <Score label="Чеклист" value={s.checklist_score} />
              <Score label="Ситуации" value={s.situations_score} />
              <Score label="Средний балл" value={s.overall_score} />
            </div>

            {/* Hire decision block */}
            <div className="bg-black/25 border border-[#E7C768]/30 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2 mb-3">
                <UserCheck className="w-3.5 h-3.5" /> Решение по кандидату
              </h3>
              {c.hire_decision ? (
                <div className="space-y-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                    c.hire_decision === "invited"
                      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                      : c.hire_decision === "review"
                        ? "bg-amber-500/20 text-amber-200 border border-amber-400/40"
                        : "bg-rose-500/20 text-rose-200 border border-rose-400/40"
                  }`}>
                    {c.hire_decision === "invited"
                      ? <><UserCheck className="w-3.5 h-3.5" /> Приглашён на работу</>
                      : c.hire_decision === "review"
                        ? <><Clock className="w-3.5 h-3.5" /> На рассмотрении</>
                        : <><UserX className="w-3.5 h-3.5" /> Отказано</>}
                  </div>
                  {c.hire_decided_at && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(c.hire_decided_at).toLocaleString("ru-RU")}
                    </div>
                  )}
                  {c.hire_message && (
                    <div className="bg-black/30 rounded-xl border border-white/10 p-3 text-[12px] text-white/90 whitespace-pre-wrap">
                      {c.hire_message}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setDecisionOpen(c.hire_decision === "invited" ? "rejected" : "invited"); setDecisionMsg(c.hire_message || ""); }}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white"
                    >
                      Изменить решение
                    </button>
                    {c.hire_decision !== "review" && (
                      <button
                        type="button"
                        disabled={reviewSaving}
                        onClick={markReview}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-100 disabled:opacity-50"
                      >
                        На рассмотрении
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setDecisionOpen("invited"); setDecisionMsg(""); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow hover:-translate-y-0.5 transition"
                  >
                    <UserCheck className="w-4 h-4" /> Пригласить на работу
                  </button>
                  <button
                    type="button"
                    disabled={reviewSaving}
                    onClick={markReview}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-sm shadow hover:-translate-y-0.5 transition disabled:opacity-50"
                  >
                    <Clock className="w-4 h-4" /> На рассмотрении
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDecisionOpen("rejected"); setDecisionMsg(""); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm transition"
                  >
                    <UserX className="w-4 h-4" /> Отказать
                  </button>
                </div>
              )}
            </div>

            {decisionOpen && (
              <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !decisionSaving && setDecisionOpen(null)}>
                <div className="bg-gradient-to-b from-[#1E4468] to-[#17344F] border border-[#E7C768]/40 rounded-3xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <h4 className="text-lg font-bold text-white mb-3">
                    {decisionOpen === "invited" ? "Пригласить на работу" : "Отказать кандидату"}
                  </h4>
                  <p className="text-xs text-slate-300 mb-3">
                    Кандидат увидит ваше сообщение в личном кабинете и получит уведомление.
                  </p>
                  <textarea
                    value={decisionMsg}
                    onChange={e => setDecisionMsg(e.target.value)}
                    placeholder={decisionOpen === "invited"
                      ? "Напишите кандидату: когда выйти, как связаться, какие шаги дальше…"
                      : "Кратко объясните причину отказа (по желанию)…"}
                    rows={5}
                    className="w-full bg-black/30 border border-white/15 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E7C768]"
                  />
                  {decisionErr && <div className="text-rose-300 text-xs mt-2">{decisionErr}</div>}
                  <div className="flex gap-2 justify-end mt-4">
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={() => setDecisionOpen(null)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-semibold"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={submitDecision}
                      className={`px-4 py-2 rounded-xl text-white text-sm font-bold inline-flex items-center gap-2 ${
                        decisionOpen === "invited"
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
                          : "bg-gradient-to-r from-rose-500 to-rose-600"
                      }`}
                    >
                      {decisionSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {decisionOpen === "invited" ? "Пригласить" : "Отправить отказ"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Tabs defaultValue="general" className="space-y-4">
              <TabsList className="bg-[#1E4468]/85 border border-white/15 p-1 rounded-2xl flex flex-wrap h-auto gap-1">
                <TabsTrigger value="general" className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl">
                  👤 Общая
                </TabsTrigger>
                <TabsTrigger value="resume" className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl">
                  📄 Резюме
                </TabsTrigger>
                <TabsTrigger value="checklist" className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl">
                  ✅ Анкета
                </TabsTrigger>
                <TabsTrigger value="situations" className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl">
                  💬 Ситуации
                </TabsTrigger>
                <TabsTrigger value="overall" className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl">
                  🏆 Общая оценка
                </TabsTrigger>
                <TabsTrigger value="training" className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl">
                  🎓 Обучение
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6 mt-0">
            {/* Company + vacancy block (names, not only links) */}
            <div className="bg-black/20 border border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-[#E7C768] mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Компания</div>
                  <div className="text-sm font-bold text-white truncate">{co.name || "—"}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="w-4 h-4 text-[#E7C768] mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase text-slate-400">Вакансия</div>
                  <div className="text-sm font-bold text-white truncate">{c.role_name || pr.role_name || "—"}</div>
                </div>
              </div>
            </div>

            {/* Профиль кандидата — только заполненные поля, без техн. данных */}
            {(() => {
              const fields: { label: string; value: any }[] = [
                { label: "ФИО", value: c.full_name || c.resume_name },
                { label: "Email", value: c.email },
                { label: "Телефон", value: c.phone },
                { label: "Должность", value: c.role_name },
                { label: "Зарегистрирован", value: c.created_at ? new Date(c.created_at).toLocaleString("ru-RU") : null },
                { label: "Telegram", value: c.social_telegram },
                { label: "WhatsApp", value: c.social_whatsapp },
                { label: "Instagram", value: c.social_instagram },
                { label: "VK", value: c.social_vk },
                { label: "MAX", value: c.social_max },
                { label: "Setka", value: c.social_setka },
                { label: "GitHub", value: c.social_github },
              ];
              const nonEmpty = fields.filter(f => f.value !== null && f.value !== undefined && f.value !== "");
              if (nonEmpty.length === 0) return null;
              return (
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><UserIcon className="w-4 h-4" /> Профиль кандидата</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {nonEmpty.map(f => <Field key={f.label} label={f.label} value={f.value} />)}
                  </div>
                </div>
              );
            })()}

              </TabsContent>

              <TabsContent value="resume" className="space-y-6 mt-0">
            <EmployerResumeReportView score={s.resume_score} feedback={s.resume_feedback} fallbackSummary={s.assessment_summary} resumeText={c.resume_text} />
              </TabsContent>

              <TabsContent value="checklist" className="space-y-6 mt-0">
            {/* v2 structured employer report. Falls back to legacy answer list
                if the new candidate_scores.checklist_feedback is missing. */}
            {((s as any)?.checklist_feedback || (s as any)?.checklist_score != null) ? (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                <EmployerChecklistReport
                  view={adaptEmployerChecklist((s as any)?.checklist_feedback)}
                  score={(s as any)?.checklist_score ?? null}
                />
              </div>
            ) : checklistAnswersView.length > 0 ? (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Ответы на анкету (чек-лист)</h3>
                <div className="space-y-2 max-h-[40rem] overflow-y-auto pr-1">
                  {checklistAnswersView.map((a: any, idx: number) => {
                    const max = a.max ?? 10;
                    const tone = scoreTone(a.score, max);
                    const qText = a.question_text || (a.question_id ? a.question_id.slice(0, 8) + "…" : `Вопрос ${idx + 1}`);
                    const short = qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
                    return (
                      <details key={a.id} className={`group rounded-xl border border-l-4 bg-black/20 ${toneBg(tone.label)} ${tone.border} overflow-hidden`}>
                        <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center gap-3 select-none">
                          <span className="text-[11px] font-mono text-slate-400 shrink-0 w-6">{idx + 1}.</span>
                          <span className="text-[13px] font-semibold text-white leading-[1.4] flex-1">{short}</span>
                          <span className={`text-[11px] font-mono font-bold shrink-0 px-2 py-0.5 rounded ${tone.badge}`}>
                            {a.score !== null && a.score !== undefined
                              ? `${Math.round(Number(a.score))}/${max}`
                              : (a.is_correct ? "✓" : "—")}
                          </span>
                          <span className="text-slate-400 text-xs shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5">
                          {qText && short !== qText && (
                            <div className="text-[12.5px] text-white/90 leading-[1.6]">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">Вопрос:</span>{qText}
                            </div>
                          )}
                          <div className="text-[13px] text-slate-100 leading-relaxed bg-black/25 border border-white/10 rounded-lg p-2.5">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Ответ кандидата</div>
                            {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-slate-500">(пусто)</span>}
                          </div>
                          {a.feedback && (
                            <div className={`text-[12px] italic ${tone.text} leading-[1.6]`}>
                              <span className="not-italic text-[10px] font-mono uppercase tracking-wider mr-1">Комментарий ИИ:</span>{a.feedback}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
                Кандидат ещё не отвечал на анкету.
              </div>
            )}
              </TabsContent>

              <TabsContent value="situations" className="space-y-6 mt-0">
            {((s as any)?.situations_feedback || (s as any)?.situations_score != null) ? (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                <EmployerSituationsReport
                  view={adaptEmployerSituations((s as any)?.situations_feedback)}
                  score={(s as any)?.situations_score ?? null}
                />
              </div>
            ) : situationAnswersView.length > 0 ? (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Ответы по ситуациям</h3>
                <div className="space-y-2 max-h-[40rem] overflow-y-auto pr-1">
                  {situationAnswersView.map((a: any, idx: number) => {
                    const tone = scoreTone(a.score, 100);
                    const qText = a.question_text || `Ситуация ${idx + 1}`;
                    const short = qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
                    return (
                      <details key={a.id} className={`group rounded-xl border border-l-4 bg-black/20 ${toneBg(tone.label)} ${tone.border} overflow-hidden`}>
                        <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center gap-3 select-none">
                          <span className="text-[11px] font-mono text-slate-400 shrink-0 w-6">{idx + 1}.</span>
                          <span className="text-[13px] font-semibold text-white leading-[1.4] flex-1">{short}</span>
                          <span className={`text-[11px] font-mono font-bold shrink-0 px-2 py-0.5 rounded ${tone.badge}`}>
                            {a.score !== null && a.score !== undefined
                              ? `${Math.round(Number(a.score))}/100`
                              : (a.is_correct ? "✓" : "—")}
                          </span>
                          <span className="text-slate-400 text-xs shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5">
                          {a.case_text && a.case_text !== a.question_text && (
                            <div className="rounded-lg bg-black/25 border border-white/10 p-3 text-[12px] text-slate-200 leading-relaxed">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-[#E7C768] mb-1">Ситуация / кейс</div>
                              <RichMarkdown tone="chat">{a.case_text}</RichMarkdown>
                            </div>
                          )}
                          {a.criteria && (
                            <div className="text-[11px] text-slate-300 leading-relaxed">
                              <span className="text-[#E7C768] font-bold">Критерии оценки:</span> {a.criteria}
                            </div>
                          )}
                          <div className="text-[13px] text-slate-100 leading-relaxed bg-black/25 border border-white/10 rounded-lg p-2.5">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Ответ кандидата</div>
                            {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-slate-500">(пусто)</span>}
                          </div>
                          {a.feedback && (
                            <div className={`text-[12px] italic ${tone.text} leading-[1.6]`}>
                              <span className="not-italic text-[10px] font-mono uppercase tracking-wider mr-1">Комментарий ИИ:</span>{a.feedback}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
                Кандидат ещё не проходил ситуации.
              </div>
            )}
              </TabsContent>

              <TabsContent value="overall" className="space-y-6 mt-0">
                <EmployerOverallReport
                  fitScore={(s as any).ai_fit_score}
                  overallScore={s.overall_score}
                  employerFeedback={(s as any).employer_overall_feedback}
                />

                <div className="bg-black/20 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" /> Совокупная AI-оценка соответствия
                    </h3>
                    <p className="text-[12px] text-slate-300 mt-1">
                      ИИ перечитает резюме, анкету, ситуации, обучение и пожелания работодателя.
                      Средний балл этапов и stage-feedback не перезаписываются.
                    </p>
                    {overallSaving && (
                      <div className="text-[12px] text-slate-300 mt-2" data-testid="overall-status">
                        Идёт анализ… {overallStatus ? `(${overallStatus})` : ""}
                      </div>
                    )}
                    {overallErr && (
                      <div className="text-rose-300 text-xs mt-2" data-testid="overall-error">{overallErr}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid="recalc-overall-btn"
                    disabled={overallSaving}
                    onClick={runOverallEvaluation}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-black text-xs shadow disabled:opacity-50"
                  >
                    {overallSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Пересчитать AI-оценку
                  </button>
                </div>
              </TabsContent>

              <TabsContent value="training" className="space-y-4 mt-0">
                {(() => {
                  const STAGE_DEFS: { key: string; aliases: string[]; title: string; icon: string }[] = [
                    { key: "professional", aliases: ["professional", "prof", "профессия"], title: "Профессия", icon: "💼" },
                    { key: "product", aliases: ["product", "продукт"], title: "Продукт", icon: "🎁" },
                    { key: "system", aliases: ["system", "systems", "система", "системное"], title: "Система", icon: "⚙️" },
                  ];
                  const findFor = (key: string) => {
                    const def = STAGE_DEFS.find(d => d.key === key)!;
                    return stageProgress.find((sp: any) =>
                      def.aliases.some(a => String(sp.stage || "").toLowerCase().includes(a)),
                    );
                  };
                  const total = stageProgress.length;
                  const renderStage = (def: { key: string; title: string; icon: string }) => {
                        const sp: any = findFor(def.key);
                        if (!sp) {
                          return (
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
                              <span className="text-lg mr-1">{def.icon}</span> Кандидат ещё не приступал к этапу «{def.title}».
                            </div>
                          );
                        }
                        const passed = !!sp.passed_at;
                        const status: "passed" | "in_progress" | "not_started" = passed ? "passed" : "in_progress";
                        const score = sp.last_score ?? sp.best_score ?? null;
                        const max = 100; // training stage scoring is normalized to 100
                        const passScore = 70;
                        const summary = (sp.employer_summary && typeof sp.employer_summary === "object") ? sp.employer_summary : null;
                        return (
                          <EmployerTrainingStageReport
                            status={status}
                            score={score}
                            max={max}
                            passScore={passScore}
                            summary={summary}
                            perQuestionLegacy={Array.isArray(sp.last_feedback) ? sp.last_feedback.map((pq: any) => ({
                              ...pq,
                              question: pq.question || (sp.last_answers || []).find((a: any) => a.question_id === pq.id)?.question_text,
                            })) : []}
                            lastAnswers={Array.isArray(sp.last_answers) ? sp.last_answers : []}
                          />
                        );
                  };
                  return (
                    <Tabs defaultValue="professional" className="space-y-3">
                      <TabsList className="bg-[#17344F]/70 border border-white/10 p-1 rounded-2xl flex flex-wrap h-auto gap-1">
                        {STAGE_DEFS.map(d => (
                          <TabsTrigger
                            key={d.key}
                            value={d.key}
                            className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl"
                          >
                            {d.icon} {d.title}
                          </TabsTrigger>
                        ))}
                        <TabsTrigger
                          value="__summary"
                          data-testid="training-summary-tab"
                          className="data-[state=active]:bg-[#1E4468] data-[state=active]:text-[#E7C768] text-slate-300 font-bold text-xs px-4 py-2 rounded-xl"
                        >
                          🏆 Итого
                        </TabsTrigger>
                      </TabsList>
                      {STAGE_DEFS.map(d => (
                        <TabsContent key={d.key} value={d.key} className="mt-0">
                          {renderStage(d)}
                        </TabsContent>
                      ))}
                      <TabsContent value="__summary" className="mt-0 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-400">
                            {trainingSummary?.training_summary_generated_at
                              ? <>Сформирован: {new Date(trainingSummary.training_summary_generated_at).toLocaleString()}</>
                              : <>Итог обучения ещё не сформирован.</>}
                          </div>
                          <button
                            type="button"
                            data-testid="recalc-training-summary-btn"
                            disabled={trainingSummaryLoading}
                            onClick={recomputeTrainingSummary}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-black text-xs shadow disabled:opacity-50"
                          >
                            {trainingSummaryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Сформировать итог
                          </button>
                        </div>
                        {trainingSummaryErr && (
                          <div className="text-[12px] text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                            {trainingSummaryErr}
                          </div>
                        )}
                        <EmployerTrainingSummaryReport
                          report={trainingSummary?.training_employer_feedback || null}
                        />
                      </TabsContent>
                    </Tabs>
                  );
                })()}
              </TabsContent>
            </Tabs>

            {/* === Дополнительные блоки (вне табов) === */}
            {/* Interview transcripts */}
            {interviews.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Интервью</h3>
                {interviews.map((i) => (
                  <div key={i.id} className="text-[11px] text-slate-300">
                    <div className="text-slate-400 font-mono text-[10px]">#{i.public_id} · {i.status} · {i.started_at ? new Date(i.started_at).toLocaleString() : "—"}</div>
                    {i.transcript_text && (
                      <div className="mt-1 max-h-40 overflow-y-auto bg-black/20 p-2 rounded">
                        <RichMarkdown tone="chat">{i.transcript_text}</RichMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {otherAnswers.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide">Прочие ответы</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {otherAnswers.map((a: any) => (
                    <div key={a.id} className="bg-black/30 rounded-lg p-2 border border-white/5">
                      <div className="text-[11px] font-semibold text-white">{a.question_text || a.question_id?.slice(0, 8) + "…"}</div>
                      <div className="text-[11px] text-slate-200 mt-1">
                        {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-slate-500">(пусто)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Training quizzes */}
            {trainingProgress.length > 0 && (
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#E7C768] uppercase tracking-wide flex items-center gap-2"><GraduationCap className="w-3.5 h-3.5" /> Обучение / Тесты</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {trainingProgress.map((tp) => (
                    <div key={tp.id} className="bg-black/30 rounded-lg p-2 border border-white/5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400">Урок {tp.lesson_id?.slice(0, 8)}…</span>
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${tp.passed ? "bg-emerald-500/20 text-emerald-300" : tp.is_completed ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-slate-300"}`}>
                          {tp.score !== null && tp.score !== undefined ? `${Math.round(Number(tp.score))}/100` : (tp.is_completed ? "завершён" : "в процессе")}
                        </span>
                      </div>
                      {tp.quiz_feedback && <div className="text-[10.5px] text-amber-200 mt-1">{tp.quiz_feedback}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certification */}
            {c.crm_stage === "certified" && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
                <Award className="w-6 h-6 text-emerald-300" />
                <div>
                  <div className="text-sm font-bold text-emerald-200">Кандидат сертифицирован</div>
                  <div className="text-[11px] text-emerald-100/70">Прошёл все этапы воронки.</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
