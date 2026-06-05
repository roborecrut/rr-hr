// ProTalk native ask API client + logging helper.
// https://ai.pro-talk.ru/api/v1.0/ask/{bot_token}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROTALK_BASE = "https://ai.pro-talk.ru/api/v1.0/ask";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CallOpts = {
  // Either a flat message or an array of role-tagged messages (will be joined).
  message?: string;
  messages?: ChatMessage[];
  chatId?: string;
  socialId?: string;
  timeoutMs?: number;
};

function botToken(): string {
  const k = Deno.env.get("PRO_TALK_BOT_TOKEN");
  if (!k) throw new Error("PRO_TALK_BOT_TOKEN is not configured");
  return k;
}
function botId(): number {
  const raw = Deno.env.get("PRO_TALK_BOT_ID") || "0";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("PRO_TALK_BOT_ID is invalid");
  return n;
}

function flattenMessages(msgs: ChatMessage[]): string {
  const labelMap: Record<ChatMessage["role"], string> = {
    system: "Система",
    user: "Пользователь",
    assistant: "Ассистент",
  };
  return msgs.map((m) => `${labelMap[m.role] ?? m.role}:\n${m.content}`).join("\n\n");
}

// Call ProTalk's native ask endpoint. Returns the assistant text from the `done` field.
export async function callProTalk(opts: CallOpts): Promise<{ text: string; raw: any }> {
  const message = opts.message ?? (opts.messages ? flattenMessages(opts.messages) : "");
  if (!message) throw new Error("protalk_empty_message");

  const chat_id = opts.chatId || buildChatId({});
  const user_social_id = opts.socialId || buildSocialId({});

  const body = {
    bot_id: botId(),
    chat_id,
    user_social_id,
    message,
  };

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 110_000);
  let res: Response;
  try {
    res = await fetch(`${PROTALK_BASE}/${botToken()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(to);
    throw new Error(`protalk_fetch_failed: ${(e as Error).message}`);
  }
  clearTimeout(to);

  if (res.status === 429) throw new Error("protalk_rate_limited");
  if (res.status === 402) throw new Error("protalk_payment_required");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`protalk_${res.status}: ${t.slice(0, 400)}`);
  }

  const data = await res.json().catch(async () => ({ done: await res.text().catch(() => "") })) as any;
  const text: string = (data?.done ?? data?.text ?? data?.message ?? "").toString();
  if (data?.error) throw new Error(`protalk_error: ${String(data.error).slice(0, 300)}`);
  // Detect ProTalk's "soft" server errors embedded in the text body.
  if (/^\s*\[Server Error:/i.test(text)) throw new Error(`protalk_server_error: ${text.slice(0, 300)}`);
  return { text, raw: data };
}

// Robust JSON extractor for LLM outputs: strips markdown fences, finds the first
// {...} or [...] block, retries after sanitizing trailing commas/control chars.
export function tryParseJson<T = unknown>(s: string): T | null {
  if (!s) return null;
  let cleaned = s.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const start = (firstObj === -1) ? firstArr : (firstArr === -1 ? firstObj : Math.min(firstObj, firstArr));
  if (start === -1) return null;
  const isArr = cleaned[start] === "[";
  const end = isArr ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (end === -1 || end < start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try { return JSON.parse(cleaned) as T; } catch { /* try sanitize */ }
  try {
    const fixed = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, " ");
    return JSON.parse(fixed) as T;
  } catch { return null; }
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