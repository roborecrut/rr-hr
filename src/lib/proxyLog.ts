/**
 * Глобальный перехват `window.fetch` для запросов к нашему Supabase-прокси
 * (`SUPABASE_PROXY_ORIGIN`). Каждый запрос запоминается в кольцевом буфере
 * вместе с эквивалентной curl-командой и телом ответа (первые ~4 КБ), чтобы
 * при нажатии Ctrl+[ можно было открыть журнал и посмотреть, что реально
 * летело на прокси.
 *
 * Модуль импортируется из `main.tsx` до создания supabase-клиента, чтобы
 * гарантированно перехватить самый первый запрос.
 */
import { SUPABASE_PROXY_ORIGIN } from "@/config";

export type ProxyLogEntry = {
  id: number;
  ts: number;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  curl: string;
  requestBody: string | null;
  responseBody: string | null;
  responseHeaders: Record<string, string>;
  ok: boolean | null;
  error?: string;
};

const MAX_ENTRIES = 200;
const MAX_BODY_CHARS = 4000;

const buffer: ProxyLogEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function notify() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function subscribeProxyLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getProxyLog(): ProxyLogEntry[] {
  return buffer.slice().reverse(); // newest first
}

export function clearProxyLog() {
  buffer.length = 0;
  notify();
}

function truncate(s: string, max = MAX_BODY_CHARS): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [${s.length - max} bytes truncated]`;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function headersToObject(h: HeadersInit | undefined | Headers): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) {
    h.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[String(k)] = String(v);
    return out;
  }
  for (const [k, v] of Object.entries(h as Record<string, string>)) out[k] = String(v);
  return out;
}

function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | null,
): string {
  const parts: string[] = [`curl -X ${method.toUpperCase()}`, shellEscape(url)];
  for (const [k, v] of Object.entries(headers)) {
    // Не показываем в UI полный anon-ключ (он публичный, но шумит) — заменяем на плейсхолдер.
    let val = v;
    if (/^authorization$/i.test(k) && /^Bearer\s+/i.test(v)) {
      val = v.replace(/^Bearer\s+.+$/i, "Bearer <token>");
    }
    parts.push(`-H ${shellEscape(`${k}: ${val}`)}`);
  }
  if (body != null && body !== "") {
    parts.push(`--data-raw ${shellEscape(truncate(body, 8000))}`);
  }
  return parts.join(" \\\n  ");
}

async function readRequestBody(init: RequestInit | undefined): Promise<string | null> {
  if (!init || init.body == null) return null;
  const b: any = init.body;
  try {
    if (typeof b === "string") return b;
    if (b instanceof URLSearchParams) return b.toString();
    if (b instanceof Blob) return `[Blob ${b.size}B ${b.type || ""}]`;
    if (b instanceof FormData) {
      const rows: string[] = [];
      b.forEach((v, k) => {
        rows.push(v instanceof File ? `${k}=@${v.name} (${v.size}B)` : `${k}=${String(v)}`);
      });
      return `[FormData]\n${rows.join("\n")}`;
    }
    if (b instanceof ArrayBuffer) return `[ArrayBuffer ${b.byteLength}B]`;
    return String(b);
  } catch {
    return "[unreadable body]";
  }
}

let installed = false;
export function installProxyLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = "";
    let method = (init?.method || "GET").toUpperCase();
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else { url = input.url; method = (init?.method || input.method || "GET").toUpperCase(); }

    const isProxy = url.startsWith(SUPABASE_PROXY_ORIGIN);
    if (!isProxy) return origFetch(input as any, init);

    const headers = headersToObject(init?.headers || (input as any)?.headers);
    const reqBody = await readRequestBody(init);
    const started = performance.now();
    const entry: ProxyLogEntry = {
      id: nextId++,
      ts: Date.now(),
      method,
      url,
      status: null,
      durationMs: null,
      curl: buildCurl(method, url, headers, reqBody),
      requestBody: reqBody ? truncate(reqBody) : null,
      responseBody: null,
      responseHeaders: {},
      ok: null,
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
    notify();

    try {
      const resp = await origFetch(input as any, init);
      entry.status = resp.status;
      entry.ok = resp.ok;
      entry.durationMs = Math.round(performance.now() - started);
      resp.headers.forEach((v, k) => { entry.responseHeaders[k] = v; });
      // Клонируем и читаем текст — не мешая потребителю.
      try {
        const clone = resp.clone();
        const text = await clone.text();
        entry.responseBody = truncate(text);
      } catch {
        entry.responseBody = "[binary or unreadable response]";
      }
      notify();
      return resp;
    } catch (err) {
      entry.error = (err as Error)?.message || String(err);
      entry.durationMs = Math.round(performance.now() - started);
      notify();
      throw err;
    }
  };
}