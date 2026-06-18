// Generate 20-question checklist (10 choice + 10 text) as TWO independent halves.
//
// Phase 3A: background job with split sub-tasks. Each half has its own retry
// loop and validator; the successful half is NEVER regenerated when the other
// half fails. Only after BOTH halves pass strict validation are q1..q20 saved
// atomically into interview_blocks. The old checklist is preserved until the
// save succeeds.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  buildSocialId,
  callProTalkWithRetry,
  getAdminClient,
  getUserFromAuthHeader,
  logToDb,
  tryParseJson,
} from "../_shared/protalk.ts";
import { requireEmployerForProject } from "../_shared/auth.ts";
import {
  createOrReuseAiJob,
  finishAttempt,
  isTerminalStatus,
  markJobStatus,
  markSaveFailed,
  markValidationFailed,
  saveInterviewBlockStrict,
  startFallbackAttempt,
  startPrimaryAttempt,
} from "../_shared/ai-jobs.ts";
import { runInBackground } from "../_shared/ai-runner.ts";
import {
  combineChecklist20,
  validateChecklistChoice10,
  validateChecklistText10,
  type AnyQ,
  type ChoiceQ,
  type TextQ,
} from "../_shared/ai-validators.ts";

const KIND = "checklist";
const JOB_TYPE = "interview_checklist";

function buildChoicePrompt(ctx: { role: string; company: string; vacancy: string; products: string; wishes: string }): string {
  return `Ты — HR-эксперт. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь.

Составь РОВНО 10 проверочных вопросов с выбором одного правильного ответа для собеседования на вакансию.
${ctx.wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${ctx.wishes}\n` : ""}
Должность: ${ctx.role}
Компания: ${ctx.company}
Описание вакансии: ${ctx.vacancy}
Продукты: ${ctx.products}

Формат — JSON-массив РОВНО из 10 элементов, без markdown, без обёрток:
[{"id":"c1","type":"choice","question":string,"options":[string,string,string,string],"correct":string}, ...]

Правила:
- options — РОВНО 4 непустые строки;
- correct — ТОЧНОЕ совпадение с одним из options;
- id уникальны (c1..c10);
- question не пустой;
- проверяй профессиональные знания и реальный опыт.`;
}

function buildTextPrompt(ctx: { role: string; company: string; vacancy: string; products: string; wishes: string }): string {
  return `Ты — HR-эксперт. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь.

Составь РОВНО 10 открытых вопросов (свободный текстовый ответ) для собеседования на вакансию.
${ctx.wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${ctx.wishes}\n` : ""}
Должность: ${ctx.role}
Компания: ${ctx.company}
Описание вакансии: ${ctx.vacancy}
Продукты: ${ctx.products}

Формат — JSON-массив РОВНО из 10 элементов, без markdown, без обёрток:
[{"id":"t1","type":"text","question":string,"expected_answer":string}, ...]

Правила:
- expected_answer — эталонный ответ 2-4 предложения;
- id уникальны (t1..t10);
- вопросы развёрнутые, проверяют опыт и подход.`;
}

