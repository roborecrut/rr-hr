// Unified AI chat assistant via ProTalk (OpenAI-compatible, stream=true).
// kinds: employer | candidate | vacancy_consultant
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk,
  type ChatMessage,
  buildChatId,
  buildSocialId,
  getUserFromAuthHeader,
  logToDb,
} from "../_shared/protalk.ts";

const SYSTEMS: Record<string, string> = {
  employer:
    "Ты — ИИ-помощник работодателя HR-платформы RR. Помогаешь оформлять вакансии, обучение, чек-листы, отвечать на вопросы кандидатов. Отвечай на русском, кратко и по делу.",
  candidate:
    "Ты — ИИ-наставник кандидата на платформе RR. Помогаешь пройти отбор, обучение и собеседование. Отвечай дружелюбно, на русском.",
  vacancy_consultant:
    "Ты — консультант по вакансии. Отвечаешь будущим кандидатам на вопросы об условиях, графике, обязанностях. Отвечай только по предоставленному контексту вакансии.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    kind: "employer" | "candidate" | "vacancy_consultant";
    messages: ChatMessage[];
    context?: string;
    project_id?: string;
    candidate_id?: string;
    employer_id?: string;
    employer_public_id?: string;
    userInfo?: {
      telegram_id?: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
  if (!body?.kind || !Array.isArray(body.messages)) return jsonResponse({ error: "bad_body" }, 400);

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ telegramId: body.userInfo?.telegram_id, userId: user?.id });
  const socialId = buildSocialId({ ...(body.userInfo || {}), user_id: user?.id, employer_public_id: body.employer_public_id });

  const system = SYSTEMS[body.kind] ?? SYSTEMS.employer;
  const ctxMsg: ChatMessage[] = body.context ? [{ role: "system", content: `Контекст: ${body.context}` }] : [];
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...ctxMsg, ...body.messages];

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content || "";

  try {
    const { text, raw } = await callProTalk({ messages });
    await logToDb({
      user_message: lastUser,
      bot_reply: text,
      channel_id: chatId,
      user_social_id: socialId,
      channel_name: `ai-chat:${body.kind}`,
      server_name: "ai-chat",
      function_call_params: JSON.stringify({
        project_id: body.project_id, candidate_id: body.candidate_id, employer_id: body.employer_id,
      }),
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
      channel_name: `ai-chat:${body.kind}`,
      server_name: "ai-chat",
      function_error: err,
    });
    return jsonResponse({ error: err }, 500);
  }
});