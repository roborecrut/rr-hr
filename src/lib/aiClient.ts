import { supabase } from "@/integrations/supabase/client";

// Lightweight wrapper around supabase.functions.invoke for our AI edge functions.
// Throws on transport/server errors. Returns the parsed JSON body.
async function invoke<T = any>(fn: "ai-chat" | "ai-enhance" | "ai-evaluate" | "ai-generate-onboarding" | "ai-restart" | "ai-company-analyze", body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || `invoke_${fn}_failed`);
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error(String((data as any).error));
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
}): Promise<Record<string, any>> {
  const data = await invoke<{ fields: Record<string, any> }>("ai-enhance", opts);
  return data?.fields || {};
}

export async function aiEvaluate<T = any>(opts: {
  mode: "resume" | "checklist" | "situations" | "training_block";
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
  await invoke("ai-restart", { employer_public_id });
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