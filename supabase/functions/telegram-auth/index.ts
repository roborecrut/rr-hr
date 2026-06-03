// Telegram Login Widget — server-side verification + Supabase session.
// Client sends Telegram payload (id, first_name, username, photo_url, auth_date, hash, ...).
// We verify HMAC, upsert user via Admin API, link telegram_id, issue magiclink token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const enc = new TextEncoder();

async function sha256(data: Uint8Array): Promise<ArrayBuffer> {
  return await crypto.subtle.digest("SHA-256", data);
}

async function hmacSha256Hex(keyBytes: ArrayBuffer, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildDataCheckString(p: Record<string, unknown>): string {
  return Object.keys(p)
    .filter((k) => k !== "hash" && p[k] !== undefined && p[k] !== null && p[k] !== "")
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!BOT_TOKEN) return jsonResponse({ error: "telegram_bot_token_missing" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "supabase_env_missing" }, 500);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }

  const intent = (payload.intent === "employer" ? "employer" : "candidate") as "employer" | "candidate";
  delete (payload as any).intent;

  const id = Number(payload.id);
  const hash = String(payload.hash || "");
  const authDate = Number(payload.auth_date);
  if (!id || !hash || !authDate) return jsonResponse({ error: "bad_payload" }, 400);

  // 1) Verify HMAC: secret = SHA256(BOT_TOKEN), then HMAC-SHA256(secret, data_check_string)
  const secret = await sha256(enc.encode(BOT_TOKEN));
  const dataCheck = buildDataCheckString(payload);
  const expected = await hmacSha256Hex(secret, dataCheck);
  if (expected !== hash) return jsonResponse({ error: "bad_signature" }, 401);

  // 2) Optional freshness (24h)
  if (Math.floor(Date.now() / 1000) - authDate > 60 * 60 * 24) {
    return jsonResponse({ error: "auth_expired" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 3) Already linked for this intent? (employer & candidate are separate accounts)
  const { data: existingLink } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_id", id)
    .eq("intent", intent)
    .maybeSingle();

  let userId = existingLink?.user_id as string | undefined;
  const email = `tg_${id}_${intent}@rrhr.local`;

  if (!userId) {
    // Create new user (auto-confirmed) with intent in metadata
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        intent,
        registered_via: "telegram",
        telegram_id: String(id),
        telegram_username: payload.username ?? null,
        display_name: [payload.first_name, payload.last_name].filter(Boolean).join(" ") || `tg_${id}`,
        avatar_url: payload.photo_url ?? null,
        name: payload.first_name ?? null,
      },
    });
    if (createErr) return jsonResponse({ error: "create_user_failed", details: createErr.message }, 500);
    userId = created.user!.id;

    await admin.from("telegram_links").insert({
      user_id: userId,
      telegram_id: id,
      telegram_username: payload.username ?? null,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      photo_url: payload.photo_url ?? null,
      auth_date: new Date(authDate * 1000).toISOString(),
      source: "widget",
      intent,
    });

    // Materialize employer row if needed (candidates rows are created when they enter funnel)
    if (intent === "employer") {
      await admin.from("employers").insert({
        user_id: userId,
        contact_name: payload.first_name ?? null,
        contact_tg: (payload.username as string) ?? null,
      });
    }
  }

  // 4) Issue magiclink — client uses verifyOtp to obtain a session
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) return jsonResponse({ error: "link_failed", details: linkErr.message }, 500);

  return jsonResponse({
    ok: true,
    user_id: userId,
    email,
    token_hash: linkData.properties?.hashed_token,
    verification_type: "magiclink",
  });
});