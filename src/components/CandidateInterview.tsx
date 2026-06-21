import { useEffect, useMemo, useRef, useState } from "react";
import { Loader, FileText, CheckCircle, MessageSquare, Award, RefreshCw, Send, Upload, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import { getCandidateSession } from "@/lib/candidateSession";
import { useAIReady } from "@/lib/aiReady";
import { aiRestart } from "@/lib/aiClient";
import EmbeddedMarkdown from "@/components/EmbeddedMarkdown";
import RichMarkdown from "@/components/RichMarkdown";
import ResumeDropzone from "@/components/ResumeDropzone";
import DisclosureBlock from "@/components/DisclosureBlock";
import { VacancyPausedDialog, isVacancyPausedError } from "@/components/VacancyPausedDialog";
import { toUserError, formatUserError } from "@/lib/userError";
import {
  startResumeScreenV2, pollJobUntilTerminal,
  getActiveJob, clearActiveJob, isSuccess, isTerminal,
} from "@/lib/aiJobs";
import { describeJobError } from "@/lib/feedbackAdapters";
import { useCandidateAiJob } from "@/hooks/useCandidateAiJob";
import { adaptCandidateChecklist, adaptCandidateSituations } from "@/lib/feedbackAdapters";
import CandidateChecklistReport from "@/components/reports/CandidateChecklistReport";
import CandidateSituationsReport from "@/components/reports/CandidateSituationsReport";
import CandidateOverallReport from "@/components/reports/CandidateOverallReport";

type Stage = "resume" | "checklist" | "situations" | "done";

/**
 * Safe diagnostic logger for the resume-submit pipeline. We log ONLY short
 * status tags + safe codes — never the resume text, candidate token, email
 * or full URL with parameters. Lands in browser console; the lovable error
 * reporter forwards selected entries to client_errors.
 */
function rrLog(event: string, extra?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.info(`[rr_resume] ${event}`, extra || {});
  } catch { /* ignore */ }
}

/** Map a safe error code (from edge function or pre-invoke throw) to RU copy. */
function describeResumeSubmitError(code: string): string {
  const s = String(code || "").toLowerCase();
  if (s === "candidate_session_missing" || s === "candidate_token_required" || s === "bad_token") {
    return "Сессия кандидата истекла. Войдите снова, чтобы продолжить.";
  }
  if (s === "no_resume") return "Резюме слишком короткое или не сохранилось. Добавьте больше текста и повторите.";
  if (s === "no_project") return "Вакансия не привязана к вашему профилю. Откройте ссылку вакансии заново.";
  if (s === "no_credits") return "У работодателя закончились средства на ИИ-собеседование. Свяжитесь с ним напрямую.";
  if (s === "resume_save_failed") return "Не удалось сохранить резюме. Повторите попытку через минуту.";
  if (s === "runtime_no_background") return "Сервер ИИ временно недоступен. Повторите попытку чуть позже.";
  if (s === "bad_request_id" || s === "bad_async_version" || s === "bad_body") {
    return "Не удалось отправить запрос. Перезагрузите страницу и повторите.";
  }
  if (s === "job_create_failed") return "Не удалось создать задание. Попробуйте ещё раз через минуту.";
  if (s === "failed to fetch" || s === "networkerror" || s.includes("network")) {
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  }
  // Fall through to the generic AI-job describer for terminal statuses.
  const generic = describeJobError(s);
  return generic || "Не удалось отправить резюме на оценку. Повторите попытку.";
}

type Question = { id: string; kind: "choice" | "text"; question: string; options?: string[] | null };
type Situation = { id: string; title: string; brief: string };

function shuffleArr<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type Props = {
  projectId: string;
  candidateId: string;
  onCompleted?: (passed: boolean, score: number) => void;
};

// FN импортируется из единого конфига — используется только для multipart/FormData запросов.
import { FN } from "@/config";

async function call(fn: string, body: any) {
  // Кандидат не использует Supabase Auth — передаём его opaque-токен из localStorage.
  let candidateToken: string | null = null;
  try {
    const raw = localStorage.getItem("cand_session");
    if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
  } catch { /* ignore */ }
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { ...body, candidate_token: candidateToken },
    headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
  });
  // Сначала проверяем тело ответа: оно может содержать job_id + fallback_available
  // даже при HTTP-ошибке (Supabase invoke оборачивает 5xx, но data приходит).
  const errCode = (data as any)?.error || (error as any)?.message || null;
  if (errCode) {
    const e: any = new Error(errCode);
    e.jobId = (data as any)?.job_id || null;
    e.fallbackAvailable = !!(data as any)?.fallback_available;
    throw e;
  }
  if (error) {
    throw new Error(`fn_${fn}_failed`);
  }
  return data as any;
}

