// ProTalk native ask API client + logging helper.
// https://ai.pro-talk.ru/api/v1.0/ask/{bot_token}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROTALK_BASE = "https://api.pro-talk.ru/api/v1.0/ask";

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
  const lastEnd = isArr ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (lastEnd === -1 || lastEnd < start) return null;
  // Strategy A: take from first opening to last matching close.
  const candA = cleaned.slice(start, lastEnd + 1);
  const sanitize = (str: string) => str
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
  const attempt = (str: string): T | null => {
    try { return JSON.parse(str) as T; } catch { /* ignore */ }
    try { return JSON.parse(sanitize(str)) as T; } catch { /* ignore */ }
    return null;
  };
  let res = attempt(candA);
  if (res) return res;
  // Strategy B: balanced brace/bracket scan that respects string literals.
  const open = isArr ? "[" : "{";
  const close = isArr ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  let scanEnd = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) { scanEnd = i; break; } }
  }
  if (scanEnd > start) {
    res = attempt(cleaned.slice(start, scanEnd + 1));
    if (res) return res;
  }
  return null;
}

// Per-element extractor for arrays of objects. When the full JSON is broken
// (e.g. an unescaped quote in one item), salvage as many complete `{...}`
// objects as possible by scanning with string-aware brace matching.
export function extractJsonObjects<T = any>(s: string): T[] {
  if (!s) return [];
  const cleaned = s.replace(/```json\s*/gi, "").replace(/```/g, "");
  const out: T[] = [];
  let i = 0;
  while (i < cleaned.length) {
    if (cleaned[i] !== "{") { i++; continue; }
    const start = i;
    let depth = 0, inStr = false, esc = false;
    for (; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = false; }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    const chunk = cleaned.slice(start, i);
    try { out.push(JSON.parse(chunk) as T); } catch {
      try {
        const fixed = chunk
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
        out.push(JSON.parse(fixed) as T);
      } catch { /* skip broken item */ }
    }
  }
  return out;
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

// -------------------------------------------------------------------------
// Retry classification + helper (Stage BUILD §1.6).
//
// Retryable: AbortError / timeout, network errors, HTTP 429, HTTP 5xx,
// inline `[Server Error: ...]`, empty body, broken JSON, schema-fail.
// NOT retryable: 400/401/402/403, no_project, no_candidate, no_credits,
// bad_body, validation_failed_input — callers should bubble those up.

const NON_RETRY_NEEDLES = [
  "bad_body",
  "no_project",
  "no_candidate",
  "no_credits",
  "no_owner",
  "protalk_payment_required",
  "protalk_401",
  "protalk_403",
  "protalk_400",
  "unauthorized",
  "forbidden",
] as const;

export function isRetryableProtalkError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "").toLowerCase();
  if (!msg) return true; // unknown → assume transient
  if (NON_RETRY_NEEDLES.some((n) => msg.includes(n))) return false;
  // Transient patterns we explicitly retry on.
  if (msg.includes("abort")) return true;
  if (msg.includes("timeout")) return true;
  if (msg.includes("fetch_failed")) return true;
  if (msg.includes("rate_limited")) return true;
  if (msg.includes("server_error")) return true;
  if (msg.includes("empty")) return true;
  if (msg.includes("bad_json")) return true;
  if (msg.includes("schema_invalid")) return true;
  // Generic protalk_5xx
  if (/protalk_5\d{2}/.test(msg)) return true;
  if (/protalk_429/.test(msg)) return true;
  // Default: retry once more rather than fail the job.
  return true;
}

export type RetryOpts = CallOpts & {
  /** Max attempts including the first. Default 3. */
  attempts?: number;
  /** Base backoff ms before attempt 2. Default 1500. Attempt N waits base * 2^(N-2) + jitter. */
  baseDelayMs?: number;
  /** Stable seed for chat_id rotation (e.g. ai_${jobId}_${attemptNumber}). */
  chatIdSeed?: string;
  /** Optional validator. Return ok=false to trigger a retry. */
  validate?: (text: string) => { ok: true } | { ok: false; code: string };
  /** Called once per attempt for observability/logging. */
  onAttempt?: (info: { attempt: number; error?: string }) => void | Promise<void>;
};

export type RetryResult = { text: string; raw: any; attempts: number };

export async function callProTalkWithRetry(opts: RetryOpts): Promise<RetryResult> {
  const max = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseDelayMs ?? 1500;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    const chatId = opts.chatIdSeed
      ? `${opts.chatIdSeed}_a${attempt}`
      : (opts.chatId || buildChatId({}));
    try {
      const r = await callProTalk({ ...opts, chatId });
      const text = r.text || "";
      if (!text.trim()) throw new Error("protalk_empty_response");
      if (opts.validate) {
        const v = opts.validate(text);
        if (!v.ok) throw new Error(`schema_invalid:${v.code}`);
      }
      if (opts.onAttempt) await opts.onAttempt({ attempt });
      return { text, raw: r.raw, attempts: attempt };
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message || e);
      if (opts.onAttempt) await opts.onAttempt({ attempt, error: msg });
      if (!isRetryableProtalkError(e) || attempt >= max) throw e;
      // Exponential backoff + jitter (±25%).
      const delay = base * Math.pow(2, attempt - 1);
      const jitter = delay * (0.75 + Math.random() * 0.5);
      await new Promise((res) => setTimeout(res, Math.round(jitter)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("protalk_retry_exhausted");
}