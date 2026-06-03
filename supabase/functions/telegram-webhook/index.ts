// Receives updates from the Telegram bot, logs to telegram_logs.
// Secured by the secret_token header (we set it when calling setWebhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const enc = new TextEncoder();

async function deriveSecret(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`telegram-webhook:${token}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return new Response("env", { status: 500 });

  const expected = await deriveSecret(BOT_TOKEN);
  if (!safeEqual(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update || typeof update.update_id !== "number") return new Response("ok");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const msg = update.message ?? update.edited_message ?? update.callback_query?.message;
  const chatId = msg?.chat?.id ?? null;

  await supabase.from("telegram_logs").insert({
    direction: "in",
    chat_id: chatId,
    payload: update,
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});