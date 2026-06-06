// Score candidate resume against vacancy criteria. Returns {score, summary, strengths[], gaps[]}.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string; candidate_id: string; resume_text: string };
  if (!body?.project_id || !body?.candidate_id || !body?.resume_text) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const [{ data: proj }, { data: blk }] = await Promise.all([
    admin.from("projects").select("role_name,vacancy_text").eq("id", body.project_id).maybeSingle(),
    admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","resume").maybeSingle(),
  ]);
  const criteria = ((blk as any)?.payload?.criteria_md || "").toString();

  const chatId = buildChatId({ userId: body.candidate_id });
  const socialId = buildSocialId({ user_id: body.candidate_id });

  const msg = `Ты HR-эксперт. Оцени резюме кандидата по вакансии "${(proj as any)?.role_name || ""}".
Критерии:
${criteria || "(нет критериев — оцени по соответствию должности)"}

Описание вакансии:
${(proj as any)?.vacancy_text || ""}

РЕЗЮМЕ КАНДИДАТА:
${body.resume_text.slice(0, 10000)}

Верни СТРОГО JSON: {"score":0..100,"summary":string (2-4 предложения для кандидата),"strengths":string[],"gaps":string[]}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 120_000 });
    const obj = tryParseJson<any>(r.text) || {};
    const score = Math.max(0, Math.min(100, Number(obj.score) || 0));
    const result = {
      score,
      summary: String(obj.summary || "").slice(0, 1500),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 10).map((s: any) => String(s).slice(0, 300)) : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps.slice(0, 10).map((s: any) => String(s).slice(0, 300)) : [],
    };

    // Upsert candidate_scores
    const { data: scoreRow } = await admin.from("candidate_scores").select("id").eq("candidate_id", body.candidate_id).maybeSingle();
    if (scoreRow?.id) {
      await admin.from("candidate_scores").update({ resume_score: score, assessment_summary: result.summary }).eq("id", scoreRow.id);
    } else {
      await admin.from("candidate_scores").insert({ candidate_id: body.candidate_id, resume_score: score, assessment_summary: result.summary });
    }
    await admin.from("candidates").update({ resume_text: body.resume_text.slice(0, 20000) }).eq("id", body.candidate_id);

    await logToDb({ user_message: msg.slice(0, 5000), bot_reply: r.text.slice(0, 5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:screen-resume", server_name: "ai-interview-screen-resume" });
    return jsonResponse({ ok: true, result });
  } catch (e) {
    const err = String((e as Error).message);
    await logToDb({ user_message: msg.slice(0, 5000), bot_reply: "", channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:screen-resume", server_name: "ai-interview-screen-resume", function_error: err });
    return jsonResponse({ error: err }, 500);
  }
});