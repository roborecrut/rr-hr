// Ingest a document (storage file or external URL) for a given entity (company/vacancy/training).
// Asks ProTalk to read it and return a clean markdown summary (≤10k chars).
// On success deletes the source file from storage to avoid wasting space.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerJwt } from "../_shared/auth.ts";

// Whitelist of buckets ai-ingest-document is allowed to read from.
// Anything else (e.g. user-supplied bucket name) is rejected to prevent
// reading unrelated storage spaces via a signed URL.
const ALLOWED_BUCKETS = new Set([
  "company-docs",
  "vacancy-docs",
  "training-docs",
  "candidate-resumes",
  "uploads",
]);

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

  // resume ingestion is invoked by candidate-side flows with their own token;
  // employer-side entities require employer JWT.
  if (body.entity !== "resume") {
    const auth = await requireEmployerJwt(req);
    if (auth instanceof Response) return auth;
  }

  if (body.bucket && !ALLOWED_BUCKETS.has(body.bucket)) {
    return jsonResponse({ error: "bucket_not_allowed" }, 403);
  }
  // Disallow path traversal / absolute paths in storage key.
  if (body.file_path && (body.file_path.includes("..") || body.file_path.startsWith("/"))) {
    return jsonResponse({ error: "bad_file_path" }, 400);
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