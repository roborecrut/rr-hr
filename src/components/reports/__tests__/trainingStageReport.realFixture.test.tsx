/**
 * A2 fixture test — locks the training-stage report against the REAL JSONB
 * shapes pulled from production for candidate Чистова Ольга
 * (c52be090-15e9-4c8c-b445-283fa6b8b2e8, project 7b25b20f).
 *
 * What this guards:
 *   1. Real question text is rendered (not "Вопрос 1").
 *   2. Candidate's actual answer for a given question_id is shown alongside
 *      the matching question, even when last_answers is in a DIFFERENT order
 *      than last_feedback or training_stage_tests.questions.
 *   3. Per-question AI feedback (`comment`) maps to the SAME question_id.
 *   4. The deterministic deriveStageSummary falls back when employer_summary
 *      is null, so the stage card shows a structured summary.
 *   5. Malformed legacy payload (string instead of array) does NOT crash
 *      with a white screen — render returns empty / safe output.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import EmployerTrainingStageReport from "@/components/reports/EmployerTrainingStageReport";
import { buildStageQuestionMap, mergeStageItems, deriveStageSummary } from "@/lib/trainingStageMerge";

// --- Real fixture (trimmed, anonymized identifiers preserved as in DB) ---

const realQuestions_product = [
  { id: "q1", kind: "choice", question: "Что НЕ является параметром тарифной линейки?", correct: "Количество сотрудников", points: 5 },
  { id: "q2", kind: "choice", question: "Какая стратегия НЕВЕРНА при работе с возражением о цене?", correct: "Сразу снизить цену на 50% без обсуждения", points: 5 },
  { id: "q3", kind: "choice", question: "Что входит в KPI продукта?", correct: "Измеримый результат", points: 5 },
  { id: "q11", kind: "text", question: "Опишите различия трёх тарифов словами клиента.", expected_answer: "Кратко — три варианта по бюджету.", points: 5 },
];

const realFeedback_product_shuffled = [
  // shuffled on purpose — must not be relied on
  { id: "q11", max: 5, score: 0, comment: "Кандидат проигнорировал вопрос. Задал встречный вопрос на другую тему." },
  { id: "q2",  max: 5, score: 5, comment: "Верно" },
  { id: "q1",  max: 5, score: 0, comment: "Неверно" },
  { id: "q3",  max: 5, score: 0, comment: "Неверно" },
];

const realAnswers_product_thirdOrder = [
  // yet another order; must be merged by question_id, not array index
  { question_id: "q3", value: "Измеримый результат" },
  { question_id: "q11", value: "Объясните, почему пост-продажное сопровождение важно для бизнеса." },
  { question_id: "q1", value: "Объём функционала" },
  { question_id: "q2", value: "Сразу снизить цену на 50% без обсуждения" },
];

const stageTestsRows = [
  { stage: "product",      questions: realQuestions_product },
  { stage: "professional", questions: [{ id: "q1", kind: "choice", question: "Параметр портрета клиента?", correct: "Личные увлечения", points: 5 }] },
  { stage: "system",       questions: [{ id: "q1", kind: "choice", question: "Что НЕ обязательно в карточке сделки?", correct: "ИНН клиента", points: 5 }] },
];

describe("A2 — training stage report on real Chistova JSONB", () => {
  const qmap = buildStageQuestionMap(stageTestsRows);

  it("merges by question_id across three different array orders", () => {
    const merged = mergeStageItems({
      stage: "product",
      feedback: realFeedback_product_shuffled,
      answers: realAnswers_product_thirdOrder,
      questionsMap: qmap,
    });
    // q1: feedback 0/5, answer "Объём функционала", real question text
    const q1 = merged.find(m => m.id === "q1")!;
    expect(q1.question).toContain("параметром тарифной линейки");
    expect(q1.answer).toBe("Объём функционала");
    expect(q1.score).toBe(0);
    // q2: candidate happened to be correct
    const q2 = merged.find(m => m.id === "q2")!;
    expect(q2.is_correct).toBe(true);
    expect(q2.answer).toBe("Сразу снизить цену на 50% без обсуждения");
    // q11 text answer should NOT bleed into q1 or q2
    const q11 = merged.find(m => m.id === "q11")!;
    expect(q11.answer).toMatch(/пост-продажное/);
    expect(q11.question).toContain("Опишите различия трёх тарифов");
  });

  it("renders real question text in the card (no 'Вопрос 1' placeholder)", () => {
    const { container } = render(
      <EmployerTrainingStageReport
        status="passed"
        score={5}
        max={20}
        passScore={70}
        stage="product"
        employerSummary={null}
        feedback={realFeedback_product_shuffled}
        answers={realAnswers_product_thirdOrder}
        questionsMap={qmap}
      />,
    );
    const html = container.innerHTML;
    expect(html).toContain("параметром тарифной линейки");
    expect(html).toContain("KPI продукта");
    expect(html).not.toMatch(/Вопрос\s*1(?!\d)/);
  });

  it("deriveStageSummary fills gaps + risks when employer_summary is null", () => {
    const merged = mergeStageItems({
      stage: "product",
      feedback: realFeedback_product_shuffled,
      answers: realAnswers_product_thirdOrder,
      questionsMap: qmap,
    });
    const sum = deriveStageSummary(merged)!;
    expect(sum.summary).toMatch(/Балл: 5 из 20 \(25%\)/);
    expect(sum.gaps.length).toBeGreaterThan(0);
    expect(sum.risks.length).toBeGreaterThan(0);
    // strengths should include q2 (the one correct answer)
    expect(sum.strengths.join(" ")).toContain("возражением о цене");
  });

  it("malformed payload (string instead of array) does not crash render", () => {
    expect(() => render(
      <EmployerTrainingStageReport
        status="passed"
        score={null}
        max={100}
        passScore={70}
        stage="product"
        employerSummary={null}
        feedback={"not-an-array" as any}
        answers={"also-not-an-array" as any}
        questionsMap={qmap}
      />,
    )).not.toThrow();
  });

  it("works for ALL three Chistova stages — professional / product / system", () => {
    for (const stage of ["professional", "product", "system"]) {
      const merged = mergeStageItems({
        stage,
        feedback: [{ id: "q1", score: 0, max: 5, comment: "Неверно" }],
        answers: [{ question_id: "q1", value: "wrong-thing" }],
        questionsMap: qmap,
      });
      expect(merged[0].question.length).toBeGreaterThan(5);
      expect(merged[0].answer).toBe("wrong-thing");
    }
  });
});