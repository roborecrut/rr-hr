// =============================================================================
// ai-evaluate-overall-candidate-v2
//
// Combined AI candidate evaluation against a vacancy. Employer-only endpoint.
//
// Contract:
//   POST { candidate_id: uuid, request_id: uuid }
//   Header: Authorization: Bearer <employer JWT>
//
// Behaviour (per Phase 4 spec):
//   - Owner check: candidate.project_id MUST belong to the caller employer.
//   - Idempotency key: `overall_candidate_v2:${candidate_id}:${request_id}`.
//   - request_snapshot stores ONLY identifiers, source_hash, requested_at,
//     and the available-stages list (no resume text / answers / feedback).
//   - Worker reloads everything from DB by job_id, recomputes source_hash,
//     and refuses to save on mismatch (`safe_error_code=source_data_changed`).
//   - Save via `save_candidate_overall_evaluation_v2` RPC — atomic, touches
//     ONLY ai_fit_score / employer_overall_feedback / candidate_overall_feedback
//     / overall_generated_at / overall_source_hash. Never touches overall_score
//     or stage scores.
//   - No RR billing on this endpoint. No spend_pack / debit_ai_job_once.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildSocialId, callProTalkWithRetry, tryParseJson,
  getAdminClient,
} from "../_shared/protalk.ts";
import { requireEmployerJwt, assertCandidateOwner } from "../_shared/auth.ts";
import {
  createOrReuseAiJob, isTerminalStatus, markJobStatusStrict,
  recordAttemptDiagnostics, sha256Hex, startAttempt as ajStartAttempt,
  finishAttempt as ajFinishAttempt, canonicalJsonStringify,
} from "../_shared/ai-jobs.ts";
import { runInBackground } from "../_shared/ai-runner.ts";
import { RrProMaxProvider } from "../_shared/rr-pro-max.ts";
import {
  validateOverallCandidateReport, type OverallCandidateReport,
} from "../_shared/ai-validators.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stage = "resume" | "checklist" | "situations" | "training";

type LoadedContext = {
  candidateId: string;
  projectId: string;
  prompt: string;
  sourceHash: string;
  expectedPrevHash: string | null;
  availableStages: Stage[];
  missingSections: string[];
};

