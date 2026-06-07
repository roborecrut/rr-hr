import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, logToDb, buildChatId, buildSocialId } from "../_shared/protalk.ts";

const Body = z.object({
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  content: z.string().trim().min(1).max(500),
});

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function generateAiReply(sb: any, review: { first_name: string; last_name: string; content: string }) {
  const { data: faqs } = await sb.from("faq_items").select("question,answer").limit(30);
  const faqText = (faqs || []).map((f: any, i: number) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n");
  const prompt = `Ты — представитель команды HR-RR. Тебе оставили публичный отзыв. Ответь вежливо, по делу, 2-4 предложения, без воды. Если в отзыве есть вопрос — ответь, опираясь на FAQ ниже. Если благодарность — поблагодари. Если жалоба — извинись и предложи решение. Обращайся по имени.\n\n--- FAQ компании ---\n${faqText || "(пусто)"}\n\n--- Отзыв от ${review.first_name} ${review.last_name} ---\n${review.content}`;
  try {
    const { text } = await callProTalk({
      message: prompt,
      chatId: buildChatId({ userId: `review_${Date.now()}` }),
      socialId: buildSocialId({ user_id: `review_${Date.now()}` }),
      timeoutMs: 60_000,
    });
    await logToDb({
      user_message: prompt.slice(0, 2000),
      bot_reply: text,
      channel_id: "reviews",
      user_social_id: `${review.first_name} ${review.last_name}`,
      channel_name: "reviews-submit",
      server_name: "reviews-submit",
    });
    return text;
  } catch (e) {
    console.error("protalk failed:", (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const sb = admin();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const { data: rl } = await sb.rpc("rl_hit", { _key: `rev:${ip}`, _window_sec: 3600, _limit: 5 });
    if (rl === false) return jsonResponse({ error: "rate_limited" }, 429);

    const { data: row, error } = await sb.from("reviews").insert({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      content: parsed.data.content,
    }).select().single();
    if (error) return jsonResponse({ error: error.message }, 500);

    const ai = await generateAiReply(sb, parsed.data);
    if (ai) await sb.from("reviews").update({ ai_reply: ai }).eq("id", row.id);

    return jsonResponse({ ok: true, review: { ...row, ai_reply: ai ?? row.ai_reply } });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});