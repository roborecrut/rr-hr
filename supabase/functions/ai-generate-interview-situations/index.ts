// Generate 3 role-play situations for a vacancy.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: proj } = await admin.from("projects").select("role_name,vacancy_text,company_id").eq("id", body.project_id).maybeSingle();
  if (!proj) return jsonResponse({ error: "no_project" }, 404);
  let companyName = "";
  if ((proj as any).company_id) {
    const { data: co } = await admin.from("companies").select("name").eq("id", (proj as any).company_id).maybeSingle();
    companyName = (co as any)?.name || "";
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  const SCHEMA = `JSON-массив РОВНО из 3 элементов: {"id":"s1"|"s2"|"s3","title":string,"brief":string,"criteria":string}
- title — короткая тема (3-6 слов)
- brief — описание ситуации, которую увидит кандидат (3-6 предложений, прямая речь от лица контрагента/клиента)
- criteria — критерии хорошего ответа (3-6 пунктов через ";"), используются для оценки.
Без markdown.`;

  const msg = `Подготовь 3 ролевые ситуации для оценки кандидата на вакансию.
Должность: ${(proj as any).role_name || ""}
Компания: ${companyName}
Контекст: ${(proj as any).vacancy_text || ""}
Ситуации должны быть реалистичными и типовыми для этой должности.
Верни СТРОГО ${SCHEMA}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 120_000 });
    const arr = tryParseJson<any[]>(r.text);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("bad_json");
    const situations = arr.slice(0, 3).map((s, i) => ({
      id: String(s.id || `s${i+1}`),
      title: String(s.title || "").slice(0, 200),
      brief: String(s.brief || "").slice(0, 1500),
      criteria: String(s.criteria || "").slice(0, 1000),
    }));

    const { data: existing } = await admin.from("interview_blocks").select("id").eq("project_id", body.project_id).eq("kind","situations").maybeSingle();
    const payload = { situations };
    if (existing?.id) {
      await admin.from("interview_blocks").update({ payload, ai_generated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await admin.from("interview_blocks").insert({ project_id: body.project_id, kind: "situations", payload, ai_generated_at: new Date().toISOString() });
    }
    await logToDb({ user_message: msg, bot_reply: r.text, channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:situations", server_name: "ai-generate-interview-situations" });
    return jsonResponse({ ok: true, situations });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:situations", server_name: "ai-generate-interview-situations", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});