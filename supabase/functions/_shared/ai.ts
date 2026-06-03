// Tiny helper around Lovable AI Gateway (OpenAI-compatible chat completions)
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export async function aiChat(opts: {
  messages: AIMessage[];
  model?: string;
  json?: boolean;
  temperature?: number;
}) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-2.5-flash",
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "edge-fetch",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("ai_rate_limited");
  if (res.status === 402) throw new Error("ai_credits_exhausted");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ai_gateway_${res.status}: ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return { text, raw: data };
}

export function tryParseJson<T = unknown>(s: string): T | null {
  try {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return JSON.parse(m ? m[0] : s) as T;
  } catch {
    return null;
  }
}