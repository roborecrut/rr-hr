// Generate "important resume criteria" markdown for a vacancy.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, buildChatId, buildSocialId, getAdminClient, getUserFromAuthHeader, logToDb } from "../_shared/protalk.ts";
import { requireEmployerForProject } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string; source?: string; wishes?: string };
  if (!body?.project_id) return jsonResponse({ error: "bad_body" }, 400);

  const guard = await requireEmployerForProject(req, body.project_id);
  if (guard instanceof Response) return guard;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: proj } = await admin.from("projects").select("role_name,vacancy_text,company_text,salary_terms,schedule_terms,custom_wiki,company_id").eq("id", body.project_id).maybeSingle();
  if (!proj) return jsonResponse({ error: "no_project" }, 404);
  let companyName = "";
  if ((proj as any).company_id) {
    const { data: co } = await admin.from("companies").select("name,industry,description_text").eq("id", (proj as any).company_id).maybeSingle();
    companyName = (co as any)?.name || "";
  }

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  const wishes = (body.wishes || "").trim().slice(0, 1000);
  const msg = `Ты — HR-эксперт. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь.

Сформируй краткий список (markdown) ВАЖНЫХ КРИТЕРИЕВ для скрининга резюме под вакансию.
${wishes ? `\nПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (учти обязательно):\n${wishes}\n` : ""}
Вакансия: ${(proj as any).role_name || ""}
Компания: ${companyName}
Описание вакансии:
${(proj as any).vacancy_text || ""}

Дополнительный контекст от работодателя:
${body.source || ""}

Верни markdown с разделами:
## Обязательные требования
- ...
## Желательные требования
- ...
## Красные флаги
- ...
## На что обратить особое внимание
- ...

5-10 пунктов в каждом разделе, кратко и по делу. Без лишних вступлений.`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 120_000 });
    const md = (r.text || "").trim();

    const { data: existing } = await admin.from("interview_blocks").select("id").eq("project_id", body.project_id).eq("kind","resume").maybeSingle();
    const payload = { criteria_md: md };
    if (existing?.id) {
      await admin.from("interview_blocks").update({ payload, ai_generated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await admin.from("interview_blocks").insert({ project_id: body.project_id, kind: "resume", payload, ai_generated_at: new Date().toISOString() });
    }
    await logToDb({ user_message: msg, bot_reply: md, channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:resume-criteria", server_name: "ai-generate-interview-resume-criteria" });
    return jsonResponse({ ok: true, criteria_md: md });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg, bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:resume-criteria", server_name: "ai-generate-interview-resume-criteria", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});