// Send a Telegram message via Bot API (and log it).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "env_missing" }, 500);

  // Validate caller is authenticated
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getClaims(authHeader.slice(7));
  if (authErr || !authData?.claims) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null) as null | {
    chat_id: number | string; text: string; parse_mode?: string; candidate_id?: string; employer_id?: string;
  };
  if (!body?.chat_id || !body?.text) return jsonResponse({ error: "bad_body" }, 400);

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: body.chat_id, text: body.text, parse_mode: body.parse_mode ?? "HTML" }),
  });
  const tgJson = await tgRes.json();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  await admin.from("telegram_logs").insert({
    direction: "out",
    chat_id: Number(body.chat_id),
    user_id: authData.claims.sub,
    candidate_id: body.candidate_id ?? null,
    employer_id: body.employer_id ?? null,
    payload: { request: body, response: tgJson },
  });

  if (!tgRes.ok) return jsonResponse({ error: "telegram_send_failed", details: tgJson }, 502);
  return jsonResponse({ ok: true, result: tgJson.result });
});