// Logs a client-side or edge-function error into public.client_errors.
// Public endpoint (verify_jwt=false), but rate-limited by IP via rl_hit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { rlHit } from "../_shared/rateLimit.ts";
import { clientIp, sha256Hex } from "../_shared/telemetry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);
  const ok = await rlHit(`log-client-error:${ipHash}`, 60, 30);
  if (!ok) return jsonResponse({ error: "rate_limited" }, 429);

  let body: { source?: string; message?: string; meta?: unknown } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_json" }, 400); }

  const source = String(body.source || "unknown").slice(0, 100);
  const message = String(body.message || "").slice(0, 2000);
  if (!message) return jsonResponse({ error: "no_message" }, 400);
  const meta = (body.meta && typeof body.meta === "object") ? body.meta : {};

  // Try to attach user_id if Authorization header is a valid Supabase JWT
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  if (jwt) {
    try {
      const { data } = await admin.auth.getUser(jwt);
      if (data?.user?.id) userId = data.user.id;
    } catch { /* ignore */ }
  }

  const { error } = await admin.from("client_errors").insert({
    source, message, user_id: userId, meta: { ...meta, ip_hash: ipHash },
  });
  if (error) return jsonResponse({ error: "insert_failed", details: error.message }, 500);

  return jsonResponse({ ok: true });
});