async function loadContext(admin: ReturnType<typeof getAdminClient>, candidateId: string):
  Promise<{ ok: true; ctx: LoadedContext } | { ok: false; error: string }> {
  const ad = admin!;
  const { data: cand } = await ad.from("candidates")
    .select("id, project_id, full_name, resume_name, role_name, resume_text, current_stage, crm_stage")
    .eq("id", candidateId).maybeSingle();
  if (!cand?.project_id) return { ok: false, error: "candidate_not_found" };

  const { data: proj } = await ad.from("projects")
    .select("role_name, vacancy_text, tasks_activity_text, motivation_text, payouts_text, schedule_text, team_text, system_text, interview_pass_score")
    .eq("id", cand.project_id).maybeSingle();
  if (!proj) return { ok: false, error: "project_not_found" };

  const { data: blocks } = await ad.from("interview_blocks")
    .select("kind, payload, ai_generated_at")
    .eq("project_id", cand.project_id);
  const blockByKind = new Map<string, any>();
  for (const b of (blocks || [])) blockByKind.set(String((b as any).kind), (b as any).payload || {});

  const { data: scores } = await ad.from("candidate_scores")
    .select("resume_score, checklist_score, situations_score, overall_score, interview_score, resume_feedback, checklist_feedback, situations_feedback, training_employer_feedback, overall_source_hash, updated_at")
    .eq("candidate_id", candidateId).maybeSingle();

  const { data: training } = await ad.from("candidate_stage_progress")
    .select("stage, last_score, best_score, passed_at")
    .eq("candidate_id", candidateId);

  // Determine available stages.
  const available: Stage[] = [];
  const missing: string[] = [];
  const hasResume = !!(scores && (scores as any).resume_score != null);
  const hasChecklist = !!(scores && (scores as any).checklist_score != null);
  const hasSituations = !!(scores && (scores as any).situations_score != null);
  const trainingRows = Array.isArray(training) ? training : [];
  const hasTraining = trainingRows.some((t: any) => t.last_score != null || t.best_score != null);
  if (hasResume) available.push("resume"); else missing.push("Резюме");
  if (hasChecklist) available.push("checklist"); else missing.push("Анкета");
  if (hasSituations) available.push("situations"); else missing.push("Ситуации");
  if (hasTraining) available.push("training"); else missing.push("Обучение");

  // Build feedback-hash dictionary for source_hash.
  const sc: any = scores || {};
  const hashSources = {
    resume_score: sc.resume_score ?? null,
    checklist_score: sc.checklist_score ?? null,
    situations_score: sc.situations_score ?? null,
    overall_score: sc.overall_score ?? null,
    interview_score: sc.interview_score ?? null,
    resume_feedback_hash: await sha256Hex(canonicalJsonStringify(sc.resume_feedback || null)),
    checklist_feedback_hash: await sha256Hex(canonicalJsonStringify(sc.checklist_feedback || null)),
    situations_feedback_hash: await sha256Hex(canonicalJsonStringify(sc.situations_feedback || null)),
    training_feedback_hash: await sha256Hex(canonicalJsonStringify(sc.training_employer_feedback || null)),
    training_progress_hash: await sha256Hex(canonicalJsonStringify(trainingRows.map((t: any) => ({
      stage: t.stage, score: t.last_score ?? t.best_score ?? null, passed: !!t.passed_at,
    })))),
    resume_block_hash: await sha256Hex(canonicalJsonStringify(blockByKind.get("resume") || null)),
    checklist_block_hash: await sha256Hex(canonicalJsonStringify(blockByKind.get("checklist") || null)),
    situations_block_hash: await sha256Hex(canonicalJsonStringify(blockByKind.get("situations") || null)),
    employer_wishes_hash: await sha256Hex(canonicalJsonStringify(blockByKind.get("employer_wishes") || null)),
    project_version: `${(proj as any).interview_pass_score || 0}|${String((proj as any).vacancy_text || "").length}`,
  };
  const sourceHash = await sha256Hex(canonicalJsonStringify(hashSources));

  const candName = String((cand as any).full_name || (cand as any).resume_name || "Кандидат");
  const roleName = String((proj as any).role_name || (cand as any).role_name || "");

  const empWishes = JSON.stringify(blockByKind.get("employer_wishes") || {}, null, 2);

  const prompt = `Ты — senior HRD и эксперт по оценке кандидатов. Проведи ОБЩУЮ оценку соответствия кандидата конкретной вакансии на основании всех доступных этапов.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Не используй и не цитируй сведения о возрасте, поле, расе, национальности, религии, политических взглядах, семейном положении, беременности, здоровье, инвалидности, внешности. Эти признаки НЕ влияют на оценку.
2. Каждый risk и red_flag обязан содержать конкретное evidence (точная цитата или формулировка "не подтверждено требование X").
3. Не делай абсолютных кадровых решений ("одобрен", "не пригоден"). Формулируй: высокое соответствие | частичное соответствие | низкое соответствие | недостаточно данных.
4. Различай ОТСУТСТВИЕ данных и реальное НЕСООТВЕТСТВИЕ. Отсутствие этапа — это пробел в данных, НЕ риск.
5. fit_score (0..100) — твоя экспертная AI-оценка соответствия вакансии. Это НЕ средний балл этапов.
6. confidence (0..100) — насколько ты уверен в выводе исходя из объёма доступных данных.
7. data_completeness (0..100) — какая доля стандартных этапов оценки заполнена.
8. Candidate-блок — отдельный, мягкий, уважительный. БЕЗ employer_wishes, risks, red_flags, recommendation, fit_score, verdict.

ВАКАНСИЯ: ${roleName}
ОПИСАНИЕ:
${String((proj as any).vacancy_text || "(не указано)").slice(0, 4000)}

ЗАДАЧИ:
${String((proj as any).tasks_activity_text || "").slice(0, 2000)}

МОТИВАЦИЯ / УСЛОВИЯ:
${String((proj as any).motivation_text || "").slice(0, 1500)}
${String((proj as any).payouts_text || "").slice(0, 1000)}
${String((proj as any).schedule_text || "").slice(0, 800)}

ПОЖЕЛАНИЯ РАБОТОДАТЕЛЯ (employer wishes):
${empWishes.slice(0, 3000)}

КАНДИДАТ: ${candName}
ТЕКУЩИЙ ЭТАП: ${String((cand as any).current_stage || "")}

РЕЗЮМЕ (фрагмент):
${String((cand as any).resume_text || "(не загружено)").slice(0, 6000)}

ДОСТУПНЫЕ ОЦЕНКИ ЭТАПОВ:
- Резюме: ${hasResume ? sc.resume_score : "нет данных"}
- Анкета: ${hasChecklist ? sc.checklist_score : "нет данных"}
- Ситуации: ${hasSituations ? sc.situations_score : "нет данных"}
- Обучение: ${hasTraining ? "пройдено частично/полно" : "нет данных"}
- Средний балл этапов: ${sc.overall_score ?? "нет данных"}

СТРУКТУРИРОВАННЫЙ EMPLOYER-FEEDBACK ПО ЭТАПАМ:
resume: ${JSON.stringify(sc.resume_feedback || null).slice(0, 3000)}
checklist: ${JSON.stringify(sc.checklist_feedback || null).slice(0, 3000)}
situations: ${JSON.stringify(sc.situations_feedback || null).slice(0, 3000)}
training: ${JSON.stringify(sc.training_employer_feedback || null).slice(0, 2000)}

ДОСТУПНЫЕ ЭТАПЫ: ${available.join(", ") || "(только базовое резюме)"}
ОТСУТСТВУЮЩИЕ ЭТАПЫ: ${missing.join(", ") || "—"}

Верни СТРОГО валидный JSON без markdown, без обёрток:
{
  "employer": {
    "fit_score": <0..100>,
    "confidence": <0..100>,
    "data_completeness": <0..100>,
    "verdict": "<высокое соответствие|частичное соответствие|низкое соответствие|недостаточно данных>",
    "executive_summary": "<6-10 предложений для работодателя>",
    "stage_summary": [{"stage":"resume|checklist|situations|training","score":<0..100|null>,"conclusion":"...","key_evidence":["..."]}],
    "matches": [{"criterion":"...","degree":"<полностью|частично|не подтверждено>","evidence":"...","source":"resume|checklist|situations|training"}],
    "gaps": [{"criterion":"...","finding":"...","impact":"...","source":"..."}],
    "risks": [{"title":"...","evidence":"...","impact":"...","severity":"<низкий|средний|высокий>","how_to_verify":"..."}],
    "red_flags": [{"title":"...","evidence":"...","source":"...","severity":"<средний|высокий>"}],
    "employer_wishes_alignment": [{"wish":"...","status":"<соответствует|частично|не соответствует|нет данных>","evidence":"..."}],
    "strengths": ["..."],
    "interview_focus": ["..."],
    "missing_sections": ["..."],
    "recommendation": "<итоговая рекомендация для финального решения работодателя>"
  },
  "candidate": {
    "summary": "<мягкий уважительный итог, 4-6 предложений>",
    "strengths": ["..."],
    "areas_to_improve": ["..."],
    "stage_feedback": [{"stage":"resume|checklist|situations|training","conclusion":"..."}],
    "next_steps": ["..."],
    "missing_sections": ["..."]
  }
}`;

  return {
    ok: true,
    ctx: {
      candidateId,
      projectId: String(cand.project_id),
      prompt,
      sourceHash,
      expectedPrevHash: sc.overall_source_hash || null,
      availableStages: available,
      missingSections: missing,
    },
  };
}

