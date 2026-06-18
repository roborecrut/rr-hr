/**
 * Phase 4 — overall AI evaluation UI tests.
 * Cover the two new components and their guarantees:
 *  - separate AI fit score vs. average stage score (different labels);
 *  - empty sections are hidden;
 *  - candidate-only block strips employer-only keys defensively;
 *  - empty/missing feedback yields the explicit "не сформирована" state.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import EmployerOverallReport from "../EmployerOverallReport";
import CandidateOverallReport from "../CandidateOverallReport";

const fullEmployer = {
  fit_score: 78, confidence: 80, data_completeness: 90,
  verdict: "частичное соответствие",
  executive_summary: "Сильный кандидат с релевантным опытом.",
  stage_summary: [
    { stage: "resume", score: 70, conclusion: "ОК", key_evidence: ["3 года продукта"] },
  ],
  matches: [
    { criterion: "Python", degree: "полностью", evidence: "5 лет", source: "resume" },
    { criterion: "Лидерство", degree: "частично", evidence: "1 проект", source: "checklist" },
  ],
  gaps: [{ criterion: "Менторство", finding: "Нет", impact: "Среднее", source: "resume" }],
  risks: [{ title: "Малый стаж", evidence: "<1 год на роли", impact: "Стабильность", severity: "средний", how_to_verify: "Спросить" }],
  red_flags: [{ title: "Расхождение", evidence: "Противоречивые ответы", source: "situations", severity: "высокий" }],
  employer_wishes_alignment: [{ wish: "Гибкий график", status: "соответствует", evidence: "ок" }],
  strengths: ["Системное мышление"],
  interview_focus: ["Лидерство"],
  missing_sections: ["Обучение"],
  recommendation: "Пригласить на финальный этап.",
};

describe("EmployerOverallReport", () => {
  it("renders separate labels for ai_fit_score and overall_score", () => {
    const { getByTestId, getByText } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    expect(getByTestId("ai-fit-score-card").textContent).toMatch(/78/);
    expect(getByTestId("avg-stage-score-card").textContent).toMatch(/64/);
    expect(getByText(/AI-оценка соответствия вакансии/)).toBeTruthy();
    expect(getByText(/Средний балл этапов/)).toBeTruthy();
  });

  it("renders all main sections when present", () => {
    const { getByText } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    expect(getByText(/Краткий управленческий вывод/)).toBeTruthy();
    expect(getByText(/Результаты по этапам/)).toBeTruthy();
    expect(getByText(/Соответствует требованиям/)).toBeTruthy();
    expect(getByText(/Частично подтверждено/)).toBeTruthy();
    expect(getByText(/Не подтверждено или расходится/)).toBeTruthy();
    expect(getByText(/Соответствие пожеланиям работодателя/)).toBeTruthy();
    expect(getByText(/Сильные стороны/)).toBeTruthy();
    expect(getByText(/Риски/)).toBeTruthy();
    expect(getByText(/Красные флаги/)).toBeTruthy();
    expect(getByText(/Что уточнить на финальном интервью/)).toBeTruthy();
    expect(getByText(/Итоговая рекомендация/)).toBeTruthy();
    expect(getByText(/Недостающие данные/)).toBeTruthy();
  });

  it("hides empty sections", () => {
    const minimal = { ...fullEmployer, risks: [], red_flags: [], gaps: [], strengths: [], interview_focus: [], employer_wishes_alignment: [], missing_sections: [], recommendation: "" };
    const { queryByText } = render(
      <EmployerOverallReport fitScore={50} overallScore={50} employerFeedback={minimal} />,
    );
    expect(queryByText(/Риски/)).toBeNull();
    expect(queryByText(/Красные флаги/)).toBeNull();
    expect(queryByText(/Сильные стороны/)).toBeNull();
    expect(queryByText(/Итоговая рекомендация/)).toBeNull();
  });

  it("renders explicit empty state when employerFeedback is null", () => {
    const { getByTestId, getByText } = render(
      <EmployerOverallReport fitScore={null} overallScore={null} employerFeedback={null} />,
    );
    expect(getByTestId("overall-employer-empty")).toBeTruthy();
    expect(getByText(/Общая AI-оценка ещё не сформирована/)).toBeTruthy();
  });
});

describe("CandidateOverallReport", () => {
  it("renders candidate-facing fields only", () => {
    const { getByText, queryByText } = render(
      <CandidateOverallReport feedback={{
        summary: "Спасибо за прохождение этапов. У вас сильные технические стороны.",
        strengths: ["Аналитика"],
        areas_to_improve: ["Презентации"],
        stage_feedback: [{ stage: "resume", conclusion: "Хорошее резюме." }],
        next_steps: ["Подготовиться к интервью"],
      }} />,
    );
    expect(getByText(/Итог по пройденным этапам/)).toBeTruthy();
    expect(getByText(/Сильные стороны/)).toBeTruthy();
    expect(getByText(/Следующие шаги/)).toBeTruthy();
    expect(queryByText(/Риски/)).toBeNull();
    expect(queryByText(/Красные флаги/)).toBeNull();
    expect(queryByText(/Рекомендация/)).toBeNull();
  });

  it("strips employer-only keys defensively if leaked", () => {
    const leaked: any = {
      summary: "Спасибо за прохождение этапов. У вас сильные стороны и есть зоны роста.",
      strengths: ["A"],
      risks: [{ title: "should-not-render", evidence: "secret" }],
      red_flags: [{ title: "leak", evidence: "x" }],
      verdict: "низкое соответствие",
      recommendation: "do not show",
    };
    const { queryByText, container } = render(<CandidateOverallReport feedback={leaked} />);
    expect(container.textContent).not.toMatch(/should-not-render/);
    expect(container.textContent).not.toMatch(/secret/);
    expect(container.textContent).not.toMatch(/do not show/);
    expect(container.textContent).not.toMatch(/низкое соответствие/);
    expect(queryByText(/Риски/)).toBeNull();
  });

  it("renders nothing when feedback is null", () => {
    const { container } = render(<CandidateOverallReport feedback={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when summary is empty", () => {
    const { container } = render(<CandidateOverallReport feedback={{ summary: "" }} />);
    expect(container.textContent).toBe("");
  });
});