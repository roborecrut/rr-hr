// Generate long-form Markdown training material for ONE stage of a vacancy.
// Stage is one of: 'professional' | 'product' | 'system'.
// Saves a single training_blocks row per (project_id, stage) with materials_md.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";

const STAGE_TITLES: Record<string, string> = {
  professional: "Профессиональное обучение",
  product: "Продуктовое обучение",
  system: "Системное обучение (CRM, регламенты, условия)",
};

const STAGE_FOCUS: Record<string, string> = {
  professional: "профессиональные навыки, обязанности, методики и инструменты по должности",
  product: "продукты, услуги и ценностные предложения компании, аргументация и преимущества",
  system: "рабочие процессы, CRM, отчётность, регламенты, условия труда и взаимодействие в команде",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    project_id: string; stage: string; source_text?: string;
    context_keys?: string[]; wishes?: string;
  };
  if (!body?.project_id || !body?.stage || !STAGE_TITLES[body.stage]) {
    return jsonResponse({ error: "bad_body" }, 400);
  }

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: proj, error: pe } = await admin.from("projects").select("*").eq("id", body.project_id).maybeSingle();
  if (pe || !proj) return jsonResponse({ error: "no_project" }, 404);

  let company: any = null;
  if (proj.company_id) {
    const { data: c } = await admin.from("companies").select("*").eq("id", proj.company_id).maybeSingle();
    company = c;
  }

  const ctx: string[] = [
    `Должность: ${proj.role_name || ""}`,
    `Краткое описание: ${proj.role_summary || ""}`,
    `Обязанности: ${proj.responsibilities || ""}`,
    `Требования: ${proj.requirements || ""}`,
    `Условия: ${proj.conditions || ""}`,
    `Мотивация: ${proj.motivation || ""}`,
  ];

  // Available context blocks (by key). Front-end may pass `context_keys` to
  // include a custom subset; otherwise all non-empty blocks are included.
  const blocks: Record<string, string> = {
    intro:        proj.training_intro_text || "",
    professional: proj.training_professional_text || proj.training_prof_text || "",
    product:      proj.training_product_text || "",
    systems:      proj.training_systems_text || proj.training_system_text || "",
    regulations:  proj.training_regulations_text || "",
    wiki:         proj.training_wiki_text || "",
    company:      company ? [company.name, company.description_text, company.products_text, company.mission_text, company.system_text, company.schedule_text, company.payouts_text].filter(Boolean).join("\n") : "",
  };
  const labels: Record<string, string> = {
    intro: "Введение", professional: "Профессиональный блок", product: "Продуктовый блок",
    systems: "Системный блок", regulations: "Регламенты", wiki: "Wiki", company: "Компания",
  };
  const selected = Array.isArray(body.context_keys) && body.context_keys.length
    ? body.context_keys
    : Object.keys(blocks);
  for (const k of selected) {
    if (blocks[k]) ctx.push(`${labels[k] || k}: ${blocks[k]}`);
  }
  if (body.source_text) ctx.push(`Дополнительный материал (из файла):\n${body.source_text.slice(0, 8000)}`);
  const wishes = (body.wishes || "").trim().slice(0, 1000);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  const msg = `Подготовь учебный материал в Markdown для этапа «${STAGE_TITLES[body.stage]}». Фокус: ${STAGE_FOCUS[body.stage]}.
Объём 1500–3000 слов. Структура: вводный абзац, разделы H2 (минимум 3), внутри H3/списки/чек-листы, в конце «Контрольные точки». Не более 20 000 символов. Только Markdown, без преамбулы.
${wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${wishes}\n` : ""}
КОНТЕКСТ:
${ctx.filter(Boolean).join("\n")}`;

  try {
    const r = await callProTalk({
      messages: [{ role: "system", content: "Ты — опытный методист корпоративного обучения." }, { role: "user", content: msg }],
      chatId, socialId, timeoutMs: 180_000,
    });
    const text = (r.text || "").slice(0, 20000);

    const { data: existing } = await admin.from("training_blocks")
      .select("id").eq("project_id", body.project_id).eq("stage", body.stage).eq("block_key", body.stage).maybeSingle();
    let blockId = existing?.id;
    if (blockId) {
      await admin.from("training_blocks").update({
        materials_md: text, ai_generated_at: new Date().toISOString(), title: STAGE_TITLES[body.stage],
      }).eq("id", blockId);
    } else {
      const { data: ins, error: ie } = await admin.from("training_blocks").insert({
        project_id: body.project_id, stage: body.stage, block_key: body.stage,
        title: STAGE_TITLES[body.stage], materials_md: text,
        ai_generated_at: new Date().toISOString(), pass_score: 70,
      }).select("id").single();
      if (ie) throw new Error("save_failed: " + ie.message);
      blockId = ins.id;
    }

    await logToDb({ user_message: msg, bot_reply: text, channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-stage-material:${body.stage}`, server_name: "ai-generate-stage-material",
      function_call_params: JSON.stringify({ project_id: body.project_id, stage: body.stage }) });
    return jsonResponse({ ok: true, text, block_id: blockId });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId,
      channel_name: `ai-stage-material:${body.stage}`, server_name: "ai-generate-stage-material", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});