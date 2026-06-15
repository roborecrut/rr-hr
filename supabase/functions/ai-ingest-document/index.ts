// Ingest a document (storage file or external URL) for a given entity (company/vacancy/training).
// Asks ProTalk to read it and return a clean markdown summary (≤10k chars).
// On success deletes the source file from storage to avoid wasting space.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerJwt, getEmployerIdForUser, assertProjectOwner } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      // training: TrainingWizard passes `${projectId}-${stage}`; extract the
      // UUID prefix before ownership check.
      const projectId =
        body.entity === "training"
          ? (body.entity_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] || "")
          : body.entity_id;
      if (!projectId) return jsonResponse({ error: "bad_entity_id" }, 400);
      const own = await assertProjectOwner({ userId: auth.userId, projectId });
      if (own instanceof Response) return own;
    }
  }

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
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

  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });
  const userMsg = `${PROMPTS[body.entity]}${body.prompt_hint ? "\n\nКонтекст: " + body.prompt_hint : ""}\n\nИсточник: ${sourceUrl}${body.filename ? `\nИмя файла: ${body.filename}` : ""}\n\nВерни только готовый Markdown-текст без обёрток.`;

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
    text = (r.text || "").slice(0, Math.max(500, Math.min(body.max_chars || 10000, 10000)));
  } catch (e) {
    err = String((e as Error).message);
  }

  // Cleanup: always try to remove the uploaded file (success or fail).
  if (body.bucket && body.file_path) {
    await admin.storage.from(body.bucket).remove([body.file_path]).catch(() => {});
  }

  await logToDb({
    user_message: userMsg, bot_reply: text,
    channel_id: chatId, user_social_id: socialId,
    channel_name: `ai-ingest:${body.entity}`, server_name: "ai-ingest-document",
    function_call_params: JSON.stringify({ entity: body.entity, entity_id: body.entity_id, bucket: body.bucket, file_path: body.file_path, file_url: body.file_url }),
    function_error: err,
  });

  if (err) return jsonResponse({ error: err }, 500);
  return jsonResponse({ ok: true, text });
});