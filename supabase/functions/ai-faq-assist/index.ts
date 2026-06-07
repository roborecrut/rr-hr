// FAQ-aware AI assistant: loads published FAQ from DB and calls ProTalk
// with that knowledge base as system context.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk,
  type ChatMessage,
  buildChatId,
  buildSocialId,
  getAdminClient,
  getUserFromAuthHeader,
  logToDb,
} from "../_shared/protalk.ts";

const SYSTEM_BASE = `Ты — ИИ-Ассистент платформы «Робот Рекрутер» (RR) — российской ИИ-платформы найма линейного и массового персонала.

Твоя задача — отвечать пользователю (работодателю или соискателю) по продукту, ценам и настройкам кабинета на основе официальной базы знаний (FAQ) ниже.

Правила:
- Отвечай дружелюбно, на русском, по делу, без воды.
- Используй цифры и факты ТОЛЬКО из базы знаний. Не выдумывай тарифы, сроки, фичи.
- Если ответа в базе нет — честно скажи «в моей базе знаний этого пока нет, напишите в поддержку support@hr-rr.online».
- Для длинных ответов используй markdown: списки, жирный, заголовки уровня ### максимум.
- Если вопрос про «сколько стоит» — называй конкретные RR и рубли из базы.
- В конце уместного ответа можешь предложить следующий шаг (зарегистрироваться, открыть кабинет, написать в поддержку).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    messages: ChatMessage[];
    employer_public_id?: string;
  };
  if (!body?.messages || !Array.isArray(body.messages)) {
    return jsonResponse({ error: "bad_body" }, 400);
  }

  // Load published FAQ knowledge base
  let knowledge = "";
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data } = await admin
        .from("faq_items")
        .select("category, question, answer")
        .eq("is_published", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .limit(500);
      const items = data || [];
      knowledge = items
        .map((f: any, i: number) => `[${i + 1}] (${f.category}) В: ${f.question}\nО: ${f.answer}`)
        .join("\n\n");
    }
  } catch (e) {
    console.error("faq load failed:", e);
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id, employer_public_id: body.employer_public_id });

  const system: ChatMessage = {
    role: "system",
    content: knowledge
      ? `${SYSTEM_BASE}\n\n=== БАЗА ЗНАНИЙ FAQ (${knowledge.length} симв.) ===\n${knowledge}\n=== КОНЕЦ БАЗЫ ===`
      : SYSTEM_BASE,
  };

  const messages: ChatMessage[] = [system, ...body.messages];
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content || "";

  try {
    const { text, raw } = await callProTalk({ messages, chatId, socialId });
    await logToDb({
      user_message: lastUser,
      bot_reply: text,
      channel_id: chatId,
      user_social_id: socialId,
      channel_name: "ai-faq-assist",
      server_name: "ai-faq-assist",
      tokens_in_source: raw?.usage?.prompt_tokens ?? null,
      tokens_out_source: raw?.usage?.completion_tokens ?? null,
      tokens_total: raw?.usage?.total_tokens ?? null,
    });
    return jsonResponse({ reply: text });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({
      user_message: lastUser,
      bot_reply: "",
      channel_id: chatId,
      user_social_id: socialId,
      channel_name: "ai-faq-assist",
      server_name: "ai-faq-assist",
      function_error: err,
    });
    return jsonResponse({ error: err }, 500);
  }
});