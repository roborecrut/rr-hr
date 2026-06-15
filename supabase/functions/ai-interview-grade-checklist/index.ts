// Grade 20-question checklist answers (server-side using correct/expected_answer).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null) as null | { project_id: string; candidate_id?: string; answers: Record<string,string>; candidate_token?: string };
  if (!body?.project_id || !body?.answers) return jsonResponse({ error: "bad_body" }, 400);

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: blk } = await admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","checklist").maybeSingle();
  const questions: any[] = (blk as any)?.payload?.questions || [];
  if (!questions.length) return jsonResponse({ error: "no_questions" }, 400);

  const chatId = buildChatId({ userId: candidateId });
  const socialId = buildSocialId({ user_id: candidateId });

  // Rich grading: pass ALL questions to RR (including choice) so it can explain
  // each one and produce final summary, strengths, gaps.
  const fullBatch = questions.map((q) => ({
    id: q.id,
    kind: q.kind || "text",
    question: q.question,
    options: q.options || null,
    correct: q.correct || null,
    expected: q.expected_answer || null,
    answer: (body.answers[q.id] || "").toString(),
  }));
  const msg = `Ты — строгий, но справедливый проверяющий ответы кандидата на чек-лист собеседования.
Для каждого вопроса оцени ответ от 0 до 5 баллов (5 = идеально), укажи verdict (correct|partial|wrong), краткое объяснение, что было верно (what_was_right) и что нужно улучшить (what_was_wrong).
Затем дай итог: общий процент (total 0..100), краткое summary (2-3 предложения), массив strengths и gaps (по 2-4 пункта).
Учитывай, что для вопросов kind="choice" эталон в поле correct, а для text — в expected. Если поле пустое — оценивай по смыслу.

ВОПРОСЫ И ОТВЕТЫ:
${JSON.stringify(fullBatch)}

Верни СТРОГО JSON без markdown:
{"items":[{"id":string,"score":0..5,"max":5,"verdict":"correct|partial|wrong","explanation":string,"what_was_right":string,"what_was_wrong":string}],"total":0..100,"summary":string,"strengths":[string],"gaps":[string]}`;

  let aiObj: any = null;
  let aiText = "";
  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 180_000 });
    aiText = r.text;
    aiObj = tryParseJson<any>(r.text) || null;
  } catch (e) {
    // fall through to local scoring
  }

  // Local fallback / normalization
  const items: any[] = [];
  for (const q of questions) {
    const ans = (body.answers[q.id] || "").toString().trim();
    const aiItem = (aiObj?.items || []).find((x: any) => String(x.id) === String(q.id));
    if (aiItem) {
      items.push({
        id: q.id,
        question: q.question,
        answer: ans,
        correct: q.kind === "choice" ? (q.correct || "") : (q.expected_answer || ""),
        score: Math.max(0, Math.min(5, Number(aiItem.score) || 0)),
        max: 5,
        verdict: String(aiItem.verdict || ""),
        explanation: String(aiItem.explanation || "").slice(0, 800),
        what_was_right: String(aiItem.what_was_right || "").slice(0, 500),
        what_was_wrong: String(aiItem.what_was_wrong || "").slice(0, 500),
      });
    } else if (q.kind === "choice") {
      const ok = !!(ans && q.correct && ans.trim().toLowerCase() === String(q.correct).trim().toLowerCase());
      items.push({ id: q.id, question: q.question, answer: ans, correct: q.correct || "", score: ok ? 5 : 0, max: 5, verdict: ok ? "correct" : "wrong", explanation: ok ? "Верно" : `Правильный ответ: ${q.correct || ""}`, what_was_right: ok ? "Выбран правильный вариант" : "", what_was_wrong: ok ? "" : "Выбран неправильный вариант" });
    } else {
      items.push({ id: q.id, question: q.question, answer: ans, correct: q.expected_answer || "", score: 0, max: 5, verdict: "wrong", explanation: "Не удалось оценить ИИ", what_was_right: "", what_was_wrong: "" });
    }
  }

  const total = items.reduce((s, x) => s + x.score, 0);
  const max = items.reduce((s, x) => s + x.max, 0) || 1;
  const score100 = aiObj?.total != null ? Math.round(Number(aiObj.total)) : Math.round((total / max) * 100);
  const feedback = {
    items,
    total: score100,
    summary: String(aiObj?.summary || "").slice(0, 1500),
    strengths: Array.isArray(aiObj?.strengths) ? aiObj.strengths.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : [],
    gaps: Array.isArray(aiObj?.gaps) ? aiObj.gaps.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : [],
  };

  await admin.from("candidate_scores").upsert({
    candidate_id: candidateId,
    checklist_score: score100,
    checklist_feedback: feedback,
  }, { onConflict: "candidate_id" });

  await logToDb({ user_message: `checklist:${candidateId}`, bot_reply: aiText, channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:grade-checklist", server_name: "ai-interview-grade-checklist" });
  return jsonResponse({ ok: true, score: score100, feedback });
});