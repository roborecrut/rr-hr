// =============================================================================
// ai-job-watchdog — periodic sweeper for stuck v2 grading jobs.
//
// Problem: primary provider (ProTalk) sometimes takes longer than the Deno
// background worker's lifetime, so `EdgeRuntime.waitUntil` gets killed
// before the primary call returns. The runner never marks primary as
// failed → fallback (RR Pro Max) never triggers, and candidate is stuck
// with `orchestration_failed` / `primary_running`.
//
// This watchdog:
//   1. Finds ai_jobs of type grade_checklist_v2 / grade_situations_v2
//      that are non-terminal AND older than STALE_MINUTES since updated_at.
//   2. For each job stuck in primary_running: finalizes the last primary
//      attempt as timed_out (safe_error_code=worker_killed_watchdog) and
//      moves the job to `primary_failed`.
//   3. Re-invokes the corresponding runner in background. The runner now
//      detects `resumeFromFallback` and jumps straight to RR Pro Max.
//
// Callable by scheduler (pg_cron via pg_net) OR by an authenticated
// admin. No candidate/employer JWT required — the function relies on
// SERVICE_ROLE via getAdminClient.
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/protalk.ts";
import { runInBackground } from "../_shared/ai-runner.ts";
import { runChecklistGradeJob } from "../_shared/checklist-grade-runner.ts";
import { runSituationsGradeJob } from "../_shared/situations-grade-runner.ts";
import { buildChecklistProdDeps } from "../_shared/checklist-grade-prod-deps.ts";
import { buildSituationsProdDeps } from "../_shared/situations-grade-prod-deps.ts";

const STALE_MINUTES = 3;
const MAX_JOBS_PER_TICK = 20;

type StuckJob = {
  id: string;
  job_type: "grade_checklist_v2" | "grade_situations_v2";
  status: string;
  candidate_id: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  // Non-terminal statuses eligible for resumption. `created` is also here
  // because a job created but never started (edge crash between INSERT and
  // waitUntil) is indistinguishable from a stuck one after STALE_MINUTES.
  const NON_TERMINAL = [
    "created",
    "primary_running",
    "primary_failed",
    "fallback_available",
    "fallback_running",
  ];

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: stuck, error } = await admin
    .from("ai_jobs")
    .select("id, job_type, status, candidate_id, updated_at")
    .in("job_type", ["grade_checklist_v2", "grade_situations_v2"])
    .in("status", NON_TERMINAL)
    .is("completed_at", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);
  if (error) return jsonResponse({ error: "select_failed", detail: error.message }, 500);

  const jobs = (stuck || []) as unknown as StuckJob[];
  const results: Array<{ id: string; type: string; action: string }> = [];

  for (const job of jobs) {
    try {
      // 1) If primary is still marked running, finalize the stuck attempt so
      //    the diagnostics table doesn't grow open-ended.
      if (job.status === "primary_running" || job.status === "fallback_running") {
        const providerToClose = job.status === "primary_running" ? "primary" : "rr_pro_max";
        const { data: att } = await admin
          .from("ai_job_attempts")
          .select("id, status")
          .eq("job_id", job.id)
          .eq("provider", providerToClose)
          .eq("status", "started")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (att?.id) {
          await admin.from("ai_job_attempts")
            .update({
              status: "timed_out",
              safe_error_code: "worker_killed_watchdog",
              completed_at: new Date().toISOString(),
            })
            .eq("id", att.id);
        }
        // Push job to primary_failed so the runner will skip primary.
        await admin.from("ai_jobs")
          .update({ status: "primary_failed", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      }

      // 2) Re-invoke the appropriate runner in background.
      if (job.job_type === "grade_checklist_v2") {
        const deps = buildChecklistProdDeps(admin);
        runInBackground((async () => {
          try { await runChecklistGradeJob(deps, { jobId: job.id }); }
          catch (e) { console.error("[watchdog] checklist run crashed", (e as Error).message); }
        })());
      } else {
        const deps = buildSituationsProdDeps(admin);
        runInBackground((async () => {
          try { await runSituationsGradeJob(deps, { jobId: job.id }); }
          catch (e) { console.error("[watchdog] situations run crashed", (e as Error).message); }
        })());
      }
      results.push({ id: job.id, type: job.job_type, action: "resumed_fallback" });
    } catch (e) {
      results.push({ id: job.id, type: job.job_type, action: `error:${(e as Error).message.slice(0, 60)}` });
    }
  }

  return jsonResponse({ ok: true, scanned: jobs.length, results });
});