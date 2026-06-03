// Telegram OIDC telemetry helper — writes to public.telegram_events via service role.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let cached: SupabaseClient | null = null;
function admin(): SupabaseClient | null {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface TgEvent {
  kind:
    | "whitelist_reject"
    | "route_decision"
    | "next_reject"
    | "rate_limited"
    | "turnstile_fail";
  source?: "start" | "callback" | "done";
  reason?: string | null;
  intent?: string | null;
  host?: string | null;
  path?: string | null;
  next_path?: string | null;
  vacancy_count?: number | null;
  ip_hash?: string | null;
  ua_hash?: string | null;
  meta?: Record<string, unknown>;
}

export async function logEvent(evt: TgEvent): Promise<void> {
  // Always log to console for live debugging.
  console.log("[tg-event]", JSON.stringify(evt));
  const client = admin();
  if (!client) return;
  try {
    await client.from("telegram_events").insert({
      kind: evt.kind,
      source: evt.source ?? null,
      reason: evt.reason ?? null,
      intent: evt.intent ?? null,
      host: evt.host ?? null,
      path: evt.path ?? null,
      next_path: evt.next_path ?? null,
      vacancy_count: evt.vacancy_count ?? null,
      ip_hash: evt.ip_hash ?? null,
      ua_hash: evt.ua_hash ?? null,
      meta: evt.meta ?? {},
    });
  } catch (e) {
    console.warn("[tg-event] insert failed", (e as Error).message);
  }
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "0.0.0.0";
}