export default function CandidateInterview({ projectId, candidateId, onCompleted }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const [stage, setStage] = useState<Stage>("resume");
  const [passScore, setPassScore] = useState(75);
  // Vacancy paused (no employer funds)
  const [paused, setPaused] = useState<null | { email?: string|null; phone?: string|null; telegram?: string|null }>(null);
  // Rich AI feedback restored from DB
  const [checklistFeedback, setChecklistFeedback] = useState<any>(null);

  // resume
  const [resumeText, setResumeText] = useState("");
  const [resumeResult, setResumeResult] = useState<{
    score: number;
    summary: string;
    strengths: string[];
    gaps: string[];
    areas_to_clarify?: string[];
    recommendations?: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ bucket: string; path: string; filename: string } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeEditMode, setResumeEditMode] = useState(false);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [resumeTooShortOpen, setResumeTooShortOpen] = useState(false);
  const resumeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const restartFiredRef = useRef<string | null>(null);

  // checklist
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffleChecklist, setShuffleChecklist] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checklistScore, setChecklistScore] = useState<number | null>(null);

  // situations
  const [situations, setSituations] = useState<Situation[]>([]);
  const [sitAnswers, setSitAnswers] = useState<Record<string, string>>({});
  const [situationsScore, setSituationsScore] = useState<number | null>(null);
  const [situationsFeedback, setSituationsFeedback] = useState<{ id: string; feedback: string; score: number }[]>([]);
  // Raw structured object (prefers `candidate_situations_feedback`; falls back
  // to legacy `situations_feedback` only as a SAFE TEXT path through the
  // adapter — employer-only fields are stripped before reaching the UI).
  const [situationsFeedbackRaw, setSituationsFeedbackRaw] = useState<any>(null);

  const [finalScore, setFinalScore] = useState<number | null>(null);
  // Optional combined-feedback (Phase 4). Shown ONLY if the employer ran the
  // overall AI evaluation; otherwise the block stays hidden. Strictly the
  // candidate-facing object — no employer-only keys.
  const [candOverallFeedback, setCandOverallFeedback] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // NOTE (Pass A): /restart is NOT fired on page open. It produced a
      // visible "AI restart" overlay before the candidate even submitted a
      // resume and reset the AI context for nothing. The actual provider
      // reset (RR Pro Max fallback) happens server-side inside the AI
      // attempt — ProTalk primary uses a per-job chatId so no restart is
      // required. See ai-interview-screen-resume-v2 / RrProMaxProvider.restart.
      // Gate 1: can this candidate actually start an interview right now?
      try {
        const { data: gate } = await (supabase as any).rpc("can_start_interview", { _candidate: candidateId });
        if (gate && gate.ok === false && gate.reason === "no_funds") {
          setPaused(gate.employer_contacts || {});
          return;
        }
      } catch {}

      const { data: pr } = await (supabase as any).from("projects").select("interview_pass_score").eq("id", projectId).maybeSingle();
      setPassScore((pr as any)?.interview_pass_score ?? 75);
      // Re-hydrate the previously recognised resume text from DB so a reload
      // (or any state wipe) never loses it. Without this, ai-ingest-document
      // saves the text server-side but the submit button would still send an
      // empty body and the screen function would fail with no_resume.
      try {
        const { data: candRow } = await (supabase as any)
          .from("candidates")
          .select("resume_text")
          .eq("id", candidateId)
          .maybeSingle();
        const txt = String((candRow as any)?.resume_text || "");
        if (txt.trim().length >= 1) setResumeText(txt);
      } catch { /* ignore */ }
      const r = await call("ai-list-interview-checklist", { project_id: projectId });
      const qs: Question[] = r.questions || [];
      const doShuffle = r.shuffle !== false;
      setShuffleChecklist(doShuffle);
      setQuestions(doShuffle
        ? shuffleArr(qs).map(q => q.kind === "choice" && q.options ? { ...q, options: shuffleArr(q.options) } : q)
        : qs);
      setSituations(r.situations || []);
      // try fetch existing scores
      const { data: sc } = await (supabase as any).from("candidate_scores")
        .select("resume_score,checklist_score,situations_score,assessment_summary,resume_feedback,checklist_feedback,situations_feedback,candidate_resume_feedback,candidate_checklist_feedback,candidate_situations_feedback,candidate_overall_feedback")
        .eq("candidate_id", candidateId).maybeSingle();
      if (sc) {
        if (sc.resume_score != null) {
          // Prefer the new candidate-facing report (v2). It never contains
          // employer-only fields (risks, red_flags, employer verdict, etc.).
          const crf = (sc as any).candidate_resume_feedback || null;
          const rf  = sc.resume_feedback || {};
          if (crf && typeof crf === "object") {
            setResumeResult({
              score: sc.resume_score,
              summary: String(crf.summary || sc.assessment_summary || ""),
              strengths: Array.isArray(crf.strengths) ? crf.strengths : [],
              gaps: [],
              areas_to_clarify: Array.isArray(crf.areas_to_clarify) ? crf.areas_to_clarify : [],
              recommendations: Array.isArray(crf.recommendations) ? crf.recommendations : [],
            });
          } else {
            // Legacy fallback: old synchronous function stored {summary, strengths, gaps}
            // directly under resume_feedback. Show without employer-only sections.
            setResumeResult({
              score: sc.resume_score,
              summary: sc.assessment_summary || rf.summary || "",
              strengths: Array.isArray(rf.strengths) ? rf.strengths : [],
              gaps: Array.isArray(rf.gaps) ? rf.gaps : [],
            });
          }
        }
        if (sc.checklist_score != null) setChecklistScore(sc.checklist_score);
        // Prefer candidate-facing feedback (v2). The adapter strips employer-only
        // fields from the legacy column when used as a fallback.
        const candChk = (sc as any).candidate_checklist_feedback;
        if (candChk) setChecklistFeedback(candChk);
        else if (sc.checklist_feedback) setChecklistFeedback(sc.checklist_feedback);
        if (sc.situations_score != null) setSituationsScore(sc.situations_score);
        const candSit = (sc as any).candidate_situations_feedback;
        if (candSit) setSituationsFeedbackRaw(candSit);
        else if (sc.situations_feedback) setSituationsFeedbackRaw(sc.situations_feedback);
        if (sc.situations_feedback?.items) setSituationsFeedback(sc.situations_feedback.items);
        const candOverall = (sc as any).candidate_overall_feedback;
        if (candOverall && typeof candOverall === "object") setCandOverallFeedback(candOverall);
        // Восстанавливаем итоговый балл, чтобы вкладка «4. Итог» открывалась
        // при возврате на страницу собеседования после прохождения всех этапов.
        const { data: scFull } = await (supabase as any)
          .from("candidate_scores")
          .select("overall_score")
          .eq("candidate_id", candidateId)
          .maybeSingle();
        if (scFull?.overall_score != null) {
          setFinalScore(Math.round(Number(scFull.overall_score)));
        }
        // Auto-jump to first incomplete stage
        if (sc.situations_score == null && sc.checklist_score != null) setStage("situations");
        else if (sc.checklist_score == null && sc.resume_score != null) setStage("checklist");
      }
    })();
  }, [projectId, candidateId]);

  // Re-hydrate active v2 resume job after reload/refocus. Never starts a NEW
  // job — only resumes polling on whatever job_id the user already launched.
  useEffect(() => {
    const rec = getActiveJob("screen_resume", candidateId);
    if (!rec) return;
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const row = await pollJobUntilTerminal({ jobId: rec.job_id, signal: ac.signal });
        if (cancelled) return;
        if (isSuccess(row.status)) {
          await refetchCandidateScores();
        }
      } catch { /* aborted or timeout */ }
      finally { if (!cancelled) clearActiveJob("screen_resume", candidateId); }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [candidateId]);

  // Resume stage entry — fire /restart with overlay so ProTalk drops any
  // prior context for this candidate before file recognition. Runs once per
  // (candidate × visit-to-stage) and re-runs on retake (resumeResult cleared).
  useEffect(() => {
    if (stage !== "resume") return;
    if (resumeResult) return; // already scored — nothing to restart
    const key = `${candidateId}:resume`;
    if (restartFiredRef.current === key) return;
    restartFiredRef.current = key;
    // Clear the aiRestart dedup so retakes always trigger a fresh restart.
    try { sessionStorage.removeItem(`ai_restart_dedup:cand:${candidateId}`); } catch { /* ignore */ }
    void aiWaitRun({
      title: "Сбрасываю контекст ИИ для нового интервью…",
      task: () => aiRestart(undefined, { candidate_id: candidateId }),
    }).catch(() => { /* non-fatal — recognition will still try */ });
  }, [stage, resumeResult, candidateId, aiWaitRun]);

  // Reload-recovery for checklist v2 job. Resumes polling, never re-starts;
  // on terminal success refetches DB so candidate sees fresh score/feedback.
  // NOTE (D1a-FIX): reload-recovery for checklist_grade and situations_grade
  // is now owned by useCandidateAiJob (single lifecycle owner). The hook
  // mounts, reads namespaced active job from localStorage, resumes polling
  // and fires onSuccess/onFailure exactly once per jobId. No parallel
  // pollJobUntilTerminal loop is allowed for v2 grading.

  const refetchCandidateScores = async () => {
    const { data: sc } = await (supabase as any).from("candidate_scores")
      .select("resume_score,assessment_summary,resume_feedback,candidate_resume_feedback")
      .eq("candidate_id", candidateId).maybeSingle();
    if (!sc || sc.resume_score == null) return;
    const crf = (sc as any).candidate_resume_feedback;
    if (crf && typeof crf === "object") {
      setResumeResult({
        score: sc.resume_score,
        summary: String(crf.summary || sc.assessment_summary || ""),
        strengths: Array.isArray(crf.strengths) ? crf.strengths : [],
        gaps: [],
        areas_to_clarify: Array.isArray(crf.areas_to_clarify) ? crf.areas_to_clarify : [],
        recommendations: Array.isArray(crf.recommendations) ? crf.recommendations : [],
      });
    } else {
      const rf = sc.resume_feedback || {};
      setResumeResult({
        score: sc.resume_score,
        summary: sc.assessment_summary || rf.summary || "",
        strengths: Array.isArray(rf.strengths) ? rf.strengths : [],
        gaps: Array.isArray(rf.gaps) ? rf.gaps : [],
      });
    }
  };

  const submitResume = async () => {
    rrLog("submit_started", { len: resumeText.length });
    if (!resumeText.trim() || resumeText.length < 50) {
      // Branded popup instead of a native alert. Keep textarea open, do not
      // switch to preview, do not call AI, do not create a job/debit.
      setResumeEditMode(true);
      setResumeTooShortOpen(true);
      rrLog("validation_failed", { reason: "too_short" });
      // Restore focus to textarea so the candidate can keep typing.
      setTimeout(() => { try { resumeTextareaRef.current?.focus(); } catch { /* ignore */ } }, 0);
      return;
    }
    rrLog("validation_passed");
    // Token presence check (boolean only — never log the token itself).
    let tokenPresent = false;
    try { tokenPresent = !!(JSON.parse(localStorage.getItem("cand_session") || "null") as any)?.token; } catch { /* ignore */ }
    rrLog("token_present", { ok: tokenPresent });
    if (!tokenPresent) {
      alert(describeResumeSubmitError("candidate_session_missing"));
      return;
    }
    // Double-click guard: if an active job already exists for this candidate,
    // simply resume polling instead of starting a new one (no duplicate debit).
    const existingActive = getActiveJob("screen_resume", candidateId);
    rrLog("active_job_found", { ok: !!existingActive });
    if (existingActive) {
      // Active polling effect is already running; just give visual feedback.
      alert("Анализ уже выполняется. Подождите, результат сохранится автоматически.");
      return;
    }
    setBusy(true);
    try {
      // Phase 3B-2A: switch resume screening to the async v2 lifecycle.
      // The HTTP request returns a job_id quickly; the wait overlay only
      // bridges the polling phase. Closing tab / reloading is safe — the
      // mount effect above re-attaches polling.
      await aiWaitRun<any>({
        title: "Анализ резюме",
        task: async () => {
          rrLog("invoke_started");
          const start = await startResumeScreenV2({ candidateId, resumeText });
          rrLog("invoke_http_status", { ok: true, reused: start.reused, terminal: start.terminal, status: start.status });
          // If the function reused a terminal job, just fetch results.
          if (start.terminal) {
            await refetchCandidateScores();
            clearActiveJob("screen_resume", candidateId);
            return { ok: true };
          }
          const row = await pollJobUntilTerminal({ jobId: start.job_id });
          clearActiveJob("screen_resume", candidateId);
          if (!isSuccess(row.status)) {
            rrLog("invoke_error_code", { code: row.status, phase: "terminal" });
            throw new Error(describeResumeSubmitError(row.status));
          }
          await refetchCandidateScores();
          return { ok: true };
        },
      });
    } catch (e: any) {
      if (isVacancyPausedError(e)) { setPausedOpen(true); }
      else {
        const rawCode = String(e?.message || "").slice(0, 96);
        rrLog("invoke_error_code", { code: rawCode, phase: "client" });
        // Map known pre-invoke / safe codes; fall back to userError formatter.
        const isSafeCode = /^[a-z0-9_:-]{1,64}$/i.test(rawCode);
        const friendly = isSafeCode
          ? describeResumeSubmitError(rawCode)
          : formatUserError(toUserError(e));
        // Clear any stale active-job pointer so the candidate can retry.
        try { clearActiveJob("screen_resume", candidateId); } catch { /* ignore */ }
        alert(friendly);
      }
    }
    finally { setBusy(false); }
  };

  const onUploadResume = async (f: File) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert("Файл больше 10 МБ"); return; }
    setUploading(true);
    setUploadError("");
    try {
      const sess = getCandidateSession();
      if (!sess?.token) throw new Error("Сессия кандидата истекла — войдите снова.");
      const form = new FormData();
      form.append("token", sess.token);
      form.append("kind", "resume");
      form.append("file", f);
      const res = await fetch(FN("candidate-upload-file"), {
        method: "POST",
        headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: form,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "upload_failed");
      setUploadedResume({ bucket: j.bucket, path: j.path, filename: f.name });
    } catch (e: any) {
      setUploadError(formatUserError(toUserError(e, { kind: "bad_file", message: "Не удалось загрузить резюме. Проверьте формат и размер файла." })));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sendResumeToRR = async () => {
    if (!uploadedResume) return;
    // Resume recognition uses ai-ingest-document — provider reset (if any)
    // is handled server-side per attempt. No client-side restart wait.
    setParsing(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание резюме",
        task: () => call("ai-ingest-document", { entity: "resume", entity_id: candidateId, bucket: uploadedResume.bucket, file_path: uploadedResume.path, filename: uploadedResume.filename }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data) => {
            const text = String(data?.text || "")
              .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
              .replace(/\n?```\s*$/i, "")
              .trim()
              .slice(0, 20000);
            if (text.trim()) {
              setResumeText(text);
              setUploadedResume(null);
            }
          },
        },
      });
      if (!r) return;
      const text = String(r?.text || "")
        .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim()
        .slice(0, 20000);
      if (!text.trim()) throw new Error("ИИ не смог распознать резюме");
      setResumeText(text);
      setUploadedResume(null);
    } catch (e: any) {
      alert(formatUserError(toUserError(e, { kind: "ai_temporary", message: "Не удалось распознать файл. Попробуйте ещё раз." })));
    } finally {
      setParsing(false);
    }
  };

  /**
   * Checklist v2 (Phase 3B-2B Step D1a-FIX): single-owner async lifecycle.
   * useCandidateAiJob owns request_id creation, polling, focus/visibility
   * wake-up, reload-recovery, terminal cleanup, and onSuccess/onFailure
   * dispatch. submitChecklist only:
   *   - calls hook.start() (in-memory lock guards double-click)
   *   - awaits a Promise that the hook resolves via onSuccess/onFailure
   *   - never reads/writes localStorage, never calls pollJobUntilTerminal,
   *     never generates a request_id.
   */
  const checklistPendingRef = useRef<((ok: boolean) => void) | null>(null);
  const situationsPendingRef = useRef<((ok: boolean) => void) | null>(null);

  const refetchChecklistFromDb = async () => {
    const { data: sc } = await (supabase as any).from("candidate_scores")
      .select("checklist_score,checklist_feedback,candidate_checklist_feedback")
      .eq("candidate_id", candidateId).maybeSingle();
    if (sc?.checklist_score != null) setChecklistScore(sc.checklist_score);
    if ((sc as any)?.candidate_checklist_feedback) {
      setChecklistFeedback((sc as any).candidate_checklist_feedback);
    } else if (sc?.checklist_feedback) {
      setChecklistFeedback(sc.checklist_feedback);
    }
  };

  const refetchSituationsFromDb = async (): Promise<{ overall: number } | null> => {
    const { data: sc } = await (supabase as any).from("candidate_scores")
      .select("situations_score,situations_feedback,candidate_situations_feedback,overall_score")
      .eq("candidate_id", candidateId).maybeSingle();
    if (!sc) return null;
    if (sc.situations_score != null) setSituationsScore(sc.situations_score);
    const candFb = (sc as any)?.candidate_situations_feedback;
    if (candFb) setSituationsFeedbackRaw(candFb);
    else if (sc.situations_feedback) setSituationsFeedbackRaw(sc.situations_feedback);
    if (candFb?.items && Array.isArray(candFb.items)) {
      setSituationsFeedback(candFb.items);
    } else if (sc?.situations_feedback?.items) {
      setSituationsFeedback(sc.situations_feedback.items);
    }
    const overall = sc.overall_score != null
      ? Math.round(Number(sc.overall_score))
      : (sc.situations_score != null ? Number(sc.situations_score) : 0);
    setFinalScore(overall);
    return { overall };
  };

  const checklistJob = useCandidateAiJob({
    kind: "checklist_grade",
    candidateId,
    onSuccess: async () => {
      try { await refetchChecklistFromDb(); } catch { /* swallow — UI keeps stale state */ }
      checklistPendingRef.current?.(true);
      checklistPendingRef.current = null;
    },
    onFailure: ({ message }) => {
      try { alert(message); } catch { /* ignore */ }
      checklistPendingRef.current?.(false);
      checklistPendingRef.current = null;
    },
  });

  const situationsJob = useCandidateAiJob({
    kind: "situations_grade",
    candidateId,
    onSuccess: async (jobId) => {
      let info: { overall: number } | null = null;
      try { info = await refetchSituationsFromDb(); } catch { /* swallow */ }
      const overall = info?.overall ?? 0;
      // Server-authoritative advance. The frontend sends ONLY { job_id }; the
      // server checks job ownership/type/status/project, the score and the
      // allowed source stage, then decides whether to move the candidate.
      let passed = false;
      try {
        let candidateToken: string | null = null;
        try {
          const raw = localStorage.getItem("cand_session");
          if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
        } catch { /* ignore */ }
        const { data } = await supabase.functions.invoke<any>("candidate-stage-advance-v2", {
          body: { job_id: jobId, candidate_token: candidateToken },
          headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
        });
        // Treat advanced or already-in-next-stage as "passed". below_threshold
        // / stage_conflict / job_not_succeeded are NOT technical failures —
        // they leave the local stage untouched and the candidate sees the
        // actual interview score. A real failure (no response, network err)
        // is also treated as not-passed; the candidate can retry safely.
        passed = Boolean(data && (data.advanced === true || data.already === true));
      } catch { /* non-fatal — UX shows the interview result */ }
      try { onCompleted?.(passed, overall); } catch { /* ignore */ }
      situationsPendingRef.current?.(true);
      situationsPendingRef.current = null;
    },
    onFailure: ({ message }) => {
      try { alert(message); } catch { /* ignore */ }
      situationsPendingRef.current?.(false);
      situationsPendingRef.current = null;
    },
  });

  const submitChecklist = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await aiWaitRun<any>({
        title: "AI анализирует ответы анкеты. Можно продолжить работу — результат сохранится автоматически",
        task: () => new Promise<boolean>((resolve) => {
          checklistPendingRef.current = resolve;
          void checklistJob.start({ kind: "checklist_grade", answers });
        }),
      });
    } finally { setBusy(false); }
  };

  /**
   * Situations v2 (D1a-FIX): single-owner async lifecycle. Lifecycle, stage
   * advance and onCompleted are all routed through useCandidateAiJob's
   * onSuccess callback. submitSituations only kicks off the hook and waits
   * for terminal — it never reads localStorage, never polls, never decides
   * pass/fail itself.
   */
  const submitSituations = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await aiWaitRun<any>({
        title: "AI анализирует решения ситуаций. Можно продолжить работу — результат сохранится автоматически",
        task: () => new Promise<boolean>((resolve) => {
          situationsPendingRef.current = resolve;
          void situationsJob.start({ kind: "situations_grade", answers: sitAnswers });
        }),
      });
    } finally { setBusy(false); }
  };

  const reset = () => {
    restartFiredRef.current = null; // ensure /restart fires again on retake
    setStage("resume"); setResumeResult(null); setResumeText(""); setAnswers({}); setChecklistScore(null);
    setSitAnswers({}); setSituationsScore(null); setSituationsFeedback([]); setFinalScore(null);
  };

  const stageBadge = (s: Stage, label: string, score: number | null) => (
    <button onClick={() => setStage(s)} disabled={stageLocked(s)} className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${stage === s ? "bg-[#E7C768] text-[#17344F] border-[#E7C768]" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>
      {label}{score != null && <span className="text-[10px] bg-emerald-500/30 text-emerald-100 px-1.5 py-0.5 rounded">{score}</span>}
    </button>
  );

  const stageLocked = (s: Stage) => {
    if (s === "checklist") return resumeResult?.score == null;
    if (s === "situations") return checklistScore == null;
    if (s === "done") return finalScore == null;
    return false;
  };

  if (paused) {
    const tg = (paused.telegram || "").trim().replace(/^@/, "");
    return (
      <div className="bg-gradient-to-br from-[#17344F] to-[#265582] border border-[#E7C768]/40 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
        <div className="inline-flex w-14 h-14 rounded-full bg-amber-500/20 items-center justify-center text-3xl">⏸</div>
        <h2 className="text-xl font-extrabold text-[#E7C768]">Вакансия временно на паузе</h2>
        <p className="text-sm text-white/90 max-w-md mx-auto">
          У работодателя сейчас закончились средства для проведения ИИ-собеседования. Свяжитесь с ним напрямую — возможно, отбор продолжается через личное общение.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs max-w-xl mx-auto">
          {paused.email ? (
            <a className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-white break-all" href={`mailto:${paused.email}`}>
              <div className="text-[10px] uppercase text-[#E7C768] font-bold">Email</div>
              <div className="mt-1 font-bold">{paused.email}</div>
            </a>
          ) : null}
          {paused.phone ? (
            <a className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-white" href={`tel:${paused.phone.replace(/[^\d+]/g, "")}`}>
              <div className="text-[10px] uppercase text-[#E7C768] font-bold">Телефон</div>
              <div className="mt-1 font-bold">{paused.phone}</div>
            </a>
          ) : null}
          {tg ? (
            <a className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-white" href={tg.startsWith("http") ? tg : `https://t.me/${tg}`} target="_blank" rel="noopener noreferrer">
              <div className="text-[10px] uppercase text-[#E7C768] font-bold">Telegram</div>
              <div className="mt-1 font-bold">@{tg}</div>
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#E7C768]/20 flex items-center justify-center text-[#E7C768]"><MessageSquare className="w-5 h-5"/></div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">ИИ-Интервью</h2>
            <p className="text-xs text-slate-300">Пройдите 3 этапа. Проходной средний балл: <b className="text-[#E7C768]">{passScore}</b>. При неуспехе можно пересдать.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stageBadge("resume", "1. Резюме", resumeResult?.score ?? null)}
          {stageBadge("checklist", "2. Чек-лист", checklistScore)}
          {stageBadge("situations", "3. Ситуации", situationsScore)}
          {stageBadge("done", "4. Итог", finalScore)}
        </div>
      </div>

      {stage === "resume" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 1: Скрининг резюме</h3>
          {resumeResult ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold text-emerald-300">{resumeResult.score}/100</div>
              <div className="text-sm text-white"><RichMarkdown tone="resume">{resumeResult.summary || ""}</RichMarkdown></div>
              {resumeResult.strengths?.length > 0 && (<div><div className="text-xs text-emerald-300 font-bold uppercase">Сильные стороны</div><ul className="text-sm text-slate-200 list-disc pl-5">{resumeResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              {(resumeResult.areas_to_clarify?.length ?? 0) > 0 && (
                <div><div className="text-xs text-amber-300 font-bold uppercase">Что стоит уточнить</div>
                  <ul className="text-sm text-slate-200 list-disc pl-5">
                    {resumeResult.areas_to_clarify!.map((s, i) => <li key={i}>{s}</li>)}
                  </ul></div>
              )}
              {(resumeResult.recommendations?.length ?? 0) > 0 && (
                <div><div className="text-xs text-sky-300 font-bold uppercase">Рекомендации</div>
                  <ul className="text-sm text-slate-200 list-disc pl-5">
                    {resumeResult.recommendations!.map((s, i) => <li key={i}>{s}</li>)}
                  </ul></div>
              )}
              {resumeResult.gaps?.length > 0 && (
                <div><div className="text-xs text-amber-300 font-bold uppercase">Что улучшить</div>
                  <ul className="text-sm text-slate-200 list-disc pl-5">
                    {resumeResult.gaps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul></div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStage("checklist")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Перейти к чек-листу →</button>
                <button onClick={() => { setResumeResult(null); }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : (
            <>
              <ResumeDropzone
                uploading={uploading}
                parsing={parsing}
                uploaded={uploadedResume ? { filename: uploadedResume.filename } : null}
                error={uploadError}
                busy={busy}
                onFile={onUploadResume}
                onClear={() => setUploadedResume(null)}
                onSend={aiReady ? sendResumeToRR : undefined}
                sendLabel={aiReady ? "Распознать резюме" : "Готовим ИИ…"}
                sendDisabled={!aiReady}
                fileMissing={/Файл резюме недоступен/i.test(uploadError) || /file[_ ](deleted|missing)|no_resume/i.test(uploadError)}
              />
              {resumeText && !resumeEditMode ? (
                <div className="relative w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setResumeEditMode(true)}
                    className="absolute top-2 right-2 text-[10px] uppercase tracking-wider font-bold bg-white/10 hover:bg-white/20 text-[#E7C768] px-2 py-1 rounded-md"
                  >
                    Редактировать
                  </button>
                  <RichMarkdown tone="resume">{resumeText}</RichMarkdown>
                </div>
              ) : (
                <>
                  <textarea
                    ref={resumeTextareaRef}
                    value={resumeText}
                    onChange={e => setResumeText(e.target.value)}
                    rows={12}
                    maxLength={20000}
                    placeholder="Вставьте текст вашего резюме или загрузите файл — ИИ распознает и заполнит это поле автоматически. Поддерживается Markdown."
                    className="w-full bg-black/30 text-white border border-white/10 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className={resumeText.length < 50 ? "text-amber-300" : "text-emerald-300"}>
                      {resumeText.length} / 50 символов
                      {resumeText.length < 50 && " — нужно больше деталей для AI-оценки"}
                    </span>
                  </div>
                  {resumeText && (
                    <button
                      type="button"
                      onClick={() => setResumeEditMode(false)}
                      className="text-[10px] uppercase tracking-wider font-bold bg-white/10 hover:bg-white/20 text-[#E7C768] px-2 py-1 rounded-md self-start"
                    >
                      Предпросмотр
                    </button>
                  )}
                </>
              )}
              {busy && <LoadingPhrase entity="interview" />}
              <button
                disabled={busy || resumeText.trim().length < 50}
                onClick={submitResume}
                className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                title={resumeText.trim().length < 50 ? "Минимум 50 символов" : undefined}
              >
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>} Отправить на оценку
              </button>
              {resumeTooShortOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                  onClick={() => setResumeTooShortOpen(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#1E4468] to-[#17344F] border border-[#E7C768]/40 shadow-2xl p-6 text-center"
                  >
                    <div className="text-4xl mb-2">🤖</div>
                    <h4 className="text-lg font-bold text-white mb-2">Резюме пока слишком короткое</h4>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      Добавьте больше информации об опыте, навыках и результатах.
                      Для отправки на AI-оценку нужно минимум 50 символов.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setResumeTooShortOpen(false);
                        setTimeout(() => { try { resumeTextareaRef.current?.focus(); } catch { /* ignore */ } }, 0);
                      }}
                      className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-black text-sm shadow"
                    >
                      Продолжить редактирование
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {stage === "checklist" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 2: Чек-лист ({questions.length} вопросов)</h3>
          {stageLocked("checklist") ? (
            <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              ⛔ Сначала пройдите этап «Резюме» — без оценки резюме чек-лист недоступен.
              <button onClick={() => setStage("resume")} className="ml-2 underline text-[#E7C768]">Перейти к резюме</button>
            </div>
          ) : checklistScore != null ? (
            <div className="space-y-3">
              <CandidateChecklistReport
                view={adaptCandidateChecklist(checklistFeedback)}
                score={checklistScore}
              />
              <div className="flex gap-2">
                <button onClick={() => setStage("situations")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Перейти к ситуациям →</button>
                <button onClick={() => {
                  setChecklistScore(null);
                  setChecklistFeedback(null);
                  setAnswers({});
                  if (shuffleChecklist) {
                    setQuestions(qs => shuffleArr(qs).map(q => q.kind === "choice" && q.options ? { ...q, options: shuffleArr(q.options) } : q));
                  }
                }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-amber-300">Чек-лист ещё не настроен работодателем.</p>
          ) : (
            <>
              {questions.map((q, i) => (
                <div key={q.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-white font-semibold">#{i+1}. {q.question}</div>
                  {q.kind === "choice" ? (
                    <div className="space-y-1">
                      {(q.options || []).map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer hover:bg-white/5 rounded px-2 py-1">
                          <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => setAnswers({ ...answers, [q.id]: opt })} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea value={answers[q.id] || ""} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} rows={3} placeholder="Ваш ответ..." className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm" />
                  )}
                </div>
              ))}
              {busy && <LoadingPhrase entity="interview" />}
              <button disabled={busy} onClick={submitChecklist} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Отправить ответы
              </button>
            </>
          )}
        </div>
      )}

      {stage === "situations" && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-[#E7C768]">Этап 3: Ролевые ситуации</h3>
          {stageLocked("situations") ? (
            <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              ⛔ Сначала пройдите этап «Чек-лист» — без него ролевые ситуации недоступны.
              <button onClick={() => setStage("checklist")} className="ml-2 underline text-[#E7C768]">Перейти к чек-листу</button>
            </div>
          ) : situationsScore != null ? (
            <div className="space-y-3">
              <CandidateSituationsReport
                view={adaptCandidateSituations(situationsFeedbackRaw)}
                score={situationsScore}
              />
              <div className="flex flex-wrap gap-2">
                {finalScore != null && (
                  <button onClick={() => setStage("done")} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-1">
                    <Award className="w-4 h-4"/> Показать итоговую оценку →
                  </button>
                )}
                <button onClick={() => { setSituationsScore(null); setSitAnswers({}); setSituationsFeedback([]); setSituationsFeedbackRaw(null); setFinalScore(null); }} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center gap-1"><RefreshCw className="w-3 h-3"/>Пересдать</button>
              </div>
            </div>
          ) : situations.length === 0 ? (
            <p className="text-sm text-amber-300">Ситуации ещё не настроены работодателем.</p>
          ) : (
            <>
              {situations.map((s, i) => (
                <div key={s.id} className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-sm text-[#E7C768] font-bold">Ситуация #{i+1}: {s.title}</div>
                  <div className="text-sm text-slate-200"><RichMarkdown tone="chat">{s.brief}</RichMarkdown></div>
                  <textarea value={sitAnswers[s.id] || ""} onChange={e => setSitAnswers({ ...sitAnswers, [s.id]: e.target.value })} rows={4} placeholder="Ваш ответ..." className="w-full bg-black/30 text-white border border-white/10 rounded px-2 py-1 text-sm" />
                </div>
              ))}
              {busy && <LoadingPhrase entity="interview" />}
              <button disabled={busy} onClick={submitSituations} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Award className="w-4 h-4"/>} Завершить интервью
              </button>
            </>
          )}
        </div>
      )}

      {stage === "done" && finalScore != null && (
        <div className="bg-[#1E4468]/30 border border-white/10 rounded-2xl p-6 space-y-3 text-center">
          <Award className="w-12 h-12 text-[#E7C768] mx-auto" />
          <div className="text-4xl font-extrabold text-white">{finalScore}/100</div>
          <p className="text-sm text-slate-200">Средний балл по 3 этапам. Проходной: <b>{passScore}</b>.</p>
          {finalScore >= passScore ? (
            <p className="text-emerald-300 font-bold">✅ Интервью пройдено — переходите к обучению!</p>
          ) : (
            <>
              <p className="text-amber-300 font-bold">Нужен более высокий балл. Можно пересдать все этапы.</p>
              <button onClick={reset} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">Начать заново</button>
            </>
          )}
        </div>
      )}
      {stage === "done" && candOverallFeedback && (
        <CandidateOverallReport feedback={candOverallFeedback} />
      )}
      <VacancyPausedDialog open={pausedOpen} projectId={projectId} onClose={() => setPausedOpen(false)} />
    </div>
  );
}