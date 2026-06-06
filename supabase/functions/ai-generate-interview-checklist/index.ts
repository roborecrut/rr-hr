// Generate 20-question checklist (10 choice + 10 text) for a vacancy.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: proj } = await admin.from("projects").select("role_name,vacancy_text,company_text,custom_wiki,company_id").eq("id", body.project_id).maybeSingle();
  if (!proj) return jsonResponse({ error: "no_project" }, 404);
  let companyName = "", productsText = "";
  if ((proj as any).company_id) {
    const { data: co } = await admin.from("companies").select("name,description_text,products_text").eq("id", (proj as any).company_id).maybeSingle();
    companyName = (co as any)?.name || ""; productsText = (co as any)?.products_text || "";
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  const SCHEMA = `JSON-массив РОВНО из 20 элементов. Каждый: {"id":string,"kind":"choice"|"text","question":string,"options":[string,string,string,string]|null,"correct":string|null,"expected_answer":string|null,"explanation":string}
- Первые 10 — kind:"choice", options=4 строки (тексты), correct=точный текст правильного.
- Последние 10 — kind:"text", options=null, correct=null, expected_answer=эталонный ответ 2-4 предложения.
- id="q1".."q20". Без markdown, без обёрток.`;

  const msg = `Составь чек-лист из 20 проверочных вопросов для собеседования на вакансию.
Должность: ${(proj as any).role_name || ""}
Компания: ${companyName}
Описание вакансии: ${(proj as any).vacancy_text || ""}
Продукты: ${productsText}
Вопросы должны проверять профессиональные знания и реальный опыт по должности.
Верни СТРОГО ${SCHEMA}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 180_000 });
    const arr = tryParseJson<any[]>(r.text);
    if (!Array.isArray(arr) || arr.length < 5) throw new Error("bad_json");

    const questions = arr.slice(0, 20).map((q, i) => {
      const kind = q.kind === "text" ? "text" : "choice";
      const opts = Array.isArray(q.options) ? q.options.map((o: any) => typeof o === "string" ? o : String(o?.text || "")) : null;
      return {
        id: String(q.id || `q${i+1}`),
        kind,
        question: String(q.question || "").slice(0, 800),
        options: kind === "choice" ? (opts || []).slice(0, 4) : null,
        correct: kind === "choice" ? String(q.correct || (opts?.[0] || "")).slice(0, 500) : null,
        expected_answer: kind === "text" ? String(q.expected_answer || "").slice(0, 1500) : null,
        explanation: q.explanation ? String(q.explanation).slice(0, 400) : "",
      };
    });

    const { data: existing } = await admin.from("interview_blocks").select("id").eq("project_id", body.project_id).eq("kind","checklist").maybeSingle();
    const payload = { questions };
    if (existing?.id) {
      await admin.from("interview_blocks").update({ payload, ai_generated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await admin.from("interview_blocks").insert({ project_id: body.project_id, kind: "checklist", payload, ai_generated_at: new Date().toISOString() });
    }
    await logToDb({ user_message: msg, bot_reply: r.text, channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:checklist", server_name: "ai-generate-interview-checklist" });
    return jsonResponse({ ok: true, count: questions.length });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:checklist", server_name: "ai-generate-interview-checklist", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});