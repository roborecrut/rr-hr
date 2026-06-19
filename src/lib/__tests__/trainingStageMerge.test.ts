import { describe, it, expect } from "vitest";
import { buildStageQuestionMap, mergeStageItems, deriveStageSummary } from "@/lib/trainingStageMerge";

const TESTS = [
  {
    stage: "professional",
    questions: [
      { id: "q1", question: "Что такое CRM?", points: 5, correct: "Customer Relationship Management",
        explanation: "См. урок 1." },
      { id: "q2", question: "Сколько этапов воронки?", points: 5 },
    ],
  },
];

describe("trainingStageMerge", () => {
  const qmap = buildStageQuestionMap(TESTS);

  it("merges by question_id even when arrays are in different order", () => {
    // Feedback in q2, q1 order; answers in q1, q2 order.
    const items = mergeStageItems({
      stage: "professional",
      feedback: [
        { id: "q2", score: 0, max: 5, comment: "Неверно" },
        { id: "q1", score: 5, max: 5, comment: "Верно" },
      ],
      answers: [
        { question_id: "q1", value: "Customer Relationship Management" },
        { question_id: "q2", value: "Десять" },
      ],
      questionsMap: qmap,
    });
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    expect(byId.q1.question).toBe("Что такое CRM?");
    expect(byId.q1.answer).toBe("Customer Relationship Management");
    expect(byId.q1.score).toBe(5);
    expect(byId.q2.question).toBe("Сколько этапов воронки?");
    expect(byId.q2.answer).toBe("Десять");
    expect(byId.q2.score).toBe(0);
    // Order/index swap MUST NOT cross-contaminate fields.
    expect(byId.q1.answer).not.toContain("Десять");
  });

  it("uses last_answers.question_text when no test definition exists", () => {
    const items = mergeStageItems({
      stage: "unknown",
      feedback: [{ id: "x1", score: 3, max: 5 }],
      answers: [{ question_id: "x1", value: "ответ", question_text: "Вопрос из ответа" }],
      questionsMap: qmap,
    });
    expect(items[0].question).toBe("Вопрос из ответа");
  });

  it("includes questions that have an answer but no feedback entry", () => {
    const items = mergeStageItems({
      stage: "professional",
      feedback: [{ id: "q1", score: 5, max: 5 }],
      answers: [
        { question_id: "q1", value: "ok" },
        { question_id: "q2", value: "no-fb" },
      ],
      questionsMap: qmap,
    });
    expect(items.map(i => i.id)).toEqual(["q1", "q2"]);
    expect(items[1].score).toBeNull();
  });

  it("falls back to def.points when feedback.max is missing", () => {
    const items = mergeStageItems({
      stage: "professional",
      feedback: [{ id: "q1", score: 3 }],
      answers: [],
      questionsMap: qmap,
    });
    expect(items[0].max).toBe(5);
  });

  it("never throws on null / object instead of array", () => {
    expect(() => mergeStageItems({
      stage: "professional", feedback: null, answers: null, questionsMap: null,
    })).not.toThrow();
    expect(() => mergeStageItems({
      stage: "professional", feedback: { not: "array" }, answers: "string",
      questionsMap: null,
    })).not.toThrow();
  });

  it("derives deterministic stage summary from items", () => {
    const items = mergeStageItems({
      stage: "professional",
      feedback: [
        { id: "q1", score: 5, max: 5 },
        { id: "q2", score: 0, max: 5 },
      ],
      answers: [{ question_id: "q2", value: "не знаю" }],
      questionsMap: qmap,
    });
    const sum = deriveStageSummary(items)!;
    expect(sum.summary).toContain("5 из 10");
    expect(sum.strengths[0]).toBe("Что такое CRM?");
    expect(sum.gaps[0]).toBe("Сколько этапов воронки?");
    expect(sum.risks[0].evidence).toContain("не знаю");
  });

  it("normalizes stage aliases when looking up definitions", () => {
    const items = mergeStageItems({
      stage: "Профессия",
      feedback: [{ id: "q1", score: 5, max: 5 }],
      answers: [],
      questionsMap: qmap,
    });
    expect(items[0].question).toBe("Что такое CRM?");
  });
});