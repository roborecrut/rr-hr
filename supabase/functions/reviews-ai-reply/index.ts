import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, logToDb, buildChatId, buildSocialId } from "../_shared/protalk.ts";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);
    const sb = admin();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "forbidden" }, 403);

    const { review_id } = await req.json();
    if (!review_id) return jsonResponse({ error: "review_id required" }, 400);

    const { data: rev, error } = await sb.from("reviews").select("*").eq("id", review_id).single();
    if (error || !rev) return jsonResponse({ error: "not_found" }, 404);

    const { data: faqs } = await sb.from("faq_items").select("question,answer").limit(30);
    const faqText = (faqs || []).map((f: any, i: number) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n");
    const prompt = `Ты — представитель команды HR-RR. Ответь вежливо на отзыв (2-4 предложения), обращаясь по имени. Опирайся на FAQ.\n\n--- FAQ ---\n${faqText || "(пусто)"}\n\n--- Отзыв от ${rev.first_name} ${rev.last_name} ---\n${rev.content}`;

    const { text } = await callProTalk({
      message: prompt,
      chatId: buildChatId({ userId: `review_${rev.id}` }),
      socialId: buildSocialId({ user_id: `review_${rev.id}` }),
      timeoutMs: 60_000,
    });

    await sb.from("reviews").update({ ai_reply: text }).eq("id", rev.id);
    await logToDb({
      user_message: prompt.slice(0, 2000), bot_reply: text,
      channel_id: "reviews", user_social_id: `${rev.first_name} ${rev.last_name}`,
      channel_name: "reviews-ai-reply", server_name: "reviews-ai-reply",
    });

    return jsonResponse({ ok: true, ai_reply: text });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});