// Generate 3 role-play situations for a vacancy.
// Phase 3A: background job contract — see resume-criteria for shape details.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildSocialId,
  buildChatId,
  callProTalkWithRetry,
  getAdminClient,
  getUserFromAuthHeader,
  logToDb,
  tryParseJson,
  resolveEmployerPublicId,
} from "../_shared/protalk.ts";
import { requireEmployerForProject } from "../_shared/auth.ts";
import {
  createOrReuseAiJob,
  isTerminalStatus,
  saveInterviewBlockStrict,
} from "../_shared/ai-jobs.ts";
import { runInBackground, runJobLifecycle, tryAttempt } from "../_shared/ai-runner.ts";
import { validateSituations3, type Situation } from "../_shared/ai-validators.ts";

const KIND = "situations";
const JOB_TYPE = "interview_situations";

/** Pre-parse + structural validator, used by the retry loop. */
function validateSituationsText(text: string): { ok: true } | { ok: false; code: string } {
  if (/\[server error/i.test(text)) return { ok: false, code: "server_error" };
  const arr = tryParseJson<any[]>(text);
  const v = validateSituations3(arr);
  return v.ok ? { ok: true } : { ok: false, code: v.code };
}

function parseSituations(text: string): Situation[] | null {
  const arr = tryParseJson<any[]>(text);
  const v = validateSituations3(arr);
  return v.ok ? v.value : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = (await req.json().catch(() => null)) as null | {
    project_id: string;
    request_id?: string;
    force_new_generation?: boolean;
    wishes?: string;
  };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);
  const requestId = (body.request_id || "").trim() || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const guard = await requireEmployerForProject(req, body.project_id);
  if (guard instanceof Response) return guard;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const projRes = await admin
    .from("projects")
    .select("role_name,vacancy_text,company_id")
    .eq("id", body.project_id)
    .maybeSingle();
  if (projRes.error) return jsonResponse({ error: "project_load_failed" }, 500);
  if (!projRes.data) return jsonResponse({ error: "no_project" }, 404);
  const proj = projRes.data;
  let companyName = "";
  if ((proj as any).company_id) {
    const { data: co } = await admin
      .from("companies").select("name").eq("id", (proj as any).company_id).maybeSingle();
    companyName = (co as any)?.name || "";
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const empPid = await resolveEmployerPublicId({ projectId: body.project_id, userId: user?.id });

  const socialId = buildSocialId({ user_id: user?.id, employer_public_id: empPid });
  const chatId = buildChatId({ employerPublicId: empPid, userId: user?.id });

  const SCHEMA = `JSON-массив РОВНО из 3 элементов: {"id":"s1"|"s2"|"s3","title":string,"brief":string,"criteria":string}
- title — короткая тема (3-6 слов)
- brief — описание ситуации, которую увидит кандидат (3-6 предложений, прямая речь от лица контрагента/клиента)
- criteria — критерии хорошего ответа (3-6 пунктов через ";"), используются для оценки.
Без markdown.`;

  const wishes = (body.wishes || "").trim().slice(0, 1000);
  const prompt = `Ты — HR-эксперт. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь.

Подготовь 3 ролевые ситуации для оценки кандидата на вакансию.
${wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${wishes}\n` : ""}
Должность: ${(proj as any).role_name || ""}
Компания: ${companyName}
Контекст: ${(proj as any).vacancy_text || ""}
Ситуации должны быть реалистичными и типовыми для этой должности.
Верни СТРОГО ${SCHEMA}`;

  const idempotencyKey = `${JOB_TYPE}:${body.project_id}:${requestId}`;
  const job = await createOrReuseAiJob({
    userId: user?.id || null,
    jobType: JOB_TYPE,
    idempotencyKey,
    requestSnapshot: { project_id: body.project_id, prompt_len: prompt.length },
    fallbackAllowed: true,
  });
  if (!("id" in job)) return jsonResponse({ error: "job_create_failed", detail: (job as any).error }, 500);
  if (job.reused) {
    return jsonResponse({
      ok: true,
      job_id: job.id,
      status: job.status,
      reused: true,
      terminal: isTerminalStatus(job.status),
    });
  }

  const jobId = job.id;
  runInBackground(
    runJobLifecycle<Situation[]>({
      jobId,
      primary: () =>
        tryAttempt(async () => {
          const r = await callProTalkWithRetry({
            messages: [{ role: "user", content: prompt }],
            chatId,
            socialId,
            timeoutMs: 120_000,
            attempts: 3,
            validate: validateSituationsText,
          });
          const parsed = parseSituations(r.text);
          if (!parsed) throw new Error("schema_invalid:post_parse");
          await logToDb({
            user_message: `[prompt:${prompt.length}b]`,
            bot_reply: `[reply:${r.text.length}b:${parsed.length}s]`,
            channel_id: chatId,
            user_social_id: socialId,
            channel_name: "ai-interview:situations",
            server_name: "ai-generate-interview-situations",
          });
          return parsed;
        }, (err) => {
          const msg = String((err as Error)?.message || "");
          const retryable = !/(bad_body|no_project|no_credits|payment_required|401|403)/i.test(msg);
          return { safeCode: msg.slice(0, 64), retryable };
        }),
      fallback: () =>
        tryAttempt(async () => {
          const r = await callProTalkWithRetry({
            messages: [{ role: "user", content: prompt }],
            chatId,
            socialId,
            timeoutMs: 120_000,
            attempts: 2,
            validate: validateSituationsText,
          });
          const parsed = parseSituations(r.text);
          if (!parsed) throw new Error("schema_invalid:fb_post_parse");
          return parsed;
        }),
      save: async (situations) => {
        const payload = { situations, employer_wishes: wishes };
        const r = await saveInterviewBlockStrict(body.project_id, KIND, payload);
        if (!r.ok) return { ok: false, safeCode: `save:${r.error.slice(0, 32)}` };
        return { ok: true };
      },
    }).catch((e) => console.error("situations lifecycle error", (e as Error)?.message)),
  );

  return jsonResponse({
    ok: true,
    job_id: jobId,
    status: "primary_running",
    reused: false,
    terminal: false,
  });
});