async function runWorker(jobId: string, candidateId: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) { await markJobStatusStrict(jobId, "orchestration_failed", true); return; }

  // Load snapshot from ai_jobs to recover expected source_hash.
  const { data: job } = await admin.from("ai_jobs")
    .select("id, request_snapshot, fallback_allowed").eq("id", jobId).maybeSingle();
  const snap = (job as any)?.request_snapshot || {};
  const expectedSourceHashAtStart: string = String(snap.source_hash || "");

  // Recompute context (and source_hash) from current DB state.
  const loaded = await loadContext(admin, candidateId);
  if (!loaded.ok) {
    await markJobStatusStrict(jobId, "orchestration_failed", true);
    return;
  }
  const ctx = loaded.ctx;

  // Primary attempt.
  const primaryStart = await ajStartAttempt(jobId, "primary", { jobStatus: "primary_running" });
  if (!primaryStart) { await markJobStatusStrict(jobId, "primary_failed", true); return; }
  const primaryAttemptId = primaryStart.attemptId;

  let report: OverallCandidateReport | null = null;
  let primaryFatalCode: string | null = null;

  const seed = `ai_${jobId}_primary`;
  const t0 = Date.now();
  try {
    const r = await callProTalkWithRetry({
      message: ctx.prompt,
      chatIdSeed: seed,
      socialId: buildSocialId({ candidate_id: candidateId }),
      timeoutMs: 150_000,
      attempts: 3,
      validate: (text) => {
        const obj = tryParseJson<unknown>(text);
        const v = validateOverallCandidateReport(obj);
        return v.ok ? { ok: true } : { ok: false, code: v.code };
      },
    });
    const v = validateOverallCandidateReport(tryParseJson<unknown>(r.text));
    if (v.ok) report = v.value;
    else primaryFatalCode = `schema_invalid:${v.code}`;
    await recordAttemptDiagnostics(primaryAttemptId, {
      chatId: `${seed}_a${r.attempts}`, validationOk: v.ok,
      durationMs: Date.now() - t0, operationPart: "primary",
    });
    await ajFinishAttempt(primaryAttemptId, {
      status: v.ok ? "succeeded" : "failed",
      safe_error_code: v.ok ? null : (primaryFatalCode || "schema_invalid").slice(0, 64),
    });
  } catch (e) {
    const msg = String((e as Error)?.message || "primary_failed").slice(0, 64);
    primaryFatalCode = msg;
    await recordAttemptDiagnostics(primaryAttemptId, {
      chatId: seed, validationOk: false, durationMs: Date.now() - t0, operationPart: "primary",
    });
    await ajFinishAttempt(primaryAttemptId, { status: "failed", safe_error_code: msg });
  }

  // Fallback if primary failed.
  if (!report && (job as any)?.fallback_allowed !== false && RrProMaxProvider.isConfigured()) {
    await markJobStatusStrict(jobId, "primary_failed", false);
    await markJobStatusStrict(jobId, "fallback_available", false);
    const fb = await ajStartAttempt(jobId, "rr_pro_max", {
      jobStatus: "fallback_running", extraJobPatch: { fallback_used: true },
    });
    if (fb) {
      const fbAttemptId = fb.attemptId;
      const chat = `ai_${jobId}_fallback_a${fb.attemptNumber}`;
      const social = buildSocialId({ candidate_id: candidateId });
      const t1 = Date.now();
      try {
        await RrProMaxProvider.restart(chat, social);
        const r = await RrProMaxProvider.run(ctx.prompt, chat, social, 150_000);
        if (r.ok) {
          const v = validateOverallCandidateReport(tryParseJson<unknown>(r.text));
          if (v.ok) report = v.value;
          await recordAttemptDiagnostics(fbAttemptId, {
            chatId: chat, validationOk: v.ok, durationMs: Date.now() - t1,
            operationPart: "fallback",
          });
          await ajFinishAttempt(fbAttemptId, {
            status: v.ok ? "succeeded" : "failed",
            safe_error_code: v.ok ? null : `schema_invalid:${v.code}`.slice(0, 64),
          });
        } else {
          await ajFinishAttempt(fbAttemptId, { status: "failed", safe_error_code: r.safeErrorCode });
        }
      } catch (e) {
        await ajFinishAttempt(fbAttemptId, {
          status: "failed",
          safe_error_code: String((e as Error)?.message || "fallback_failed").slice(0, 64),
        });
      }
    }
  }

  if (!report) {
    const code = primaryFatalCode || "ai_failed";
    if (code.startsWith("schema_invalid")) {
      await markJobStatusStrict(jobId, "validation_failed", true);
    } else {
      await markJobStatusStrict(jobId, "fallback_failed", true);
    }
    return;
  }

  // Source-hash recheck — refuse to overwrite a newer version.
  const fresh = await loadContext(admin, candidateId);
  if (!fresh.ok || fresh.ctx.sourceHash !== ctx.sourceHash) {
    // Source changed during analysis. Mark validation_failed with explicit code,
    // existing report preserved (RPC never called).
    const { data: jobRow } = await admin.from("ai_jobs").select("id").eq("id", jobId).maybeSingle();
    if (jobRow) {
      await admin.from("ai_jobs")
        .update({ status: "validation_failed", completed_at: new Date().toISOString() })
        .eq("id", jobId);
    }
    return;
  }

  // Force ai_fit_score scalar between 0..100 (defensive).
  const fitScore = Math.max(0, Math.min(100, Math.round(report.employer.fit_score)));

  // Atomic save (uses _expected_prev_hash for optimistic concurrency).
  const saved = await admin.rpc("save_candidate_overall_evaluation_v2", {
    _candidate: candidateId,
    _ai_fit_score: fitScore,
    _employer_feedback: report.employer as unknown as Record<string, unknown>,
    _candidate_feedback: report.candidate as unknown as Record<string, unknown>,
    _source_hash: ctx.sourceHash,
    _expected_prev_hash: ctx.expectedPrevHash,
  });
  if (saved.error) {
    const msg = String(saved.error.message || "save_failed");
    if (msg.includes("source_data_changed")) {
      await markJobStatusStrict(jobId, "validation_failed", true);
    } else {
      await markJobStatusStrict(jobId, "save_failed", true);
    }
    return;
  }
  // Pick correct terminal status: primary vs fallback succeeded.
  const { data: cur } = await admin.from("ai_jobs").select("fallback_used").eq("id", jobId).maybeSingle();
  const fallbackUsed = !!(cur as any)?.fallback_used;
  await markJobStatusStrict(jobId, fallbackUsed ? "fallback_succeeded" : "primary_succeeded", true);
  void expectedSourceHashAtStart;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    candidate_id?: string;
    request_id?: string;
  };
  if (!body) return jsonResponse({ error: "bad_body" }, 400);
  const candidateId = String(body.candidate_id || "").trim();
  const requestId = String(body.request_id || "").trim();
  if (!UUID_RE.test(candidateId)) return jsonResponse({ error: "bad_candidate_id" }, 400);
  if (!UUID_RE.test(requestId)) return jsonResponse({ error: "bad_request_id" }, 400);

  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;
  const own = await assertCandidateOwner({ userId: auth.userId, candidateId });
  if (own instanceof Response) return own;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "internal" }, 500);

  const er = (globalThis as any).EdgeRuntime;
  if (!er || typeof er.waitUntil !== "function") {
    return jsonResponse({ error: "runtime_no_background" }, 500);
  }

  // Pre-load minimal context just to compute source_hash + available stages
  // for the snapshot. No AI payload stored.
  const pre = await loadContext(admin, candidateId);
  if (!pre.ok) return jsonResponse({ error: pre.error }, 400);

  const idem = `overall_candidate_v2:${candidateId}:${requestId}`;
  const created = await createOrReuseAiJob({
    userId: auth.userId,
    candidateId,
    jobType: "overall_candidate_v2",
    idempotencyKey: idem,
    requestSnapshot: {
      candidate_id: candidateId,
      project_id: pre.ctx.projectId,
      source_hash: pre.ctx.sourceHash,
      available_stages: pre.ctx.availableStages,
      requested_at: new Date().toISOString(),
    },
    fallbackAllowed: true,
  });
  if ("error" in created) return jsonResponse({ error: "job_create_failed", detail: created.error }, 500);

  if (created.reused) {
    return jsonResponse({
      ok: true, job_id: created.id, status: created.status,
      reused: true, terminal: isTerminalStatus(created.status),
    });
  }

  const jobId = created.id;
  runInBackground((async () => {
    try { await runWorker(jobId, candidateId); }
    catch (e) {
      console.error("[overall-candidate-v2] worker crashed", (e as Error)?.message);
      await markJobStatusStrict(jobId, "orchestration_failed", true);
    }
  })());

  return jsonResponse({
    ok: true, job_id: jobId, status: "primary_running",
    reused: false, terminal: false,
  });
});