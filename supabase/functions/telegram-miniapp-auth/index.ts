// Telegram Mini App — verify initData and issue a Supabase session.
// initData is a URL-encoded query string from window.Telegram.WebApp.initData.
//
// startParam encodings (from t.me/<bot>/app?startapp=<value>):
//   emp{empPid}                                 → employer attach/login (intent=employer)
//   emp{empPid}com{companyPid}vac{vacancyPid}   → candidate registering for vacancy (intent=candidate)
//   (empty)                                     → candidate, no project link

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

  let body: { initData?: string; ref?: string } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }
  if (!body.initData) return jsonResponse({ error: "init_data_missing" }, 400);

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
  // start_param comes from t.me/<bot>/app?startapp=<value> deep link
  const startParam = (params.get("start_param") || body.ref || "").trim();

  // ----- Parse startParam -----
  let parsedIntent: "employer" | "candidate" = "candidate";
  let empRef: string | null = null;
  let comRef: string | null = null;
  let vacRef: string | null = null;
  if (startParam) {
    let m = startParam.match(/^emp(\d+)com(\d+)vac(\d+)$/);
    if (m) {
      parsedIntent = "candidate";
      empRef = m[1]; comRef = m[2]; vacRef = m[3];
    } else {
      m = startParam.match(/^emp(\d+)$/);
      if (m) {
        parsedIntent = "employer";
        empRef = m[1];
      }
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Reuse an existing link for this telegram_id regardless of intent — the
  // Mini App opens with the role the user already registered with.
  const { data: anyLink } = await admin.from("telegram_links")
    .select("user_id, intent")
    .eq("telegram_id", tgUser.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const intent = (anyLink?.intent as "employer" | "candidate" | undefined) || parsedIntent;
  const email = `tg_${tgUser.id}_${intent}@rrhr.local`;
  let userId = anyLink?.user_id as string | undefined;
  const isNewUser = !userId;

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
      // grant_employer_bonus trigger gives +500 RR on insert
      await admin.from("employers").insert({
        user_id: userId, contact_name: tgUser.first_name ?? null, contact_tg: tgUser.username ?? null,
      });
    } else if (intent === "candidate") {
      // Candidate registration tied to vacancy (if startParam provided full triple)
      let project_id: string | null = null;
      let referrer_employer_id: string | null = null;
      let role_name: string | null = null;
      if (vacRef) {
        const { data: proj } = await admin.from("projects")
          .select("id, employer_id, role_name")
          .eq("public_id", vacRef)
          .maybeSingle();
        if (proj) {
          project_id = proj.id;
          role_name = proj.role_name ?? null;
          referrer_employer_id = proj.employer_id ?? null;
        }
      }
      await admin.from("candidates").insert({
        user_id: userId,
        project_id,
        referrer_employer_id,
        role_name,
        registered_via: "telegram",
        current_stage: "terms",
      });
    }
  } else if (intent === "employer") {
    // Existing employer linking Telegram → one-time +500 RR
    const { data: emp } = await admin.from("employers")
      .select("id, telegram_bonus_granted")
      .eq("user_id", userId)
      .maybeSingle();
    if (emp && !emp.telegram_bonus_granted) {
      await admin.rpc("grant_telegram_link_bonus", { _employer: emp.id });
    }
  }

  await admin.from("profiles").update({
    telegram_id: tgUser.id,
    telegram_username: tgUser.username ?? null,
    telegram_first_name: tgUser.first_name ?? null,
    telegram_last_name: tgUser.last_name ?? null,
    telegram_photo_url: tgUser.photo_url ?? null,
    avatar_url: tgUser.photo_url ?? null,
  }).eq("id", userId);

  // Ensure role + account_kinds in profiles
  await admin.from("user_roles").upsert(
    { user_id: userId, role: intent },
    { onConflict: "user_id,role" },
  );
  {
    const { data: prof } = await admin.from("profiles").select("account_kinds").eq("id", userId).maybeSingle();
    const kinds = new Set<string>(Array.isArray((prof as any)?.account_kinds) ? (prof as any).account_kinds : []);
    kinds.add(intent);
    await admin.from("profiles").update({
      account_kinds: Array.from(kinds),
      last_signup_intent: intent,
    }).eq("id", userId);
  }

  // Resolve target path
  let target = "/main";
  if (intent === "employer") {
    const { data: emp } = await admin.from("employers").select("public_id").eq("user_id", userId).maybeSingle();
    target = emp?.public_id ? `/employer${emp.public_id}/profile` : "/employer/profile";
  } else {
    const { data: cand } = await admin.from("candidates").select("public_id").eq("user_id", userId).order("created_at",{ascending:false}).limit(1).maybeSingle();
    target = cand?.public_id ? `/candidate${cand.public_id}/profile` : "/main";
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) return jsonResponse({ error: "link_failed", details: linkErr.message }, 500);

  return jsonResponse({
    ok: true, user_id: userId, email, intent, is_new_user: isNewUser,
    token_hash: linkData.properties?.hashed_token,
    verification_type: "magiclink",
    target,
  });
});