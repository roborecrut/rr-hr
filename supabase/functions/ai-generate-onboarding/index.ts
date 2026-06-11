// Generates a full onboarding pack via ProTalk and saves it to projects + related tables.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk, tryParseJson, getAdminClient, buildChatId, buildSocialId, getUserFromAuthHeader, logToDb,
} from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    project_id?: string;
    role_name: string;
    company_name?: string;
    brief?: string;
    save?: boolean;
  };
  if (!body?.role_name) return jsonResponse({ error: "role_name_required" }, 400);

  const system =
    "Ты — методолог HR. Пиши строго на русском языке. Избегай англицизмов, кроме общеупотребительных профессиональных терминов и тех, что явно указал пользователь. " +
    "По роли и описанию компании сгенерируй полный пакет онбординга. " +
    "Верни ТОЛЬКО JSON формата: " +
    `{
      "vacancy_text": string,
      "motivation_text": string,
      "onboarding_text": string,
      "training_prof_text": string,
      "training_product_text": string,
      "training_system_text": string,
      "checklist": [{"question": string, "type": "select"|"text", "options": string[], "correct_answer": string, "explanation": string}],
      "roleplay": [{"question": string, "options": [], "correct_answer": "", "explanation": string}],
      "training_blocks": [
        {"title": string, "description": string, "lessons":[
          {"title": string, "content": string, "quiz": {"question": string, "options": string[], "correct_answer": string, "explanation": string}}
        ]}
      ]
    }`;

  const user = await getUserFromAuthHeader(req.headers.get("Authorization"));
  const chatId = buildChatId({ userId: user?.id });
  const socialId = buildSocialId({ user_id: user?.id });

  try {
    const { text, raw } = await callProTalk({
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Роль: ${body.role_name}\nКомпания: ${body.company_name ?? "—"}\nБриф:\n${body.brief ?? ""}` },
      ],
      chatId, socialId,
    });
    const data = tryParseJson<any>(text);
    if (!data) return jsonResponse({ error: "ai_returned_non_json", raw: text }, 502);

    if (body.save && body.project_id) {
      const admin = getAdminClient();
      if (admin) {
        await admin.from("projects").update({
          vacancy_text: data.vacancy_text,
          motivation_text: data.motivation_text,
          onboarding_text: data.onboarding_text,
          training_prof_text: data.training_prof_text,
          training_product_text: data.training_product_text,
          training_system_text: data.training_system_text,
          created_tasks: true,
        }).eq("id", body.project_id);

        // Replace checklist & roleplay & training
        await admin.from("project_questions").delete().eq("project_id", body.project_id);
        const checklistRows = (data.checklist ?? []).map((q: any, i: number) => ({
          project_id: body.project_id, category: "checklist_prof",
          order_index: i, type: q.type ?? "select",
          question: q.question, options: q.options ?? [],
          correct_answer: q.correct_answer, explanation: q.explanation,
        }));
        const roleplayRows = (data.roleplay ?? []).map((q: any, i: number) => ({
          project_id: body.project_id, category: "roleplay",
          order_index: i, type: "text",
          question: q.question, options: [],
          correct_answer: q.correct_answer ?? "", explanation: q.explanation,
        }));
        if (checklistRows.length) await admin.from("project_questions").insert(checklistRows);
        if (roleplayRows.length) await admin.from("project_questions").insert(roleplayRows);

        await admin.from("training_blocks").delete().eq("project_id", body.project_id);
        for (const [bi, blk] of (data.training_blocks ?? []).entries()) {
          const { data: blockRow } = await admin.from("training_blocks").insert({
            project_id: body.project_id, title: blk.title, description: blk.description, order_index: bi,
          }).select("id").single();
          if (!blockRow) continue;
          for (const [li, les] of (blk.lessons ?? []).entries()) {
            const { data: lessonRow } = await admin.from("training_lessons").insert({
              block_id: blockRow.id, title: les.title, content: les.content, order_index: li,
            }).select("id").single();
            if (lessonRow && les.quiz) {
              await admin.from("training_quizzes").insert({
                lesson_id: lessonRow.id, type: "select",
                question: les.quiz.question, options: les.quiz.options ?? [],
                correct_answer: les.quiz.correct_answer, explanation: les.quiz.explanation,
                order_index: 0,
              });
            }
          }
        }

        // Списываем фикс-услуги после успешного сохранения (идемпотентно по project+item)
        try {
          if ((data.checklist?.length || 0) > 0 || (data.roleplay?.length || 0) > 0) {
            await admin.rpc("spend_fixed" as any, { _project: body.project_id, _item: "interview_setup" });
          }
          if ((data.training_blocks?.length || 0) > 0) {
            await admin.rpc("spend_fixed" as any, { _project: body.project_id, _item: "training_setup" });
          }
        } catch (billErr) {
          console.error("spend_fixed failed:", billErr);
        }
      }
    }

    await logToDb({
      user_message: `generate-onboarding role=${body.role_name}`,
      bot_reply: text.slice(0, 4000),
      channel_id: chatId, user_social_id: socialId,
      channel_name: "ai-generate-onboarding", server_name: "ai-generate-onboarding",
      function_call_params: JSON.stringify({ project_id: body.project_id, company: body.company_name }),
      tokens_in_source: raw?.usage?.prompt_tokens ?? null,
      tokens_out_source: raw?.usage?.completion_tokens ?? null,
    });
    return jsonResponse({ ok: true, data });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({
      user_message: `generate-onboarding role=${body.role_name}`, bot_reply: "",
      channel_id: chatId, user_social_id: socialId,
      channel_name: "ai-generate-onboarding", server_name: "ai-generate-onboarding",
      function_error: err,
    });
    return jsonResponse({ error: err }, 500);
  }
});