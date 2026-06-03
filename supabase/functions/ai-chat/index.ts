// Unified AI chat assistant: employer-assist | candidate-assist | vacancy-consultant-chat
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { aiChat, type AIMessage } from "../_shared/ai.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SYSTEMS: Record<string, string> = {
  employer:
    "Ты — ИИ-помощник работодателя HR-платформы RR. Помогаешь оформлять вакансии, обучение, чек-листы, отвечать на вопросы кандидатов. Отвечай на русском, кратко и по делу.",
  candidate:
    "Ты — ИИ-наставник кандидата на платформе RR. Помогаешь пройти отбор, обучение и собеседование. Отвечай дружелюбно, на русском.",
  vacancy_consultant:
    "Ты — консультант по вакансии. Отвечаешь будущим кандидатам на вопросы об условиях, графике, обязанностях. Отвечай только по предоставленному контексту вакансии.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    kind: "employer" | "candidate" | "vacancy_consultant";
    messages: AIMessage[];
    context?: string;
    project_id?: string;
    candidate_id?: string;
    employer_id?: string;
  };
  if (!body?.kind || !Array.isArray(body.messages)) return jsonResponse({ error: "bad_body" }, 400);

  const system = SYSTEMS[body.kind] ?? SYSTEMS.employer;
  const ctxMsg: AIMessage[] = body.context ? [{ role: "system", content: `Контекст: ${body.context}` }] : [];

  try {
    const { text, raw } = await aiChat({
      messages: [{ role: "system", content: system }, ...ctxMsg, ...body.messages],
    });

    // best-effort log (don't fail the request if logging fails)
    try {
      const url = Deno.env.get("SUPABASE_URL");
      const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && svc) {
        const admin = createClient(url, svc);
        await admin.from("ai_runs").insert({
          endpoint: `ai-chat/${body.kind}`,
          model: raw?.model ?? "google/gemini-2.5-flash",
          input: { messages: body.messages, context: body.context },
          output: { text },
          tokens_in: raw?.usage?.prompt_tokens ?? null,
          tokens_out: raw?.usage?.completion_tokens ?? null,
          candidate_id: body.candidate_id ?? null,
          project_id: body.project_id ?? null,
          employer_id: body.employer_id ?? null,
        });
      }
    } catch (_) { /* ignore */ }

    return jsonResponse({ reply: text });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});