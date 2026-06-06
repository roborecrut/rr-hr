// Grade 3 role-play situations (one reply per situation).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string; candidate_id: string; answers: Record<string,string> };
  if (!body?.project_id || !body?.candidate_id || !body?.answers) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: blk } = await admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","situations").maybeSingle();
  const situations: any[] = (blk as any)?.payload?.situations || [];
  if (!situations.length) return jsonResponse({ error: "no_situations" }, 400);

  const chatId = buildChatId({ userId: body.candidate_id });
  const socialId = buildSocialId({ user_id: body.candidate_id });

  const items = situations.map(s => ({ id: s.id, title: s.title, brief: s.brief, criteria: s.criteria, answer: (body.answers[s.id] || "").toString() }));
  const msg = `Ты — оценщик ролевых ответов. По каждой ситуации оцени ответ кандидата от 0 до 100 баллов с учётом критериев.
СИТУАЦИИ И ОТВЕТЫ:
${JSON.stringify(items)}

Верни СТРОГО JSON: {"items":[{"id":string,"score":0..100,"feedback":string}],"average":0..100,"advice":string}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 150_000 });
    const obj = tryParseJson<any>(r.text) || {};
    const results = (Array.isArray(obj.items) ? obj.items : []).map((it: any) => ({
      id: String(it.id), score: Math.max(0, Math.min(100, Number(it.score) || 0)),
      feedback: String(it.feedback || "").slice(0, 800),
    }));
    const avg = results.length ? Math.round(results.reduce((s: number, x: any) => s + x.score, 0) / results.length) : 0;

    const { data: scoreRow } = await admin.from("candidate_scores").select("id").eq("candidate_id", body.candidate_id).maybeSingle();
    if (scoreRow?.id) {
      await admin.from("candidate_scores").update({ situations_score: avg }).eq("id", scoreRow.id);
    } else {
      await admin.from("candidate_scores").insert({ candidate_id: body.candidate_id, situations_score: avg });
    }
    await logToDb({ user_message: msg.slice(0,5000), bot_reply: r.text.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:grade-situations", server_name: "ai-interview-grade-situations" });
    return jsonResponse({ ok: true, score: avg, items: results, advice: String(obj.advice || "").slice(0, 800) });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});