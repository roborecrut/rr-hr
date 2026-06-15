// RR Pro Max — backup AI provider. Same transport as ProTalk (bot_id +
// bot_token in URL path). Credentials are read from Edge Function env at
// call-time and never persisted. If env is missing, returns a safe
// "not_configured" error — frontend bundle has no access to these names.
const PROTALK_BASE = "https://api.pro-talk.ru/api/v1.0/ask";

export type RrCallResult =
  | { ok: true; text: string }
  | { ok: false; safeErrorCode: string; details?: string };

function readCreds(): { botId: number; token: string } | null {
  const id = Number(Deno.env.get("RR_PRO_MAX_BOT_ID") || "0");
  const tok = Deno.env.get("RR_PRO_MAX_API_TOKEN") || "";
  if (!Number.isFinite(id) || id <= 0 || !tok) return null;
  return { botId: id, token: tok };
}

async function send(
  message: string,
  chatId: string,
  socialId: string,
  timeoutMs: number,
): Promise<RrCallResult> {
  const creds = readCreds();
  if (!creds) return { ok: false, safeErrorCode: "fallback_not_configured" };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${PROTALK_BASE}/${creds.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ bot_id: creds.botId, chat_id: chatId, user_social_id: socialId, message }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (res.status === 429) return { ok: false, safeErrorCode: "fallback_provider_unavailable" };
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, safeErrorCode: "fallback_provider_unavailable", details: `status_${res.status}:${t.slice(0,80)}` };
    }
    const data = await res.json().catch(() => null) as any;
    const text: string = (data?.done ?? data?.text ?? data?.message ?? "").toString();
    if (!text) return { ok: false, safeErrorCode: "fallback_empty_response" };
    if (/^\s*\[Server Error:/i.test(text)) {
      return { ok: false, safeErrorCode: "fallback_provider_unavailable" };
    }
    return { ok: true, text };
  } catch (e) {
    clearTimeout(to);
    const msg = (e as Error).message || "";
    if (msg.includes("aborted")) return { ok: false, safeErrorCode: "fallback_timeout" };
    return { ok: false, safeErrorCode: "fallback_provider_unavailable", details: msg.slice(0, 120) };
  }
}

// Two-step protocol: /restart first, then the snapshot prompt. Same provider
// interface as the AiProvider stub; the orchestrator (fallback endpoint)
// awaits restart success before sending the original prompt.
export const RrProMaxProvider = {
  id: "rr_pro_max" as const,
  isConfigured(): boolean { return readCreds() !== null; },
  async restart(chatId: string, socialId: string): Promise<RrCallResult> {
    const r = await send("/restart", chatId, socialId, 30_000);
    if (!r.ok) return { ok: false, safeErrorCode: r.safeErrorCode === "fallback_empty_response" ? "restart_failed" : r.safeErrorCode };
    return r;
  },
  async run(message: string, chatId: string, socialId: string, timeoutMs = 180_000): Promise<RrCallResult> {
    return send(message, chatId, socialId, timeoutMs);
  },
};