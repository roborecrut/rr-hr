// Ingest a document (storage file or external URL) for a given entity (company/vacancy/training).
// Asks ProTalk to read it and return a clean markdown summary (≤10k chars).
// On success deletes the source file from storage to avoid wasting space.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb, resolveCandidatePublicId, resolveEmployerPublicId } from "../_shared/protalk.ts";
import { requireEmployerJwt, getEmployerIdForUser, assertProjectOwner } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createOrReuseAiJob, startPrimaryAttempt, finishAttempt, markJobStatus } from "../_shared/ai-jobs.ts";

// Whitelist of buckets ai-ingest-document is allowed to read from.
// Anything else (e.g. user-supplied bucket name) is rejected to prevent
// reading unrelated storage spaces via a signed URL.
const ALLOWED_BUCKETS = new Set([
  "company-docs",
  "vacancy-docs",
  "training-docs",
  "candidate-resumes",
  "uploads",
  "company-uploads",
  "vacancy-uploads",
  "training-uploads",
  "interview-uploads",
]);

// Per-entity bucket whitelist for employer uploads. The bucket the client
// supplies must match the entity (no cross-entity reuse).
const EMPLOYER_BUCKETS: Record<string, Set<string>> = {
  company: new Set(["company-docs", "company-uploads", "uploads"]),
  vacancy: new Set(["vacancy-docs", "vacancy-uploads", "uploads"]),
  training: new Set(["training-docs", "training-uploads", "interview-uploads", "uploads"]),
};

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

type Entity = "company" | "vacancy" | "training" | "resume";

