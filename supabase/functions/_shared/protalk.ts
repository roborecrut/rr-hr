// ProTalk OpenAI-compatible client + logging helper.
// https://ai.pro-talk.ru/v1/chat/completions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROTALK_URL = "https://ai.pro-talk.ru/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CallOpts = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  json?: boolean; // hint: ask the model to return strict JSON
};

export function getModel(): string {
  return Deno.env.get("PROTALK_MODEL")?.trim() || "test_chat_2";
}

function apiKey(): string {
  const k = Deno.env.get("PRO_TALK_API_KEY");
  if (!k) throw new Error("PRO_TALK_API_KEY is not configured");
  return k;
}

// Stream from ProTalk OpenAI-compatible endpoint and aggregate to a full text.
// We use stream=true upstream and accumulate; this keeps the edge function
// interface simple (returns final text) while honoring the streaming choice.
export async function callProTalk(opts: CallOpts): Promise<{ text: string; raw: any }> {
  const body: Record<string, unknown> = {
    model: opts.model || getModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    stream: true,
  };

  const res = await fetch(PROTALK_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("protalk_rate_limited");
  if (res.status === 402) throw new Error("protalk_payment_required");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`protalk_${res.status}: ${t.slice(0, 400)}`);
  }

  // If server didn't actually stream, try JSON fallback
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("event-stream")) {
    const data = await res.json().catch(() => null) as any;
    const text = data?.choices?.[0]?.message?.content ?? "";
    return { text, raw: data };
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let out = "";
  let usage: any = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line || !line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content
          ?? j?.choices?.[0]?.message?.content
          ?? "";
        if (delta) out += delta;
        if (j?.usage) usage = j.usage;
      } catch { /* ignore non-JSON chunks */ }
    }
  }
  return { text: out, raw: { usage } };
}

export function tryParseJson<T = unknown>(s: string): T | null {
  try {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return JSON.parse(m ? m[0] : s) as T;
  } catch {
    return null;
  }
}

// chat_id rules:
// - if telegram_id present → `tb{tg_id}_{bot_id}`
// - else if auth user → `u_{uid}_{bot_id}`
// - else random `ask{ts}_{rand}`
export function buildChatId(opts: {
  telegramId?: number | string;
  userId?: string;
  botId?: string;
}): string {
  const bot = opts.botId || Deno.env.get("PRO_TALK_BOT_ID") || "0";
  if (opts.telegramId) return `tb${opts.telegramId}_${bot}`;
  if (opts.userId) return `u_${opts.userId}_${bot}`;
  return `ask${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSocialId(info?: {
  telegram_id?: number | string;
  user_id?: string;
  employer_public_id?: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  if (info?.telegram_id) {
    const name = [info.first_name || "", info.last_name || ""].filter(Boolean).join(" ") || "Unknown";
    const u = info.username ? `(@${info.username})` : "(@unknown)";
    return `from_user_id:${info.telegram_id} ${name} ${u} message_id:${Date.now()}`;
  }
  if (info?.employer_public_id) return `from_user_id:${info.employer_public_id} message_id:${Date.now()}`;
  if (info?.user_id) return `from_user_id:${info.user_id} message_id:${Date.now()}`;
  return `from_user_id:anon message_id:${Date.now()}`;
}

export type LogPayload = {
  user_message: string;
  bot_reply: string;
  channel_id: string;
  user_social_id: string;
  channel_name: string;     // e.g. "ai-chat:employer"
  server_name: string;      // edge function name
  function_call_params?: string;
  function_error?: string;
  tokens_in_source?: number | null;
  tokens_out_source?: number | null;
  tokens_total?: number | null;
};

export function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return null;
  return createClient(url, svc);
}

export async function getUserFromAuthHeader(authHeader: string | null): Promise<{ id: string } | null> {
  if (!authHeader) return null;
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data } = await admin.auth.getUser(token);
    return data?.user ? { id: data.user.id } : null;
  } catch { return null; }
}

export async function logToDb(p: LogPayload): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.from("logs").insert({
      user_message: p.user_message,
      bot_reply: p.bot_reply,
      channel_id: p.channel_id,
      user_social_id: p.user_social_id,
      channel_name: p.channel_name,
      bot_id: Deno.env.get("PRO_TALK_BOT_ID") || null,
      llm: "protalk",
      server_name: p.server_name,
      function_call_params: p.function_call_params || null,
      function_error: p.function_error || null,
      tokens_in_source: p.tokens_in_source ?? null,
      tokens_out_source: p.tokens_out_source ?? null,
      tokens_total: p.tokens_total ?? null,
    });
  } catch (e) {
    console.error("logToDb failed:", e);
  }
}