// Telegram OIDC — start authorization. Generates PKCE state and returns auth URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { safeRedirect } from "../_shared/telegramRoute.ts";
import { logEvent, clientIp, sha256Hex } from "../_shared/telemetry.ts";
import { rlHit } from "../_shared/rateLimit.ts";

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
  try {
  const CLIENT_ID = Deno.env.get("TELEGRAM_OIDC_CLIENT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!CLIENT_ID) return jsonResponse({ error: "oidc_client_id_missing" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "supabase_env_missing" }, 500);

  let body: {
    intent?: string;
    ref?: string;
    redirect_to?: string;
    origin?: string;
    turnstile_token?: string;
    company_slug?: string;
    project_slug?: string;
    project_id?: string;
  } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }

  const intent = body.intent === "employer" ? "employer" : "candidate";
  const ref = (body.ref || "").trim() || null;
  const companySlug = (body.company_slug || "").trim() || null;
  const projectSlug = (body.project_slug || "").trim() || null;
  const projectId = (body.project_id || "").trim() || null;
  const rawRedirect = body.redirect_to || body.origin || null;

  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);
  const uaHash = await sha256Hex(req.headers.get("user-agent") || "");

  // Rate limits — fail-open if RPC fails.
  const okIpMin = await rlHit(`tg-start:ip:${ipHash}`, 60, 10);
  const okIpHr  = await rlHit(`tg-start:ip-hr:${ipHash}`, 3600, 60);
  const okIntent = await rlHit(`tg-start:${intent}:${ipHash}`, 3600, 20);
  if (!okIpMin || !okIpHr || !okIntent) {
    await logEvent({
      kind: "rate_limited", source: "start", intent,
      reason: !okIpMin ? "ip_min" : !okIpHr ? "ip_hr" : "intent",
      ip_hash: ipHash, ua_hash: uaHash,
    });
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  // Optional Turnstile verification (when secret + token are present).
  const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (TURNSTILE_SECRET) {
    if (!body.turnstile_token) {
      await logEvent({
        kind: "turnstile_fail", source: "start", intent,
        reason: "missing_token", ip_hash: ipHash, ua_hash: uaHash,
      });
      return jsonResponse({ error: "turnstile_required" }, 403);
    }
    try {
      const form = new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: body.turnstile_token,
        remoteip: ip,
      });
      const tr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const tj = await tr.json();
      if (!tj.success) {
        await logEvent({
          kind: "turnstile_fail", source: "start", intent,
          reason: (tj["error-codes"] || []).join(",") || "verify_failed",
          ip_hash: ipHash, ua_hash: uaHash, meta: { codes: tj["error-codes"] },
        });
        return jsonResponse({ error: "turnstile_failed" }, 403);
      }
    } catch (e) {
      await logEvent({
        kind: "turnstile_fail", source: "start", intent,
        reason: "verify_exception", ip_hash: ipHash, ua_hash: uaHash,
        meta: { msg: (e as Error).message },
      });
      return jsonResponse({ error: "turnstile_unreachable" }, 503);
    }
  }

  const res = safeRedirect(rawRedirect);
  if (res.rejected) {
    console.warn("[telegram-oidc-start] redirect_to rejected", {
      reason: res.reason, input: res.originalInput, intent, ref,
    });
    await logEvent({
      kind: "whitelist_reject", source: "start", reason: res.reason || "unknown",
      intent, host: (() => { try { return new URL(rawRedirect || "").hostname; } catch { return null; } })(),
      path: (() => { try { return new URL(rawRedirect || "").pathname; } catch { return null; } })(),
      ip_hash: ipHash, ua_hash: uaHash, meta: { input: res.originalInput },
    });
    return jsonResponse({
      error: "redirect_rejected",
      reason: res.reason || "unknown",
      details: "redirect_to не входит в whitelist доменов",
    }, 400);
  } else {
    console.log("[telegram-oidc-start] redirect_to accepted", {
      host: res.url.hostname, path: res.url.pathname, intent, ref,
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
    company_slug: companySlug,
    project_slug: projectSlug,
    project_id: projectId,
  });
  if (insErr) {
    console.error("[telegram-oidc-start] state_persist_failed", { msg: insErr.message, intent });
    return jsonResponse({ error: "state_persist_failed", details: insErr.message }, 500);
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return jsonResponse({
    ok: true,
    url: `https://oauth.telegram.org/auth?${params.toString()}`,
    state,
  });
  } catch (e) {
    const msg = (e as Error)?.message || "unknown";
    console.error("[telegram-oidc-start] crash", msg);
    try {
      await logEvent({ kind: "start_failed" as any, source: "start", reason: msg.slice(0,200) });
    } catch { /* noop */ }
    return jsonResponse({ error: "start_failed", details: msg }, 500);
  }
});