// Generate a long-form training material (markdown) for a single block of a project.
// Saves materials_md + ai_generated_at on training_blocks. Returns { text, block_id }.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";

const BLOCK_TITLES: Record<string, string> = {
  professional: "Профессиональные знания и навыки",
  product: "Продукт и услуги компании",
  systems: "Рабочие системы и инструменты",
  wiki: "База знаний (Wiki) команды",
  regulations: "Регламенты и стандарты работы",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    project_id: string; block_key: string; source_text?: string;
  };
  if (!body?.project_id || !body?.block_key) return jsonResponse({ error: "bad_body" }, 400);
  if (!BLOCK_TITLES[body.block_key]) return jsonResponse({ error: "bad_block_key" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: proj, error: pe } = await admin.from("projects").select("*").eq("id", body.project_id).maybeSingle();
  if (pe || !proj) return jsonResponse({ error: "no_project" }, 404);

  const ctx = [
    `Должность: ${proj.role_name || ""}`,
    `Краткое описание: ${proj.role_summary || ""}`,
    `Обязанности: ${proj.responsibilities || ""}`,
    `Требования: ${proj.requirements || ""}`,
    `Условия: ${proj.conditions || ""}`,
    `Мотивация: ${proj.motivation || ""}`,
    `Обучение по блоку: ${proj["training_" + body.block_key] || ""}`,
    body.source_text ? `Дополнительный материал:\n${body.source_text.slice(0, 8000)}` : "",
  ].filter(Boolean).join("\n");

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });
  const msg = `Сгенерируй учебный материал в Markdown по блоку «${BLOCK_TITLES[body.block_key]}» для вакансии. Объём 1500–3000 слов. Структура: Цели обучения → Ключевые знания → Примеры/кейсы → Чек-лист. Используй заголовки H2/H3 и списки. Не более 20 000 символов.\n\nКонтекст:\n${ctx}`;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: "Ты — опытный методист корпоративного обучения." }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 180_000,
    });
    const text = (r.text || "").slice(0, 20000);

    // upsert training_block for (project_id, block_key)
    const { data: existing } = await admin.from("training_blocks")
      .select("id").eq("project_id", body.project_id).eq("block_key", body.block_key).maybeSingle();
    let blockId = existing?.id;
    if (blockId) {
      await admin.from("training_blocks").update({ materials_md: text, ai_generated_at: new Date().toISOString() }).eq("id", blockId);
    } else {
      const { data: ins, error: ie } = await admin.from("training_blocks").insert({
        project_id: body.project_id, block_key: body.block_key,
        title: BLOCK_TITLES[body.block_key], materials_md: text, ai_generated_at: new Date().toISOString(),
        pass_score: 70,
      }).select("id").single();
      if (ie) throw new Error("save_failed: " + ie.message);
      blockId = ins.id;
    }

    await logToDb({ user_message: msg, bot_reply: text, channel_id: chatId, user_social_id: socialId, channel_name: `ai-training-material:${body.block_key}`, server_name: "ai-generate-training-material", function_call_params: JSON.stringify({ project_id: body.project_id, block_key: body.block_key }) });
    return jsonResponse({ ok: true, text, block_id: blockId });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: `ai-training-material:${body.block_key}`, server_name: "ai-generate-training-material", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});