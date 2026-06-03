// Ad-hoc rate limiter backed by public.rate_limits via rl_hit RPC.
// This is NOT a substitute for a real CDN/WAF — just per-IP/state throttling.
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

/**
 * Returns true if the request is within limit, false if it should be rejected.
 * Fail-open on infra error so we don't block real users.
 */
export async function rlHit(key: string, windowSec: number, limit: number): Promise<boolean> {
  const c = admin();
  if (!c) return true;
  try {
    const { data, error } = await c.rpc("rl_hit", {
      _key: key,
      _window_sec: windowSec,
      _limit: limit,
    });
    if (error) {
      console.warn("[rl_hit] error", error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.warn("[rl_hit] exception", (e as Error).message);
    return true;
  }
}