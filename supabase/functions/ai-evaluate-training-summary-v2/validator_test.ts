import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateTrainingSummary,
  validateTrainingStageReport,
} from "../_shared/ai-validators.ts";

Deno.test("training stage report — valid full payload", () => {
  const r = validateTrainingStageReport({
    score: 80,
    employer: {
      summary: "Сдал основные темы.",
      strengths: ["Знает API"],
      gaps: ["Слабо в безопасности"],
      risks: [{ title: "Доступы", evidence: "Перепутал роль", severity: "средний", how_to_verify: "Спросить" }],
      red_flags: [],
      items: [{ question_id: "q1", score: 80, feedback: "ок", evidence: "ответил" }],
      recommendation: "Допустить",
    },
    candidate: {
      summary: "Хороший результат.",
      strengths: ["API"],
      areas_to_improve: ["Безопасность"],
      items: [{ question_id: "q1", score: 80, feedback: "Хорошо", recommendation: "Закрепите" }],
      next_steps: ["Следующий этап"],
    },
  }, ["q1"]);
  assertEquals(r.ok, true);
});

Deno.test("training stage report — invalid score rejected", () => {
  const r = validateTrainingStageReport({
    score: 150,
    employer: { summary: "x", strengths: [], gaps: [], risks: [], red_flags: [], items: [], recommendation: "" },
    candidate: { summary: "y", strengths: [], areas_to_improve: [], items: [], next_steps: [] },
  }, []);
  assertEquals(r.ok, false);
});

Deno.test("training stage report — risk without evidence rejected", () => {
  const r = validateTrainingStageReport({
    score: 50,
    employer: {
      summary: "x",
      risks: [{ title: "X", evidence: "", severity: "низкий" }],
      red_flags: [], strengths: [], gaps: [], items: [], recommendation: "",
    },
    candidate: { summary: "y", strengths: [], areas_to_improve: [], items: [], next_steps: [] },
  }, []);
  assertEquals(r.ok, false);
});

Deno.test("training stage report — protected characteristic rejected", () => {
  const r = validateTrainingStageReport({
    score: 50,
    employer: {
      summary: "Возраст кандидата 50 лет влияет на обучение.",
      risks: [], red_flags: [], strengths: [], gaps: [], items: [], recommendation: "",
    },
    candidate: { summary: "y", strengths: [], areas_to_improve: [], items: [], next_steps: [] },
  }, []);
  assertEquals(r.ok, false);
});

Deno.test("training stage report — candidate forbidden key rejected", () => {
  const r = validateTrainingStageReport({
    score: 50,
    employer: { summary: "x", risks: [], red_flags: [], strengths: [], gaps: [], items: [], recommendation: "" },
    candidate: { summary: "y", strengths: [], areas_to_improve: [], items: [], next_steps: [], red_flags: [{ title: "X" }] as any },
  }, []);
  assertEquals(r.ok, false);
});

Deno.test("training summary — valid", () => {
  const r = validateTrainingSummary({
    employer: {
      score: 75, data_completeness: 66, verdict: "частично готов", summary: "ok",
      completed_stages: ["Профессия"], missing_stages: ["Система"],
      mastered_topics: [], weak_topics: [], risks: [], red_flags: [],
      revision_plan: [], readiness: "ok", recommendation: "ok",
    },
    candidate: {
      summary: "ok", completed_stages: ["Профессия"], missing_stages: ["Система"],
      strengths: [], topics_to_repeat: [], revision_plan: [], next_steps: [],
    },
  });
  assertEquals(r.ok, true);
});

Deno.test("training summary — bad verdict rejected", () => {
  const r = validateTrainingSummary({
    employer: {
      score: 50, data_completeness: 100, verdict: "так себе", summary: "ok",
      completed_stages: [], missing_stages: [], mastered_topics: [], weak_topics: [],
      risks: [], red_flags: [], revision_plan: [], readiness: "", recommendation: "",
    },
    candidate: {
      summary: "ok", completed_stages: [], missing_stages: [],
      strengths: [], topics_to_repeat: [], revision_plan: [], next_steps: [],
    },
  });
  assertEquals(r.ok, false);
});

Deno.test("training summary — protected characteristic rejected", () => {
  const r = validateTrainingSummary({
    employer: {
      score: 50, data_completeness: 100, verdict: "готов", summary: "Кандидату 22 года и поэтому он готов.",
      completed_stages: [], missing_stages: [], mastered_topics: [], weak_topics: [],
      risks: [], red_flags: [], revision_plan: [], readiness: "", recommendation: "",
    },
    candidate: { summary: "ok", completed_stages: [], missing_stages: [], strengths: [], topics_to_repeat: [], revision_plan: [], next_steps: [] },
  });
  assertEquals(r.ok, false);
});