function validateChoiceText(text: string): { ok: true } | { ok: false; code: string } {
  if (/\[server error/i.test(text)) return { ok: false, code: "server_error" };
  const arr = tryParseJson<any[]>(text);
  const v = validateChecklistChoice10(arr);
  return v.ok ? { ok: true } : { ok: false, code: v.code };
}

function validateTextText(text: string): { ok: true } | { ok: false; code: string } {
  if (/\[server error/i.test(text)) return { ok: false, code: "server_error" };
  const arr = tryParseJson<any[]>(text);
  const v = validateChecklistText10(arr);
  return v.ok ? { ok: true } : { ok: false, code: v.code };
}

function parseChoice(text: string): ChoiceQ[] | null {
  const arr = tryParseJson<any[]>(text);
  const v = validateChecklistChoice10(arr);
  return v.ok ? v.value : null;
}
function parseText(text: string): TextQ[] | null {
  const arr = tryParseJson<any[]>(text);
  const v = validateChecklistText10(arr);
  return v.ok ? v.value : null;
}

/** Convert AnyQ[] back into the legacy DB payload shape used by the rest of the app. */
function toLegacyShape(qs: AnyQ[]): Array<Record<string, unknown>> {
  return qs.map((q, i) => {
    if (q.type === "choice") {
      return {
        id: q.id || `q${i + 1}`,
        kind: "choice",
        question: q.question,
        options: q.options,
        correct: q.correct,
        expected_answer: null,
        explanation: "",
      };
    }
    return {
      id: q.id || `q${i + 1}`,
      kind: "text",
      question: q.question,
      options: null,
      correct: null,
      expected_answer: q.expected_answer,
      explanation: "",
    };
  });
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
    .select("role_name,vacancy_text,company_text,custom_wiki,company_id")
    .eq("id", body.project_id)
    .maybeSingle();
  if (projRes.error) return jsonResponse({ error: "project_load_failed" }, 500);
  if (!projRes.data) return jsonResponse({ error: "no_project" }, 404);
  const proj = projRes.data;
  let companyName = "", productsText = "";
  if ((proj as any).company_id) {
    const { data: co } = await admin
      .from("companies").select("name,description_text,products_text").eq("id", (proj as any).company_id).maybeSingle();
    companyName = (co as any)?.name || "";
    productsText = (co as any)?.products_text || "";
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const socialId = buildSocialId({ user_id: user?.id });

  const wishes = (body.wishes || "").trim().slice(0, 1000);
  const ctx = {
    role: (proj as any).role_name || "",
    company: companyName,
    vacancy: (proj as any).vacancy_text || "",
    products: productsText,
    wishes,
  };

  const idempotencyKey = `${JOB_TYPE}:${body.project_id}:${requestId}`;
  const job = await createOrReuseAiJob({
    userId: user?.id || null,
    jobType: JOB_TYPE,
    idempotencyKey,
    requestSnapshot: { project_id: body.project_id, wishes_len: wishes.length },
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

  /**
   * Background worker — two-part generation.
   * Lifecycle states it can produce:
   *   primary_running → (primary_succeeded | primary_failed → fallback_*)
   *   → save_failed | validation_failed (terminal alternatives)
   */
  runInBackground((async () => {
    const part = async (
      label: "choice" | "text",
      promptText: string,
      validator: (s: string) => { ok: true } | { ok: false; code: string },
      parser: (s: string) => ChoiceQ[] | TextQ[] | null,
      chatPrefix: string,
      attempts: number,
    ): Promise<{ ok: true; value: ChoiceQ[] | TextQ[] } | { ok: false; safeCode: string }> => {
      try {
        const r = await callProTalkWithRetry({
          messages: [{ role: "user", content: promptText }],
          chatIdSeed: `ai_${jobId}_${chatPrefix}_${label}`,
          socialId,
          timeoutMs: 120_000,
          attempts,
          validate: validator,
        });
        const parsed = parser(r.text);
        if (!parsed) return { ok: false, safeCode: `schema_invalid:${label}_post_parse` };
        await logToDb({
          user_message: `[prompt:${promptText.length}b:${label}]`,
          bot_reply: `[reply:${r.text.length}b:${parsed.length}q]`,
          channel_id: `ai_${jobId}_${chatPrefix}_${label}`,
          user_social_id: socialId,
          channel_name: `ai-interview:checklist:${label}`,
          server_name: "ai-generate-interview-checklist",
        });
        return { ok: true, value: parsed };
      } catch (e) {
        const msg = String((e as Error)?.message || "").slice(0, 64);
        return { ok: false, safeCode: msg };
      }
    };

    const primaryAttemptId = await startPrimaryAttempt(jobId);
    if (!primaryAttemptId) {
      await markJobStatus(jobId, "primary_failed", true);
      return;
    }

    let choice: ChoiceQ[] | null = null;
    let text: TextQ[] | null = null;
    let primaryHasSchemaFatal = false;
    let primaryLastErr = "primary_failed";

    // Primary: choice
    const cRes = await part("choice", buildChoicePrompt(ctx), validateChoiceText, parseChoice, "p", 3);
    if (cRes.ok) choice = cRes.value as ChoiceQ[];
    else { primaryLastErr = cRes.safeCode; if (cRes.safeCode.startsWith("schema_invalid")) primaryHasSchemaFatal = true; }

    // Primary: text (independent retries; runs even if choice succeeded but failed itself)
    const tRes = await part("text", buildTextPrompt(ctx), validateTextText, parseText, "p", 3);
    if (tRes.ok) text = tRes.value as TextQ[];
    else { primaryLastErr = tRes.safeCode; if (tRes.safeCode.startsWith("schema_invalid")) primaryHasSchemaFatal = true; }

    if (choice && text) {
      await finishAttempt(primaryAttemptId, { status: "succeeded" });
    } else {
      await finishAttempt(primaryAttemptId, { status: "failed", safe_error_code: primaryLastErr.slice(0, 64) });
      await markJobStatus(jobId, "primary_failed");
      await markJobStatus(jobId, "fallback_available");

      // Fallback only regenerates the FAILED half(s). Successful half is reused.
      const fbAttemptId = await startFallbackAttempt(jobId);
      if (fbAttemptId) {
        let fbLastErr = "fallback_failed";
        let fbSchemaFatal = false;
        if (!choice) {
          const r = await part("choice", buildChoicePrompt(ctx), validateChoiceText, parseChoice, "fb", 2);
          if (r.ok) choice = r.value as ChoiceQ[];
          else { fbLastErr = r.safeCode; if (r.safeCode.startsWith("schema_invalid")) fbSchemaFatal = true; }
        }
        if (!text) {
          const r = await part("text", buildTextPrompt(ctx), validateTextText, parseText, "fb", 2);
          if (r.ok) text = r.value as TextQ[];
          else { fbLastErr = r.safeCode; if (r.safeCode.startsWith("schema_invalid")) fbSchemaFatal = true; }
        }
        if (choice && text) {
          await finishAttempt(fbAttemptId, { status: "succeeded" });
        } else {
          await finishAttempt(fbAttemptId, { status: "failed", safe_error_code: fbLastErr.slice(0, 64) });
          if (fbSchemaFatal || primaryHasSchemaFatal) {
            await markValidationFailed(jobId, fbLastErr);
          } else {
            await markJobStatus(jobId, "fallback_failed", true);
          }
          return;
        }
      } else {
        await markJobStatus(jobId, "fallback_failed", true);
        return;
      }
    }

    // SAVE — atomic combine + strict upsert. Old checklist stays until success.
    const combined = combineChecklist20(choice!, text!);
    if (combined.length !== 20) {
      await markValidationFailed(jobId, "combine_not_20");
      return;
    }
    const payload = {
      questions: toLegacyShape(combined),
      shuffle: false,
      employer_wishes: wishes,
    };
    const saved = await saveInterviewBlockStrict(body.project_id, KIND, payload);
    if (!saved.ok) {
      await markSaveFailed(jobId, `save:${saved.error.slice(0, 32)}`);
      return;
    }
    // If primary fully succeeded we keep primary_succeeded; if fallback rescued
    // either half, it's fallback_succeeded.
    const finalStatus =
      cRes.ok && tRes.ok ? "primary_succeeded" : "fallback_succeeded";
    await markJobStatus(jobId, finalStatus, true);
  })().catch((e) => console.error("checklist lifecycle error", (e as Error)?.message)));

  return jsonResponse({
    ok: true,
    job_id: jobId,
    status: "primary_running",
    reused: false,
    terminal: false,
  });
});