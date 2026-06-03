// Telegram Mini App — verify initData and issue a Supabase session.
// initData is a URL-encoded query string from window.Telegram.WebApp.initData.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const enc = new TextEncoder();

async function hmacSha256(keyBytes: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "env_missing" }, 500);

  let body: { initData?: string; intent?: string } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }
  if (!body.initData) return jsonResponse({ error: "init_data_missing" }, 400);

  const intent = body.intent === "employer" ? "employer" : "candidate";

  // Parse initData
  const params = new URLSearchParams(body.initData);
  const hash = params.get("hash") || "";
  params.delete("hash");

  const entries: [string, string][] = [];
  params.forEach((v, k) => entries.push([k, v]));
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = await hmacSha256(enc.encode("WebAppData").buffer as ArrayBuffer, BOT_TOKEN);
  const sig = toHex(await hmacSha256(secretKey, dataCheckString));
  if (sig !== hash) return jsonResponse({ error: "bad_signature" }, 401);

  const userJson = params.get("user");
  if (!userJson) return jsonResponse({ error: "no_user" }, 400);
  const tgUser = JSON.parse(userJson) as {
    id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string;
  };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const email = `tg_${tgUser.id}_${intent}@rrhr.local`;

  const { data: link } = await admin.from("telegram_links")
    .select("user_id")
    .eq("telegram_id", tgUser.id)
    .eq("intent", intent)
    .maybeSingle();
  let userId = link?.user_id as string | undefined;

  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: {
        intent, registered_via: "telegram",
        telegram_id: String(tgUser.id),
        telegram_username: tgUser.username ?? null,
        display_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || `tg_${tgUser.id}`,
        avatar_url: tgUser.photo_url ?? null,
      },
    });
    if (error) return jsonResponse({ error: "create_user_failed", details: error.message }, 500);
    userId = created.user!.id;

    await admin.from("telegram_links").insert({
      user_id: userId, telegram_id: tgUser.id,
      telegram_username: tgUser.username, first_name: tgUser.first_name, last_name: tgUser.last_name,
      photo_url: tgUser.photo_url, auth_date: new Date().toISOString(), source: "miniapp", intent,
    });

    if (intent === "employer") {
      await admin.from("employers").insert({
        user_id: userId, contact_name: tgUser.first_name ?? null, contact_tg: tgUser.username ?? null,
      });
    }
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) return jsonResponse({ error: "link_failed", details: linkErr.message }, 500);

  return jsonResponse({
    ok: true, user_id: userId, email,
    token_hash: linkData.properties?.hashed_token,
    verification_type: "magiclink",
  });
});