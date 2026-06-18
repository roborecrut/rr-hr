// Builds a deterministic training summary across the three stages
// (professional / product / system). No real AI call here — we only assemble
// strengths/gaps from existing stage feedback so the result is transparent,
// cheap, and does not touch RR billing.
//
// Saves into candidate_scores.training_employer_feedback /
// training_candidate_feedback / training_summary_* via the SECURITY DEFINER
// RPC save_candidate_training_summary_v2. Does NOT touch overall_score,
// ai_fit_score, current_stage or crm_stage.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/protalk.ts";
import { requireEmployerJwt, assertCandidateOwner } from "../_shared/auth.ts";
import { validateTrainingSummary } from "../_shared/ai-validators.ts";

const STAGES = ["professional", "product", "system"] as const;
type Stage = typeof STAGES[number];
const STAGE_LABEL: Record<Stage, string> = {
  professional: "Профессия",
  product: "Продукт",
  system: "Система",
};

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | { candidate_id?: string };
  if (!body?.candidate_id) return jsonResponse({ error: "bad_body" }, 400);

  const auth = await requireEmployerJwt(req);
  if (auth instanceof Response) return auth;
  const own = await assertCandidateOwner({ userId: auth.userId, candidateId: body.candidate_id });
  if (own instanceof Response) return own;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  // Load all stages.
  const { data: rows } = await admin.from("candidate_stage_progress")
    .select("stage,last_score,best_score,passed_at,employer_summary,candidate_summary,updated_at")
    .eq("candidate_id", body.candidate_id);

  const byStage = new Map<Stage, any>();
  for (const r of (rows || [])) {
    const s = String((r as any).stage || "").toLowerCase();
    const key = (STAGES as readonly string[]).includes(s) ? (s as Stage) : null;
    if (key) byStage.set(key, r);
  }

  // Existing source hash for optimistic concurrency.
  const { data: prevScore } = await admin.from("candidate_scores")
    .select("training_summary_source_hash")
    .eq("candidate_id", body.candidate_id).maybeSingle();
  const expectedPrevHash = (prevScore as any)?.training_summary_source_hash || null;

  // Build per-stage signals.
  const completed: { key: Stage; score: number; emp: any; cand: any }[] = [];
  const missing: Stage[] = [];
  for (const k of STAGES) {
    const row = byStage.get(k);
    if (!row) { missing.push(k); continue; }
    const score = Number((row as any).best_score ?? (row as any).last_score ?? 0);
    completed.push({ key: k, score, emp: (row as any).employer_summary, cand: (row as any).candidate_summary });
  }

  const avg = completed.length > 0
    ? Math.round(completed.reduce((s, x) => s + x.score, 0) / completed.length)
    : 0;
  const completeness = Math.round((completed.length / STAGES.length) * 100);

  let verdict: string;
  if (completed.length === 0) verdict = "недостаточно данных";
  else if (completed.length < STAGES.length) verdict = "частично готов";
  else if (avg >= 80) verdict = "готов";
  else if (avg >= 60) verdict = "частично готов";
  else verdict = "требуется повторение";

  const mastered: string[] = [];
  const weak: string[] = [];
  const candStrengths: string[] = [];
  const candTopicsToRepeat: string[] = [];
  const revisionPlan: string[] = [];

  for (const c of completed) {
    const label = STAGE_LABEL[c.key];
    if (c.score >= 80) mastered.push(label);
    else weak.push(label);
    const emp = c.emp || {};
    const cand = c.cand || {};
    for (const s of (Array.isArray(emp.strengths) ? emp.strengths : []).slice(0, 3)) {
      if (typeof s === "string" && s.trim()) candStrengths.push(`${label}: ${s.trim()}`);
    }
    for (const g of (Array.isArray(emp.gaps) ? emp.gaps : []).slice(0, 3)) {
      if (typeof g === "string" && g.trim()) {
        candTopicsToRepeat.push(`${label}: ${g.trim()}`);
        revisionPlan.push(`Повторить тему «${g.trim()}» в разделе «${label}».`);
      }
    }
    for (const s of (Array.isArray(cand.strengths) ? cand.strengths : []).slice(0, 2)) {
      if (typeof s === "string" && s.trim() && !candStrengths.includes(`${label}: ${s.trim()}`)) {
        candStrengths.push(`${label}: ${s.trim()}`);
      }
    }
  }

  const empSummaryText = completed.length === 0
    ? "Кандидат ещё не проходил этапы обучения."
    : `Завершено ${completed.length}/${STAGES.length} этапов обучения. Средний балл — ${avg}/100.`;
  const candSummaryText = completed.length === 0
    ? "Вы ещё не приступили к обучению."
    : `Вы прошли ${completed.length}/${STAGES.length} этап(ов). Средний балл — ${avg}/100.`;

  const report = {
    employer: {
      score: avg,
      data_completeness: completeness,
      verdict,
      summary: empSummaryText,
      completed_stages: completed.map((c) => STAGE_LABEL[c.key]),
      missing_stages: missing.map((m) => STAGE_LABEL[m]),
      mastered_topics: mastered,
      weak_topics: weak,
      risks: [],
      red_flags: [],
      revision_plan: revisionPlan.slice(0, 8),
      readiness: verdict === "готов" ? "Кандидат готов к практической стажировке."
        : verdict === "частично готов" ? "Готов частично — стоит закрыть пробелы перед практикой."
        : verdict === "требуется повторение" ? "Перед допуском требуется повторить материал."
        : "Недостаточно данных для вывода о готовности.",
      recommendation: verdict === "готов" ? "Допустить к следующему шагу воронки."
        : verdict === "частично готов" ? "Допустить условно с контролем слабых тем."
        : verdict === "требуется повторение" ? "Назначить повторное прохождение тестов."
        : "Дождаться прохождения этапов обучения.",
    },
    candidate: {
      summary: candSummaryText,
      completed_stages: completed.map((c) => STAGE_LABEL[c.key]),
      missing_stages: missing.map((m) => STAGE_LABEL[m]),
      strengths: candStrengths.slice(0, 8),
      topics_to_repeat: candTopicsToRepeat.slice(0, 8),
      revision_plan: revisionPlan.slice(0, 6),
      next_steps: completed.length === STAGES.length
        ? ["Закрепите слабые темы.", "Готовьтесь к следующему шагу воронки."]
        : ["Завершите оставшиеся этапы обучения."],
    },
  };

  const valid = validateTrainingSummary(report);
  if (!valid.ok) return jsonResponse({ error: "validation_failed", code: valid.code }, 422);

  const sourceHash = await sha256(JSON.stringify({
    stages: STAGES.map((k) => {
      const r = byStage.get(k);
      return {
        k,
        score: r ? Number((r as any).best_score ?? (r as any).last_score ?? 0) : null,
        passed: r ? !!(r as any).passed_at : false,
        upd: r ? (r as any).updated_at : null,
      };
    }),
  }));

  const { error: rpcErr } = await admin.rpc("save_candidate_training_summary_v2", {
    _candidate_id: body.candidate_id,
    _employer_feedback: valid.value.employer,
    _candidate_feedback: valid.value.candidate,
    _summary_score: valid.value.employer.score,
    _source_hash: sourceHash,
    _expected_prev_hash: expectedPrevHash,
  });

  if (rpcErr) {
    const msg = String(rpcErr.message || "");
    if (msg.includes("source_data_changed")) {
      return jsonResponse({ error: "source_data_changed" }, 409);
    }
    return jsonResponse({ error: "save_failed", details: msg }, 500);
  }

  return jsonResponse({
    ok: true,
    report: valid.value,
    source_hash: sourceHash,
    completeness,
    completed: completed.length,
    total_stages: STAGES.length,
  });
});