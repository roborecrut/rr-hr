// Generate "important resume criteria" markdown for a vacancy.
//
// Stage Phase 3A: contract upgraded to {project_id, request_id, force_new_generation?}.
// Returns {ok, job_id, status, reused} immediately; AI work continues server-side
// via EdgeRuntime.waitUntil. Polling status is the client's responsibility
// (RPC get_ai_job_safe_status). Legacy callers without request_id get a
// synthetic one (warning logged) so the wizard keeps working until the
// frontend is migrated in a later phase.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildSocialId,
  buildChatId,
  callProTalkWithRetry,
  getAdminClient,
  getUserFromAuthHeader,
  logToDb,
  resolveEmployerPublicId,
} from "../_shared/protalk.ts";
import { requireEmployerForProject } from "../_shared/auth.ts";
import {
  createOrReuseAiJob,
  isTerminalStatus,
  saveInterviewBlockStrict,
} from "../_shared/ai-jobs.ts";
import { runInBackground, runJobLifecycle, tryAttempt } from "../_shared/ai-runner.ts";

const KIND = "resume";
const JOB_TYPE = "interview_resume_criteria";

function validateCriteriaMd(text: string): { ok: true } | { ok: false; code: string } {
  const t = (text || "").trim();
  if (!t) return { ok: false, code: "empty" };
  if (t.length < 80) return { ok: false, code: "too_short" };
  // Must contain at least 2 of the expected H2 sections (lenient — we keep
  // backward compat with slightly-renamed sections coming from the model).
  const hits = ["обязательн", "желательн", "красные флаг", "обратить"].filter((n) =>
    t.toLowerCase().includes(n)
  ).length;
  if (hits < 2) return { ok: false, code: "no_sections" };
  // Reject inline server errors.
  if (/\[server error/i.test(t)) return { ok: false, code: "server_error" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = (await req.json().catch(() => null)) as null | {
    project_id: string;
    request_id?: string;
    force_new_generation?: boolean;
    source?: string;
    wishes?: string;
  };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);
  const requestId = (body.request_id || "").trim() || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!body.request_id) {
    console.warn("resume-criteria: legacy call without request_id; synthesized", { requestId });
  }

  const guard = await requireEmployerForProject(req, body.project_id);
  if (guard instanceof Response) return guard;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const projRes = await admin
    .from("projects")
    .select("role_name,vacancy_text,company_text,salary_terms,schedule_terms,custom_wiki,company_id")
    .eq("id", body.project_id)
    .maybeSingle();
  if (projRes.error) return jsonResponse({ error: "project_load_failed" }, 500);
  const proj = projRes.data;
  if (!proj) return jsonResponse({ error: "no_project" }, 404);
  let companyName = "";
  if ((proj as any).company_id) {
    const { data: co } = await admin
      .from("companies")
      .select("name")
      .eq("id", (proj as any).company_id)
      .maybeSingle();
    companyName = (co as any)?.name || "";
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const empPid = await resolveEmployerPublicId({ projectId: body.project_id, userId: user?.id });

  const socialId = buildSocialId({ user_id: user?.id, employer_public_id: empPid });
  // Single stable ProTalk dialog per employer — все генерации в одном чате,
  // а не под видом нового пользователя при каждом запросе.
  const chatId = buildChatId({ employerPublicId: empPid, userId: user?.id });

  const wishes = (body.wishes || "").trim().slice(0, 1000);
  const prompt = `Ты — HR-эксперт. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь.

Сформируй краткий список (markdown) ВАЖНЫХ КРИТЕРИЕВ для скрининга резюме под вакансию.
${wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${wishes}\n` : ""}
Вакансия: ${(proj as any).role_name || ""}
Компания: ${companyName}
Описание вакансии:
${(proj as any).vacancy_text || ""}

Дополнительный контекст от работодателя:
${(body.source || "").toString().slice(0, 4000)}

Верни markdown с разделами:
## Обязательные требования
- ...
## Желательные требования
- ...
## Красные флаги
- ...
## На что обратить особое внимание
- ...

5-10 пунктов в каждом разделе, кратко и по делу. Без лишних вступлений.`;

  const idempotencyKey = `${JOB_TYPE}:${body.project_id}:${requestId}`;
  const job = await createOrReuseAiJob({
    userId: user?.id || null,
    jobType: JOB_TYPE,
    idempotencyKey,
    requestSnapshot: { project_id: body.project_id, wishes_len: wishes.length, prompt_len: prompt.length },
    fallbackAllowed: true,
  });
  if (!("id" in job)) return jsonResponse({ error: "job_create_failed", detail: (job as any).error }, 500);

  // Short-circuit: reused (active or terminal) — no new background work, no new charge.
  if (job.reused) {
    return jsonResponse({
      ok: true,
      job_id: job.id,
      status: job.status,
      reused: true,
      terminal: isTerminalStatus(job.status),
      // Legacy compat: keep criteria_md for the current frontend until it
      // switches to polling. Frontend may also re-read interview_blocks.
    });
  }

  // New job: kick off background work and return immediately.
  const jobId = job.id;
  runInBackground(
    runJobLifecycle<string>({
      jobId,
      primary: (_attemptNumber) =>
        tryAttempt(async () => {
          const r = await callProTalkWithRetry({
            messages: [{ role: "user", content: prompt }],
            chatId,
            socialId,
            timeoutMs: 120_000,
            attempts: 3,
            validate: validateCriteriaMd,
          });
          await logToDb({
            user_message: `[prompt:${prompt.length}b]`,
            bot_reply: `[reply:${r.text.length}b]`,
            channel_id: chatId,
            user_social_id: socialId,
            channel_name: "ai-interview:resume-criteria",
            server_name: "ai-generate-interview-resume-criteria",
          });
          return r.text.trim();
        }, (err) => {
          const msg = String((err as Error)?.message || "");
          const retryable = !/(bad_body|no_project|no_credits|payment_required|401|403)/i.test(msg);
          return { safeCode: msg.slice(0, 64), retryable };
        }),
      fallback: (_attemptNumber) =>
        tryAttempt(async () => {
          // Stage 4a: rr_pro_max real provider not yet wired. We re-run the
          // primary path with a fresh chat seed as a defensive last attempt
          // (no extra RR is charged because this function does not charge).
          const r = await callProTalkWithRetry({
            messages: [{ role: "user", content: prompt }],
            chatId,
            socialId,
            timeoutMs: 120_000,
            attempts: 2,
            validate: validateCriteriaMd,
          });
          return r.text.trim();
        }),
      save: async (criteriaMd) => {
        const payload = { criteria_md: criteriaMd, employer_wishes: wishes };
        const r = await saveInterviewBlockStrict(body.project_id, KIND, payload);
        if (!r.ok) return { ok: false, safeCode: `save:${r.error.slice(0, 32)}` };
        return { ok: true };
      },
    }).catch((e) => console.error("resume-criteria lifecycle error", (e as Error)?.message)),
  );

  return jsonResponse({
    ok: true,
    job_id: jobId,
    status: "primary_running",
    reused: false,
    terminal: false,
  });
});