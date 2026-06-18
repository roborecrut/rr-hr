// Batch-grade ALL training quiz answers in a single LLM call (mirror of
// ai-interview-grade-checklist for training stage tests). Updates
// candidate_stage_progress (attempts++, best_score, last_score, last_feedback,
// last_answers, passed_at).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  callProTalk, tryParseJson, extractJsonObjects,
  buildChatId, buildSocialId, getAdminClient, logToDb,
} from "../_shared/protalk.ts";
import { requireCandidateToken } from "../_shared/auth.ts";
import { isContentlessAnswer, isTooShortForOpenEnded, CONTENTLESS_COMMENT } from "../_shared/answer-quality.ts";
import { detectProtectedCharacteristic } from "../_shared/ai-validators.ts";

type Answer = { question_id: string; value: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => null) as null | {
    candidate_id?: string;
    project_id: string;
    stage: string;
    answers: Answer[];
    candidate_token?: string;
  };
  if (!body?.project_id || !body?.stage || !Array.isArray(body?.answers)) {
    return jsonResponse({ error: "bad_body" }, 400);
  }

  const authz = await requireCandidateToken(req, body.candidate_token);
  if (authz instanceof Response) return authz;
  const candidateId = authz.candidateId;

  const admin = getAdminClient();
  if (!admin) return jsonResponse({ error: "no_admin_client" }, 500);

  const { data: test } = await admin.from("training_stage_tests")
    .select("questions,pass_score,total_score")
    .eq("project_id", body.project_id).eq("stage", body.stage).maybeSingle();
  if (!test) return jsonResponse({ error: "no_test" }, 404);

  const questions = ((test.questions as any[]) || []);
  const passScore = (test as any).pass_score || 70;
  const totalMax = (test as any).total_score
    || questions.reduce((s, q) => s + (Number(q.points) || 5), 0);

  const ansMap = new Map<string, string>();
  for (const a of body.answers) ansMap.set(String(a.question_id), (a.value || "").toString());

  // Pre-resolve choice questions locally (deterministic) AND mark contentless
  // text answers as 0 without involving the LLM.
  type Item = {
    id: string; score: number; max: number; comment: string;
    verdict: "correct" | "partial" | "wrong";
    what_was_right?: string; what_was_wrong?: string;
  };
  const itemsById = new Map<string, Item>();
  const aiBatch: any[] = [];

  for (const q of questions) {
    const id = String(q.id);
    const max = Number(q.points) || 5;
    const value = (ansMap.get(id) || "").trim();
    if (q.kind === "choice") {
      // Score locally — instant, no LLM call needed for choice questions.
      const correct = String(q.correct || "").trim().toLowerCase();
      const ok = !!value && value.toLowerCase() === correct;
      itemsById.set(id, {
        id, score: ok ? max : 0, max,
        verdict: ok ? "correct" : "wrong",
        comment: ok ? "Верно" : `Правильный ответ: ${q.correct || ""}`,
        what_was_right: ok ? "Выбран правильный вариант" : "",
        what_was_wrong: ok ? "" : "Выбран неправильный вариант",
      });
    } else {
      if (isContentlessAnswer(value) || isTooShortForOpenEnded(value)) {
        itemsById.set(id, {
          id, score: 0, max, verdict: "wrong",
          comment: CONTENTLESS_COMMENT,
          what_was_right: "",
          what_was_wrong: CONTENTLESS_COMMENT,
        });
      } else {
        aiBatch.push({
          id, question: q.question, expected: q.expected_answer || "",
          points: max, answer: value,
        });
      }
    }
  }

  const chatId = buildChatId({ userId: candidateId });
  const socialId = buildSocialId({ user_id: candidateId });
  let aiText = "";
  let aiObj: any = null;

  if (aiBatch.length > 0) {
    const prompt = `Ты — строгий, но справедливый экзаменатор. Для каждого текстового ответа кандидата на тест обучения оцени по СМЫСЛОВОМУ совпадению с эталоном.
Каждому вопросу дай score от 0 до max баллов (max указан в points), verdict ("correct"|"partial"|"wrong"), краткое объяснение, что было правильно (what_was_right) и что не хватает (what_was_wrong).

ВОПРОСЫ:
${JSON.stringify(aiBatch)}

Верни СТРОГО JSON без markdown:
{"items":[{"id":string,"score":number,"verdict":"correct|partial|wrong","explanation":string,"what_was_right":string,"what_was_wrong":string}]}`;
    try {
      const r = await callProTalk({
        messages: [
          { role: "system", content: "Ты — экзаменатор. Отвечай строго JSON." },
          { role: "user", content: prompt },
        ],
        chatId, socialId, timeoutMs: 180_000,
      });
      aiText = r.text;
      aiObj = tryParseJson<any>(r.text);
      if (!aiObj) {
        const objs = extractJsonObjects<any>(r.text);
        const its = objs.filter((o) => o && o.id != null && (o.score != null || o.verdict));
        if (its.length) aiObj = { items: its };
      }
    } catch (e) {
      console.error("[ai-grade-training-quiz] LLM call failed", (e as Error).message);
    }
  }

  // Merge AI results into items
  for (const b of aiBatch) {
    const a = (aiObj?.items || []).find((x: any) => String(x.id) === b.id);
    if (a) {
      const score = Math.max(0, Math.min(b.points, Number(a.score) || 0));
      itemsById.set(b.id, {
        id: b.id, score, max: b.points,
        verdict: (a.verdict === "correct" || a.verdict === "partial") ? a.verdict : "wrong",
        comment: String(a.explanation || "").slice(0, 800),
        what_was_right: String(a.what_was_right || "").slice(0, 500),
        what_was_wrong: String(a.what_was_wrong || "").slice(0, 500),
      });
    } else {
      // LLM dropped this item — keep score 0 with explicit note instead of "Не удалось оценить".
      itemsById.set(b.id, {
        id: b.id, score: 0, max: b.points, verdict: "wrong",
        comment: "ИИ не вернул оценку. Перепройдите тест.",
        what_was_right: "", what_was_wrong: "",
      });
    }
  }

  // Build per_question in original question order
  const perQuestion = questions.map((q) => {
    const it = itemsById.get(String(q.id))!;
    return {
      id: q.id, score: it.score, max: it.max,
      comment: it.comment, verdict: it.verdict,
      what_was_right: it.what_was_right || "",
      what_was_wrong: it.what_was_wrong || "",
    };
  });

  const total = perQuestion.reduce((s, x) => s + x.score, 0);
  const passed = total >= passScore;

  const { data: existing } = await admin.from("candidate_stage_progress")
    .select("attempts,best_score,passed_at")
    .eq("candidate_id", candidateId).eq("stage", body.stage).maybeSingle();
  const attempts = ((existing as any)?.attempts || 0) + 1;
  const bestScore = Math.max(((existing as any)?.best_score || 0), total);
  const passedAt = (existing as any)?.passed_at || (passed ? new Date().toISOString() : null);

  if (existing) {
    await admin.from("candidate_stage_progress").update({
      attempts, best_score: bestScore, last_score: total,
      last_answers: body.answers, last_feedback: perQuestion, passed_at: passedAt,
    }).eq("candidate_id", candidateId).eq("stage", body.stage);
  } else {
    await admin.from("candidate_stage_progress").insert({
      candidate_id: candidateId, stage: body.stage,
      attempts, best_score: bestScore, last_score: total,
      last_answers: body.answers, last_feedback: perQuestion, passed_at: passedAt,
    });
  }

  await logToDb({
    user_message: `grade training ${body.stage}`,
    bot_reply: `score ${total}/${totalMax} passed=${passed}`,
    channel_id: chatId, user_social_id: socialId,
    channel_name: `ai-grade-training:${body.stage}`,
    server_name: "ai-grade-training-quiz",
    function_call_params: JSON.stringify({ candidate_id: candidateId, project_id: body.project_id, stage: body.stage }),
  });

  // ---------------------------------------------------------------------------
  // Stage-level structured summaries (employer / candidate). Best-effort:
  // computed deterministically from per-question results — no extra AI call
  // and no billing. Stored into candidate_stage_progress.employer_summary /
  // candidate_summary which are already in the schema.
  // ---------------------------------------------------------------------------
  try {
    const sanitizedItems = perQuestion.map((pq) => {
      const q = questions.find((qq) => String(qq.id) === String(pq.id));
      const qText = q ? String(q.question || "") : "";
      const safeComment = String(pq.comment || "").replace(/```json[\s\S]*?```/gi, "").trim();
      return {
        question_id: String(pq.id),
        question: qText,
        score: Math.round((Number(pq.score) / Math.max(1, Number(pq.max))) * 100),
        verdict: pq.verdict,
        what_was_right: String(pq.what_was_right || ""),
        what_was_wrong: String(pq.what_was_wrong || ""),
        comment: safeComment,
      };
    });

    const strong = sanitizedItems.filter((x) => x.verdict === "correct");
    const weak = sanitizedItems.filter((x) => x.verdict !== "correct");
    const stageScore = Math.round((total / Math.max(1, totalMax)) * 100);

    const employerSummary = {
      summary: passed
        ? `Кандидат сдал этап обучения с результатом ${total}/${totalMax} (${stageScore}/100). Большинство тем усвоено.`
        : `Кандидат не сдал этап: ${total}/${totalMax} (${stageScore}/100), проходной ${passScore}. Требуется повторное прохождение.`,
      strengths: strong.slice(0, 6).map((x) => x.question || "").filter(Boolean),
      gaps: weak.slice(0, 8).map((x) => x.question || "").filter(Boolean),
      risks: [] as any[],
      red_flags: [] as any[],
      items: sanitizedItems.map((x) => ({
        question_id: x.question_id, score: x.score,
        feedback: x.comment || x.what_was_wrong || x.what_was_right || "",
        evidence: x.what_was_wrong || x.what_was_right || "",
      })),
      recommendation: passed
        ? "Допустить к следующему этапу."
        : (weak.length >= sanitizedItems.length / 2
            ? "Требуется повторное обучение по слабым темам и повторная попытка."
            : "Повторить отдельные темы и пересдать тест."),
    };

    const candidateSummary = {
      summary: passed
        ? `Поздравляем — этап сдан! Балл: ${total}/${totalMax}.`
        : `Этап пока не сдан: ${total}/${totalMax}, нужно ${passScore}. Не переживайте — разберём слабые темы и попробуем снова.`,
      strengths: strong.slice(0, 6).map((x) => x.question || "").filter(Boolean),
      areas_to_improve: weak.slice(0, 8).map((x) => x.question || "").filter(Boolean),
      items: sanitizedItems.map((x) => ({
        question_id: x.question_id,
        score: x.score,
        feedback: x.verdict === "correct"
          ? (x.what_was_right || "Ответ зачтён.")
          : (x.what_was_wrong || x.comment || "Ответ требует доработки."),
        recommendation: x.verdict === "correct"
          ? "Закрепите тему практикой."
          : "Вернитесь к материалу по этой теме и попробуйте сформулировать ответ своими словами.",
      })),
      next_steps: passed
        ? ["Переходите к следующему этапу обучения."]
        : ["Повторите слабые темы.", "Пересдайте тест после повторения."],
    };

    // Strip any accidental protected-characteristic mention.
    const guardBlob = JSON.stringify({ employerSummary, candidateSummary });
    const safe = !detectProtectedCharacteristic(guardBlob);

    if (safe) {
      await admin.from("candidate_stage_progress").update({
        employer_summary: employerSummary,
        candidate_summary: candidateSummary,
      }).eq("candidate_id", candidateId).eq("stage", body.stage);
    }
  } catch (e) {
    console.error("[ai-grade-training-quiz] summary build failed", (e as Error).message);
    // Non-fatal — legacy per_question feedback is already saved above.
  }

  return jsonResponse({
    ok: true, score: total, total_score: totalMax,
    pass_score: passScore, passed, attempts, per_question: perQuestion,
  });
});