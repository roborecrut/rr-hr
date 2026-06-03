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

  // === Handle /start <ref_code> deep link (link Telegram chat to bot, capture ref) ===
  const text: string | undefined = update.message?.text;
  const fromTgId: number | undefined = update.message?.from?.id;
  if (text && text.startsWith("/start") && fromTgId) {
    const parts = text.split(/\s+/);
    const refCode = parts[1]?.trim() || "";
    if (refCode) {
      // Save startParam on telegram_links for later attribution (best-effort)
      const { data: link } = await supabase.from("telegram_links")
        .select("user_id").eq("telegram_id", fromTgId).maybeSingle();
      if (link?.user_id) {
        await supabase.rpc("apply_referral_bonus", { _referrer_public_id: refCode, _new_user: link.user_id });
      }
    }
    // Greet + offer phone share button
    const BOT_TOKEN_SEND = BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN_SEND}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: fromTgId,
        text: "👋 Добро пожаловать в RR! Откройте мини-приложение или поделитесь номером телефона, чтобы привязать его к профилю.",
        reply_markup: {
          keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]],
          resize_keyboard: true, one_time_keyboard: true,
        },
      }),
    });
  }

  // === Handle contact share — store phone on profiles ===
  const contact = update.message?.contact;
  if (contact?.phone_number && contact?.user_id) {
    const phone = String(contact.phone_number).replace(/^\+?/, "+");
    const { data: link } = await supabase.from("telegram_links")
      .select("user_id").eq("telegram_id", contact.user_id).maybeSingle();
    if (link?.user_id) {
      await supabase.from("profiles").update({ telegram_phone: phone }).eq("id", link.user_id);
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: contact.user_id,
          text: `✅ Номер ${phone} сохранён в вашем профиле RR.`,
          reply_markup: { remove_keyboard: true },
        }),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});