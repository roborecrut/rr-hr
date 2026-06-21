// Sends /restart to ProTalk to reset the dialog for the given employer.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerJwt } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { employer_public_id?: string; demo_user_id?: string };
  // Anonymous /demo flow uses a stable browser-local demo_user_id instead of
  // a Supabase JWT. Require auth only when no demo_user_id is provided.
  if (!body?.demo_user_id) {
    const auth = await requireEmployerJwt(req);
    if (auth instanceof Response) return auth;
  }
  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({
    userId: user?.id,
    employerPublicId: body?.employer_public_id,
    demoUserId: body?.demo_user_id,
  });
  const socialId = buildSocialId({
    user_id: user?.id,
    employer_public_id: body?.employer_public_id,
    demo_user_id: body?.demo_user_id,
  });
  try {
    const { text, raw } = await callProTalk({
      message: "/restart",
      chatId,
      socialId,
    });
    await logToDb({
      user_message: "/restart",
      bot_reply: text,
      channel_id: chatId,
      user_social_id: socialId,
      channel_name: "ai-restart",
      server_name: "ai-restart",
      tokens_in_source: raw?.usage?.prompt_tokens ?? null,
      tokens_out_source: raw?.usage?.completion_tokens ?? null,
    });
    return jsonResponse({ ok: true, reply: text });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: "/restart", bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-restart", server_name: "ai-restart", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});