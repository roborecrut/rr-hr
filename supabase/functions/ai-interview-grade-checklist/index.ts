// Grade 20-question checklist answers (server-side using correct/expected_answer).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string; candidate_id: string; answers: Record<string,string> };
  if (!body?.project_id || !body?.candidate_id || !body?.answers) return jsonResponse({ error: "bad_body" }, 400);

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: blk } = await admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","checklist").maybeSingle();
  const questions: any[] = (blk as any)?.payload?.questions || [];
  if (!questions.length) return jsonResponse({ error: "no_questions" }, 400);

  const chatId = buildChatId({ userId: body.candidate_id });
  const socialId = buildSocialId({ user_id: body.candidate_id });

  // Score choice locally; collect text-questions for AI grading in one batch.
  const items: { id: string; score: number; max: number; correct?: boolean; feedback?: string }[] = [];
  const textBatch: any[] = [];
  for (const q of questions) {
    const ans = (body.answers[q.id] || "").toString().trim();
    if (q.kind === "choice") {
      const ok = ans && q.correct && ans.trim().toLowerCase() === String(q.correct).trim().toLowerCase();
      items.push({ id: q.id, score: ok ? 5 : 0, max: 5, correct: !!ok, feedback: ok ? "Верно" : `Правильный ответ: ${q.correct || ""}` });
    } else {
      textBatch.push({ id: q.id, question: q.question, expected: q.expected_answer || "", answer: ans });
    }
  }

  let aiText = "";
  if (textBatch.length) {
    const msg = `Ты — проверяющий ответы кандидата на чек-лист. Оцени каждый ответ от 0 до 5 баллов по близости к эталону и полноте.
ЭТАЛОНЫ И ОТВЕТЫ:
${JSON.stringify(textBatch)}

Верни СТРОГО JSON-массив: [{"id":string,"score":0..5,"feedback":string}]`;
    try {
      const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 150_000 });
      aiText = r.text;
      const arr = tryParseJson<any[]>(r.text) || [];
      for (const it of arr) {
        const sc = Math.max(0, Math.min(5, Number(it.score) || 0));
        items.push({ id: String(it.id), score: sc, max: 5, feedback: String(it.feedback || "").slice(0, 500) });
      }
      // Fill missing
      for (const t of textBatch) if (!items.find(i => i.id === t.id)) items.push({ id: t.id, score: 0, max: 5, feedback: "Не удалось оценить" });
    } catch (e) {
      for (const t of textBatch) items.push({ id: t.id, score: 0, max: 5, feedback: "Ошибка оценки ИИ" });
    }
  }

  const total = items.reduce((s, x) => s + x.score, 0);
  const max = items.reduce((s, x) => s + x.max, 0) || 1;
  const score100 = Math.round((total / max) * 100);

  const { data: scoreRow } = await admin.from("candidate_scores").select("id").eq("candidate_id", body.candidate_id).maybeSingle();
  if (scoreRow?.id) {
    await admin.from("candidate_scores").update({ checklist_score: score100 }).eq("id", scoreRow.id);
  } else {
    await admin.from("candidate_scores").insert({ candidate_id: body.candidate_id, checklist_score: score100 });
  }

  await logToDb({ user_message: `checklist:${body.candidate_id}`, bot_reply: aiText, channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:grade-checklist", server_name: "ai-interview-grade-checklist" });
  return jsonResponse({ ok: true, score: score100, items });
});