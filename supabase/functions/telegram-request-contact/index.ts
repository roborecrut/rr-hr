// Sends a "share your phone" prompt to the authenticated user's Telegram chat.
// Requires the user to have linked their Telegram account (telegram_links row).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!BOT_TOKEN || !SUPABASE_URL || !ANON || !SERVICE_KEY) return jsonResponse({ error: "env_missing" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.slice(7);
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return jsonResponse({ error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: link } = await admin.from("telegram_links")
    .select("telegram_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!link?.telegram_id) return jsonResponse({ error: "telegram_not_linked" }, 400);

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: link.telegram_id,
      text: "📱 Пожалуйста, нажмите кнопку ниже, чтобы привязать номер телефона к профилю RR.",
      reply_markup: {
        keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]],
        resize_keyboard: true, one_time_keyboard: true,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return jsonResponse({ error: "telegram_send_failed", details: data?.description || res.status }, 502);
  }
  return jsonResponse({ ok: true });
});