// Telegram OIDC — callback. Exchanges code for id_token, verifies via JWKS,
// upserts user, applies referral bonus, issues Supabase magiclink, redirects to /auth/telegram/done.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const TOKEN_URL = "https://oauth.telegram.org/token";
const JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let jwksCache: { fetched: number; keys: any[] } | null = null;
async function getJwks(): Promise<any[]> {
  if (jwksCache && Date.now() - jwksCache.fetched < 60 * 60 * 1000) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("jwks_fetch_failed");
  const j = await r.json();
  jwksCache = { fetched: Date.now(), keys: j.keys || [] };
  return jwksCache.keys;
}

async function verifyIdToken(idToken: string): Promise<Record<string, any>> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("bad_jwt_format");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const sig = b64urlToBytes(s);

  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === header.kid) || keys[0];
  if (!jwk) throw new Error("no_jwk");

  const alg = header.alg || "RS256";
  const algo = alg === "RS256"
    ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : alg === "ES256"
      ? { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" }
      : null;
  if (!algo) throw new Error("unsupported_alg:" + alg);

  const key = await crypto.subtle.importKey("jwk", jwk, algo as any, false, ["verify"]);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const verifyAlgo: any = alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" };
  const ok = await crypto.subtle.verify(verifyAlgo, key, sig, data);
  if (!ok) throw new Error("bad_signature");

  if (payload.exp && Date.now() / 1000 > payload.exp + 30) throw new Error("token_expired");
  return payload;
}

function htmlRedirect(url: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Redirecting…</title>
<meta http-equiv="refresh" content="0;url=${url}">
<script>location.replace(${JSON.stringify(url)})</script>
<p>Перенаправляем…</p>`,
    { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const CLIENT_ID = Deno.env.get("TELEGRAM_OIDC_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("TELEGRAM_OIDC_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!CLIENT_ID || !CLIENT_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response("env_missing", { status: 500, headers: corsHeaders });
  }

  const u = new URL(req.url);
  const code = u.searchParams.get("code") || "";
  const state = u.searchParams.get("state") || "";
  const oauthErr = u.searchParams.get("error");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const fallbackDone = (base: string, qs: string) =>
    htmlRedirect(`${base.replace(/\/+$/, "")}/auth/telegram/done?${qs}`);

  if (oauthErr) return fallbackDone("https://hr-rr.online", `error=${encodeURIComponent(oauthErr)}`);
  if (!code || !state) return fallbackDone("https://hr-rr.online", "error=missing_code_or_state");

  // Load state
  const { data: st } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st) return fallbackDone("https://hr-rr.online", "error=state_expired");

  // TTL 15 min
  if (Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) {
    await admin.from("oauth_states").delete().eq("state", state);
    return fallbackDone(st.redirect_to || "https://hr-rr.online", "error=state_expired");
  }

  const redirectBase = String(st.redirect_to || "https://hr-rr.online").replace(/\/+$/, "");
  // Must match the redirect_uri used in /auth (whitelisted in BotFather).
  const redirectUri = `${SUPABASE_URL}/functions/v1/telegram-oidc-callback`;

  // Exchange code for id_token
  let tokenJson: any;
  try {
    const tokenForm = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: st.code_verifier,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
    });
    const tr = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenForm.toString(),
    });
    tokenJson = await tr.json();
    if (!tr.ok || !tokenJson.id_token) {
      return fallbackDone(redirectBase, `error=${encodeURIComponent("token_exchange_failed: " + JSON.stringify(tokenJson))}`);
    }
  } catch (e: any) {
    return fallbackDone(redirectBase, `error=${encodeURIComponent("token_request_failed: " + e.message)}`);
  }

  // Verify id_token
  let claims: Record<string, any>;
  try {
    claims = await verifyIdToken(tokenJson.id_token);
  } catch (e: any) {
    return fallbackDone(redirectBase, `error=${encodeURIComponent("id_token_invalid: " + e.message)}`);
  }

  const tgId = Number(claims.sub);
  if (!tgId) return fallbackDone(redirectBase, "error=no_sub");
  const username = (claims.preferred_username as string) || null;
  const fullName = (claims.name as string) || "";
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ") || null;
  const photoUrl = (claims.picture as string) || null;

  // Cleanup state
  await admin.from("oauth_states").delete().eq("state", state);

  const intent = st.intent as "employer" | "candidate";
  const refCode = st.ref as string | null;

  // Lookup existing link
  const { data: existingLink } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_id", tgId)
    .eq("intent", intent)
    .maybeSingle();

  let userId = existingLink?.user_id as string | undefined;
  const email = `tg_${tgId}_${intent}@rrhr.local`;

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        intent,
        registered_via: "telegram",
        telegram_id: String(tgId),
        telegram_username: username,
        display_name: fullName || `tg_${tgId}`,
        avatar_url: photoUrl,
        name: firstName || null,
      },
    });
    if (createErr) return fallbackDone(redirectBase, `error=${encodeURIComponent("create_user_failed: " + createErr.message)}`);
    userId = created.user!.id;

    await admin.from("telegram_links").insert({
      user_id: userId,
      telegram_id: tgId,
      telegram_username: username,
      first_name: firstName || null,
      last_name: lastName,
      photo_url: photoUrl,
      auth_date: new Date().toISOString(),
      source: "oidc",
      intent,
    });

    if (intent === "employer") {
      await admin.from("employers").insert({
        user_id: userId,
        contact_name: firstName || null,
        contact_tg: username,
      });
    }

    if (refCode && intent === "employer") {
      await admin.rpc("apply_referral_bonus", { _referrer_public_id: refCode, _new_user: userId });
    }
  }

  // Sync latest Telegram fields
  await admin.from("profiles").update({
    telegram_id: tgId,
    telegram_username: username,
    telegram_first_name: firstName || null,
    telegram_last_name: lastName,
    telegram_photo_url: photoUrl,
    avatar_url: photoUrl,
  }).eq("id", userId);

  // Issue magiclink
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) return fallbackDone(redirectBase, `error=${encodeURIComponent("magiclink_failed: " + linkErr.message)}`);

  const tokenHash = linkData.properties?.hashed_token;
  const qs = new URLSearchParams({
    token_hash: String(tokenHash || ""),
    email,
    intent,
  }).toString();

  return htmlRedirect(`${redirectBase}/auth/telegram/done#${qs}`);
});