const PROMPTS: Record<Entity, string> = {
  company: "Это документ с информацией о компании (презентация / регламент / профиль). Извлеки ВЕСЬ полезный текст о компании в чистом Markdown, сохраняя оригинальные формулировки. ОБЯЗАТЕЛЬНО верни весь текст с ограничением 5000 символов: если объём превышает 5000 — корректно суммаризируй до 5000 символов, сохраняя ключевые факты (миссия, продукты, команда, условия, мотивация, культура). Не добавляй ничего от себя.",
  vacancy: "Сформируй структурированное описание вакансии в Markdown: роль, обязанности, требования, условия, мотивация и выплаты, график, обучение. До 10 000 символов.",
  training: "Сформируй учебный материал в Markdown с заголовками, списками, примерами и итоговым чек-листом. До 10 000 символов.",
  resume: "Извлеки полный текст резюме кандидата и оформи его в чистом Markdown: ФИО, контакты, цель, опыт работы (по местам), навыки, образование, достижения, языки. Не добавляй ничего от себя. До 10 000 символов.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    entity: Entity; entity_id?: string;
    bucket?: string; file_path?: string;
    file_url?: string; filename?: string;
    prompt_hint?: string;
    max_chars?: number;
    demo_user_id?: string;
  };
  if (!body || !body.entity || (!body.file_path && !body.file_url)) {
    return jsonResponse({ error: "bad_body" }, 400);
  }
  if (!["company","vacancy","training","resume"].includes(body.entity)) {
    return jsonResponse({ error: "bad_entity" }, 400);
  }

  if (body.bucket && !ALLOWED_BUCKETS.has(body.bucket)) {
    return jsonResponse({ error: "bucket_not_allowed" }, 403);
  }
  // Disallow path traversal / absolute paths in storage key.
  if (body.file_path && (body.file_path.includes("..") || body.file_path.startsWith("/"))) {
    return jsonResponse({ error: "bad_file_path" }, 400);
  }
  // External arbitrary file_url is not allowed for any branch — only signed/public
  // URLs derived from our own storage buckets are acceptable.
  if (body.file_url && !body.bucket) {
    return jsonResponse({ error: "external_url_not_allowed" }, 403);
  }

  // ─── Branch-specific authorization ─────────────────────────────────────
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbSvc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbSvc) return jsonResponse({ error: "server_misconfigured" }, 500);

  if (body.entity === "resume") {
    // candidate-resumes is the only valid bucket for resumes.
    if (body.bucket !== "candidate-resumes") {
      return jsonResponse({ error: "bucket_not_allowed" }, 403);
    }
    const path = body.file_path || "";
    if (path.startsWith("demo/")) {
      // Public demo branch: rate-limit by IP, no candidate token required.
      const adminRl = createClient(sbUrl, sbSvc);
      try {
        const { data: rl } = await adminRl.rpc("rl_hit", {
          _key: `ai-ingest:demo:${clientIp(req)}`,
          _window_sec: 300,
          _limit: 5,
        });
        if (rl === false) return jsonResponse({ error: "rate_limited" }, 429);
      } catch { /* tolerate missing rpc */ }
    } else {
      // Real candidate flow: require candidate session token AND verify the
      // file_path lives inside the candidate's own folder.
      const token = (
        req.headers.get("x-candidate-token") ||
        req.headers.get("X-Candidate-Token") ||
        ""
      ).trim();
      if (!token) return jsonResponse({ error: "candidate_token_required" }, 401);
      const adminAuth = createClient(sbUrl, sbSvc);
      const { data: sess } = await adminAuth
        .from("candidate_sessions")
        .select("candidate_id, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (!sess?.candidate_id) return jsonResponse({ error: "bad_token" }, 401);
      if (sess.expires_at && new Date(sess.expires_at as string).getTime() < Date.now()) {
        return jsonResponse({ error: "token_expired" }, 401);
      }
      const candidateId = sess.candidate_id as string;
      if (!path.startsWith(`${candidateId}/`)) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
    }
  } else {
    // company / vacancy / training: require employer JWT + prove the file
    // actually belongs to this employer (path prefix == auth user id) and the
    // entity it claims to attach to is owned by them.
    const auth = await requireEmployerJwt(req);
    if (auth instanceof Response) return auth;
    if (!body.bucket || !body.file_path) {
      return jsonResponse({ error: "bad_body" }, 400);
    }
    const allowed = EMPLOYER_BUCKETS[body.entity];
    if (!allowed || !allowed.has(body.bucket)) {
      return jsonResponse({ error: "bucket_not_allowed" }, 403);
    }
    // All employer uploaders (DocumentIngestField, DocumentUploader,
    // EmployerPanel) prefix every file with `${auth.users.id}/`. We rely on
    // that prefix as the proof of ownership of the storage object: an
    // employer cannot ingest a file they did not upload themselves.
    if (!body.file_path.startsWith(`${auth.userId}/`)) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    // entity_id is required and must resolve to a resource owned by this
    // employer (project for vacancy/training, company for company).
    if (!body.entity_id) return jsonResponse({ error: "entity_id_required" }, 400);
    const emp = await getEmployerIdForUser(auth.userId);
    if (emp instanceof Response) return emp;
    if (body.entity === "company") {
      const own = await assertProjectOwner({ userId: auth.userId, companyId: body.entity_id });
      if (own instanceof Response) return own;
    } else if (body.entity === "vacancy" || body.entity === "training") {
      // vacancy: entity_id is a project UUID.
      // training: TrainingWizard passes `${projectId}-${stage}` where stage
      // is from a fixed whitelist. Use strict format: 36-char UUID, then a
      // single dash, then a known stage slug — no other shapes are accepted.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ALLOWED_STAGES = new Set([
        "intro","company","product","onboarding","interview",
        "training","probation","final","stage1","stage2","stage3","stage4","stage5",
      ]);
      let projectId = "";
      if (body.entity === "training") {
        const id = String(body.entity_id);
        if (id.length < 38 || id[36] !== "-") {
          return jsonResponse({ error: "bad_entity_id" }, 400);
        }
        const uuidPart = id.slice(0, 36);
        const stagePart = id.slice(37);
        if (!UUID_RE.test(uuidPart) || !ALLOWED_STAGES.has(stagePart)) {
          return jsonResponse({ error: "bad_entity_id" }, 400);
        }
        projectId = uuidPart;
      } else {
        if (!UUID_RE.test(String(body.entity_id))) {
          return jsonResponse({ error: "bad_entity_id" }, 400);
        }
        projectId = body.entity_id;
      }
      const own = await assertProjectOwner({ userId: auth.userId, projectId });
      if (own instanceof Response) return own;
    }
  }

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const isDemo = body.entity === "resume" && (body.file_path || "").startsWith("demo/");

  // For real candidates we need a STABLE per-candidate ProTalk chat_id so
  // the file-recognition step lives in the same dialog as the screen /
  // checklist / situations / training stages. Without this the function
  // falls through to the random `ask{ts}_{rand}` chat_id.
  let candIdForChat: string | null = null;
  if (body.entity === "resume" && !isDemo) {
    const token = (
      req.headers.get("x-candidate-token") ||
      req.headers.get("X-Candidate-Token") ||
      ""
    ).trim();
    if (token) {
      const sess = await admin
        .from("candidate_sessions")
        .select("candidate_id")
        .eq("token", token)
        .maybeSingle();
      candIdForChat = (sess.data as any)?.candidate_id || null;
    }
  }
  const candPublicId = await resolveCandidatePublicId(candIdForChat);
  // Employer flow (company/vacancy/training/etc. uploads) — resolve stable
  // employers.public_id so ProTalk uses `100000+N` chat_id вместо хэша UUID.
  const empPidForChat = (!isDemo && !candIdForChat && user?.id)
    ? await resolveEmployerPublicId({ userId: user.id })
    : undefined;

  let sourceUrl = body.file_url || "";
  if (body.bucket && body.file_path) {
    // Prefer a signed URL so private buckets (candidate-resumes) work too.
    const signed = await admin.storage.from(body.bucket).createSignedUrl(body.file_path, 60 * 30);
    if (signed.data?.signedUrl) {
      sourceUrl = signed.data.signedUrl;
    } else {
      const { data } = admin.storage.from(body.bucket).getPublicUrl(body.file_path);
      if (!data?.publicUrl) return jsonResponse({ error: "public_url_failed" }, 500);
      sourceUrl = data.publicUrl;
    }
  }

  // Для demo-флоу используем тот же стабильный demo_user_id, что и в
  // ai-restart / ai-demo-grade-* — иначе ProTalk создаёт новую сессию и
  // распознавание уезжает в чужой диалог.
  const chatId = isDemo
    ? buildChatId({ demoUserId: body.demo_user_id })
    : (candIdForChat
        ? buildChatId({ candidatePublicId: candPublicId, candidateId: candIdForChat })
        : buildChatId({ userId: user?.id, employerPublicId: empPidForChat }));
  const socialId = isDemo
    ? buildSocialId({ demo_user_id: body.demo_user_id })
    : (candIdForChat
        ? buildSocialId({ candidate_public_id: candPublicId, candidate_id: candIdForChat })
        : buildSocialId({ user_id: user?.id, employer_public_id: empPidForChat }));
  const userMsg = `${PROMPTS[body.entity]}${body.prompt_hint ? "\n\nКонтекст: " + body.prompt_hint : ""}\n\nИсточник: ${sourceUrl}${body.filename ? `\nИмя файла: ${body.filename}` : ""}\n\nВерни только готовый Markdown-текст без обёрток.`;

  // Регистрируем ai_jobs только для распознавания РЕЗЮМЕ кандидата —
  // именно эта операция была заявлена в Релизе H. Для company/vacancy/training
  // поведение не меняется (резерв опционален и не входил в спецификацию).
  let jobId: string | null = null;
  let attemptId: string | null = null;
  if (body.entity === "resume") {
    // owner = candidate; снимок содержит подписанный URL и путь к файлу,
    // чтобы резервная модель смогла повторно распознать файл без новой
    // загрузки и без потери уже распознанного текста.
    const token = (req.headers.get("x-candidate-token") || req.headers.get("X-Candidate-Token") || "").trim();
    if (token) {
      const sess = await admin.from("candidate_sessions").select("candidate_id").eq("token", token).maybeSingle();
      const candId = (sess.data as any)?.candidate_id || null;
      if (candId) {
        const idem = `ingest_resume:${candId}:${body.file_path || body.file_url || ""}`;
        const job = await createOrReuseAiJob({
          userId: null,
          candidateId: candId,
          jobType: "ingest_resume",
          idempotencyKey: idem,
          requestSnapshot: { message: userMsg, candidate_id: candId, bucket: body.bucket || null, file_path: body.file_path || null, filename: body.filename || null, timeout_ms: 180_000 },
          fallbackAllowed: true,
        });
        if ("id" in job) {
          jobId = job.id;
          attemptId = await startPrimaryAttempt(jobId);
        }
      }
    }
  }

  let text = "";
  let err: string | null = null;
  try {
    const r = await callProTalk({
      messages: [
        { role: "system", content: "Ты — внимательный аналитик. Чисто оформляешь содержимое документов в Markdown." },
        { role: "user", content: userMsg },
      ],
      chatId, socialId, timeoutMs: 180_000,
    });
    // ProTalk обычно кладёт ответ в `done`, но иногда возвращает текст в других
    // полях (reply/answer/content/result). Используем максимально широкий
    // экстрактор, чтобы не терять корректно распознанное резюме.
    const raw: any = r.raw || {};
    const extracted = String(
      r.text ||
      raw?.reply ||
      raw?.answer ||
      raw?.content ||
      raw?.result ||
      raw?.data?.text ||
      raw?.data?.done ||
      raw?.data?.reply ||
      ""
    );
    text = extracted.slice(0, Math.max(500, Math.min(body.max_chars || 10000, 10000)));
    // ProTalk иногда оборачивает ответ в ```markdown ... ``` — снимаем обёртку,
    // иначе UI показывает голый код вместо красивого форматирования.
    text = text
      .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    if (!text.trim()) { err = "ingest_empty_response"; }
  } catch (e) {
    err = String((e as Error).message);
  }

  // Cleanup: при успехе всегда удаляем исходный файл.
  // При технической ошибке резюме — ОСТАВЛЯЕМ файл в storage до повторной
  // попытки через RR Pro Max (резерв читает тот же путь из snapshot). Для
  // остальных entity (company/vacancy/training) поведение не меняется.
  const shouldKeepForFallback = body.entity === "resume" && err && jobId;
  if (body.bucket && body.file_path && !shouldKeepForFallback) {
    await admin.storage.from(body.bucket).remove([body.file_path]).catch(() => {});
  }

  await logToDb({
    user_message: userMsg, bot_reply: text,
    channel_id: chatId, user_social_id: socialId,
    channel_name: `ai-ingest:${body.entity}`, server_name: "ai-ingest-document",
    function_call_params: JSON.stringify({ entity: body.entity, entity_id: body.entity_id, bucket: body.bucket, file_path: body.file_path, file_url: body.file_url }),
    function_error: err,
  });

  if (err) {
    if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: err.slice(0, 64) });
    if (jobId) {
      await markJobStatus(jobId, "primary_failed");
      await markJobStatus(jobId, "fallback_available");
    }
    return jsonResponse({
      error: err,
      job_id: jobId,
      fallback_available: !!jobId,
      // Файл уже удалён cleanup-ом выше (или будет удалён при следующем
      // запросе) — клиент должен показать сценарий повторной загрузки.
      file_deleted: isDemo ? true : undefined,
    }, 500);
  }
  if (attemptId) await finishAttempt(attemptId, { status: "succeeded", result_reference: "ingest_resume:text_returned" });
  if (jobId) await markJobStatus(jobId, "primary_succeeded", true);
  // Demo-резюме не имеет кандидата в БД — просто возвращаем распознанный
  // текст, фронт сам кладёт его в локальное состояние.
  if (isDemo) {
    return jsonResponse({ ok: true, text, demo: true });
  }
  // STRICT persistence (R2 Block 1): we MUST not return ok:true unless the
  // recognised text actually lives in candidates.resume_text. Otherwise
  // ai-interview-screen-resume-v2 later sees an empty DB row and returns
  // no_resume («Я сломался»), but the client believes ingest succeeded.
  //
  // Flow:
  //   1) save via RPC + check error
  //   2) re-read length / hash / updated_at from the row
  //   3) only if both succeed → ok:true (with resume metadata)
  //   4) on failure → mark job save_failed, return resume_save_failed (500)
  if (body.entity === "resume") {
    const token = (
      req.headers.get("x-candidate-token") ||
      req.headers.get("X-Candidate-Token") ||
      ""
    ).trim();
    let candId: string | null = null;
    if (token) {
      const sess = await admin
        .from("candidate_sessions")
        .select("candidate_id")
        .eq("token", token)
        .maybeSingle();
      candId = (sess.data as any)?.candidate_id || null;
    }
    if (!candId) {
      if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: "resume_save_failed" });
      if (jobId) await markJobStatus(jobId, "primary_failed");
      return jsonResponse({ error: "resume_save_failed", detail: "no_candidate_for_token" }, 500);
    }
    if (!text || text.trim().length < 50) {
      if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: "resume_save_failed" });
      if (jobId) await markJobStatus(jobId, "primary_failed");
      return jsonResponse({ error: "resume_save_failed", detail: "text_too_short" }, 500);
    }
    const { error: rpcErr } = await admin.rpc("save_candidate_resume_text", {
      _candidate: candId,
      _resume_text: text,
    });
    if (rpcErr) {
      // eslint-disable-next-line no-console
      console.error("[ai-ingest-document] save_candidate_resume_text failed", String(rpcErr.message || rpcErr));
      if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: "resume_save_failed" });
      if (jobId) await markJobStatus(jobId, "primary_failed");
      return jsonResponse({ error: "resume_save_failed", detail: String(rpcErr.message || "rpc_error").slice(0, 160) }, 500);
    }
    // Read-back to confirm persistence (avoid trusting RPC return alone).
    const { data: cand, error: readErr } = await admin
      .from("candidates")
      .select("resume_text,resume_hash,resume_updated_at")
      .eq("id", candId)
      .maybeSingle();
    const rlen = String((cand as any)?.resume_text || "").length;
    if (readErr || rlen < 50) {
      if (attemptId) await finishAttempt(attemptId, { status: "failed", safe_error_code: "resume_save_failed" });
      if (jobId) await markJobStatus(jobId, "primary_failed");
      return jsonResponse({
        error: "resume_save_failed",
        detail: readErr ? String(readErr.message).slice(0, 160) : `readback_len=${rlen}`,
      }, 500);
    }
    return jsonResponse({
      ok: true,
      text,
      saved: true,
      resume_len: rlen,
      resume_hash: (cand as any)?.resume_hash || null,
      resume_updated_at: (cand as any)?.resume_updated_at || null,
    });
  }
  return jsonResponse({ ok: true, text });
});