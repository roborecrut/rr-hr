// Telegram OIDC — start authorization. Generates PKCE state and returns auth URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { safeRedirect } from "../_shared/telegramRoute.ts";

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const CLIENT_ID = Deno.env.get("TELEGRAM_OIDC_CLIENT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!CLIENT_ID) return jsonResponse({ error: "oidc_client_id_missing" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "supabase_env_missing" }, 500);

  let body: { intent?: string; ref?: string; redirect_to?: string; origin?: string } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }

  const intent = body.intent === "employer" ? "employer" : "candidate";
  const ref = (body.ref || "").trim() || null;
  const rawRedirect = body.redirect_to || body.origin || null;
  const res = safeRedirect(rawRedirect);
  if (res.rejected) {
    console.warn("[telegram-oidc-start] redirect_to rejected", {
      reason: res.reason,
      input: res.originalInput,
      intent,
      ref,
    });
  } else {
    console.log("[telegram-oidc-start] redirect_to accepted", {
      host: res.url.hostname,
      path: res.url.pathname,
      intent,
      ref,
    });
  }
  const redirectTo = `${res.url.origin}${res.url.pathname}${res.url.search}`;
  const origin = res.url.origin;
  // Telegram OIDC redirect_uri must EXACTLY match what is whitelisted in BotFather.
  // We keep one URL across all client origins by pointing it at the edge function.
  const redirectUri = `${SUPABASE_URL}/functions/v1/telegram-oidc-callback`;

  // Generate state + PKCE verifier
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = b64url(stateBytes);

  const verifierBytes = new Uint8Array(48);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = b64url(verifierBytes);
  const codeChallenge = b64url(await sha256(codeVerifier));

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error: insErr } = await admin.from("oauth_states").insert({
    state,
    code_verifier: codeVerifier,
    intent,
    ref,
    redirect_to: redirectTo,
    provider: "telegram",
  });
  if (insErr) return jsonResponse({ error: "state_persist_failed", details: insErr.message }, 500);

  const params = new URLSearchParams({
    bot_id: CLIENT_ID,
    origin,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return jsonResponse({
    ok: true,
    url: `https://oauth.telegram.org/auth?${params.toString()}`,
    state,
  });
});