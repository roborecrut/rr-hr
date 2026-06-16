import { supabase } from "@/integrations/supabase/client";
import { beginAIRestart, endAIRestart } from "./aiReady";

// Lightweight wrapper around supabase.functions.invoke for our AI edge functions.
// Throws on transport/server errors. Returns the parsed JSON body.
async function invoke<T = any>(fn: "ai-chat" | "ai-enhance" | "ai-evaluate" | "ai-generate-onboarding" | "ai-restart" | "ai-company-analyze", body: any): Promise<T> {
  const friendly = (code: string): string => {
    if (code === "ai_empty_response") return "ИИ не вернул ответ. Попробуйте ещё раз.";
    if (code === "no_session" || /auth|jwt|unauthor/i.test(code)) {
      return "Не удалось подтвердить вход. Перезагрузите страницу.";
    }
    if (code === "no_credits" || code === "insufficient_funds") return "Недостаточно RR на балансе. Пополните в разделе «Тариф & Счета».";
    if (code === "rate_limited" || /429/.test(code)) return "Слишком много запросов к ИИ. Подождите 30 секунд и повторите.";
    return code;
  };
  // Ensure a fresh session before invoking — устраняет race при первом вызове
  // edge function сразу после загрузки страницы, который раньше падал как
  // «Не удалось подтвердить вход».
  let accessToken = "";
  try {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token || "";
  } catch { /* ignore */ }
  let { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  // Один авто-ретрай при сетевой/auth ошибке
  if (error) {
    const msg = (error as any)?.message || "";
    if (/Failed to fetch|NetworkError|Invalid JWT|401|auth/i.test(msg)) {
      try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token || "";
      } catch { /* ignore */ }
      const r2 = await supabase.functions.invoke(fn, {
        body,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      data = r2.data; error = r2.error;
    }
  }
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; body may be on `context`
    let serverCode = "";
    let serverDetail = "";
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        serverCode = j?.error || "";
        serverDetail = j?.detail || j?.message || "";
        // eslint-disable-next-line no-console
        console.error(`[aiClient ${fn}] server error`, j);
      }
    } catch { /* ignore */ }
    const msg = friendly(serverCode) || error.message || `invoke_${fn}_failed`;
    throw new Error(serverDetail ? `${msg} (${serverDetail})` : msg);
  }
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error(friendly(String((data as any).error)));
  }
  return data as T;
}

export type ChatKind = "employer" | "candidate" | "vacancy_consultant";

export async function aiChat(opts: {
  kind: ChatKind;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  context?: string;
  project_id?: string;
  candidate_id?: string;
  employer_id?: string;
}): Promise<string> {
  const data = await invoke<{ reply: string }>("ai-chat", opts);
  return data?.reply || "";
}

export async function aiEnhanceSingle(opts: {
  field: string;
  value: string;
  role_name?: string;
  company_name?: string;
  hint?: string;
  template?: string;
}): Promise<string> {
  const data = await invoke<{ value: string }>("ai-enhance", { mode: "single", ...opts });
  return (data?.value ?? "").toString();
}

export async function aiEnhanceAll(opts: {
  mode: "all_vacancy" | "all_company";
  fields: Record<string, any>;
  role_name?: string;
  company_name?: string;
  hint?: string;
  templates?: Record<string, string>;
  /** Up to 5000 chars of parsed-from-file context (raw text from document). */
  file_context?: string;
  /** Existing company record (for shared schedule/motivation/team/system fields). */
  company_context?: Record<string, any>;
}): Promise<Record<string, any>> {
  const data = await invoke<{ fields: Record<string, any> }>("ai-enhance", opts);
  return data?.fields || {};
}

export async function aiEvaluate<T = any>(opts: {
  mode: "resume" | "checklist" | "situations" | "training_block" | "overall_candidate";
  payload: any;
  candidate_id?: string;
  project_id?: string;
}): Promise<T> {
  const data = await invoke<{ result: T }>("ai-evaluate", opts);
  return data?.result as T;
}

export async function aiGenerateOnboarding(opts: {
  project_id?: string;
  role_name: string;
  company_name?: string;
  brief?: string;
  save?: boolean;
}): Promise<any> {
  const data = await invoke<{ ok: boolean; data: any }>("ai-generate-onboarding", opts);
  return data?.data;
}

export async function aiRestart(employer_public_id?: string): Promise<void> {
  beginAIRestart();
  try {
    await invoke("ai-restart", { employer_public_id });
  } finally {
    endAIRestart();
  }
}

export async function aiCompanyAnalyze(opts: {
  company_id?: string;
  employer_public_id?: string;
  file_url?: string;
  raw_text?: string;
}): Promise<{ fields: Record<string, any>; raw: string }> {
  const data = await invoke<{ ok: boolean; fields: Record<string, any>; raw: string }>("ai-company-analyze", opts);
  return { fields: data?.fields || {}, raw: data?.raw || "" };
}