// Grade 3 role-play situations (one reply per situation).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callProTalk, tryParseJson, buildChatId, buildSocialId, getAdminClient, logToDb } from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { isContentlessAnswer, isTooShortForOpenEnded, CONTENTLESS_COMMENT } from "../_shared/answer-quality.ts";

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

  const { data: blk } = await admin.from("interview_blocks").select("payload").eq("project_id", body.project_id).eq("kind","situations").maybeSingle();
  const situations: any[] = (blk as any)?.payload?.situations || [];
  if (!situations.length) return jsonResponse({ error: "no_situations" }, 400);

  const chatId = buildChatId({ userId: candidateId });
  const socialId = buildSocialId({ user_id: candidateId });

  // Pre-filter contentless answers — situations are always open-ended, so
  // empty / one-word / random-character answers get a deterministic 0
  // without calling the LLM. If ALL three are contentless we skip the
  // model entirely and return almost instantly.
  const contentlessIds = new Set<string>();
  for (const s of situations) {
    const ans = (body.answers[s.id] || "").toString();
    if (isContentlessAnswer(ans) || isTooShortForOpenEnded(ans, 20, 3)) contentlessIds.add(String(s.id));
  }
  const situationsForAi = situations.filter((s) => !contentlessIds.has(String(s.id)));
  const items = situationsForAi.map(s => ({ id: s.id, title: s.title, brief: s.brief, criteria: s.criteria, answer: (body.answers[s.id] || "").toString() }));

  // All-empty fast path: don't touch the provider, save the zero result and return.
  if (items.length === 0) {
    const results = situations.map((s: any) => ({ id: String(s.id), score: 0, feedback: CONTENTLESS_COMMENT }));
    const feedback = { items: results, advice: CONTENTLESS_COMMENT, total: 0 };
    await admin.from("candidate_scores").upsert({
      candidate_id: candidateId,
      situations_score: 0,
      situations_feedback: feedback,
    }, { onConflict: "candidate_id" });
    return jsonResponse({ ok: true, score: 0, items: results, advice: CONTENTLESS_COMMENT, skipped_ai: true });
  }

  const msg = `Ты — оценщик ролевых ответов. По каждой ситуации оцени ответ кандидата от 0 до 100 баллов с учётом критериев.
СИТУАЦИИ И ОТВЕТЫ:
${JSON.stringify(items)}

Верни СТРОГО JSON: {"items":[{"id":string,"score":0..100,"feedback":string}],"average":0..100,"advice":string}`;

  try {
    const r = await callProTalk({ messages: [{ role: "user", content: msg }], chatId, socialId, timeoutMs: 150_000 });
    const obj = tryParseJson<any>(r.text) || {};
    const aiResults = (Array.isArray(obj.items) ? obj.items : []).map((it: any) => ({
      id: String(it.id), score: Math.max(0, Math.min(100, Number(it.score) || 0)),
      feedback: String(it.feedback || "").slice(0, 800),
    }));
    // Merge AI results back with deterministic zeros for the contentless ones,
    // preserving the original situation order.
    const results = situations.map((s: any) => {
      const sid = String(s.id);
      if (contentlessIds.has(sid)) return { id: sid, score: 0, feedback: CONTENTLESS_COMMENT };
      const hit = aiResults.find((x: any) => x.id === sid);
      return hit || { id: sid, score: 0, feedback: "" };
    });
    const avg = results.length ? Math.round(results.reduce((s: number, x: any) => s + x.score, 0) / results.length) : 0;

    const feedback = { items: results, advice: String(obj.advice || "").slice(0, 800), total: avg };
    await admin.from("candidate_scores").upsert({
      candidate_id: candidateId,
      situations_score: avg,
      situations_feedback: feedback,
    }, { onConflict: "candidate_id" });
    await logToDb({ user_message: msg.slice(0,5000), bot_reply: r.text.slice(0,5000), channel_id: chatId, user_social_id: socialId, channel_name: "ai-interview:grade-situations", server_name: "ai-interview-grade-situations" });
    return jsonResponse({ ok: true, score: avg, items: results, advice: String(obj.advice || "").slice(0, 800) });
  } catch (e) {
    return jsonResponse({ error: String((e as Error).message) }, 500);
  }
});