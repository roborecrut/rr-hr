/**
 * EmployerOverallReport — compact "management summary" UX tests.
 * The component is presentation-only: never triggers AI, never mutates JSON.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import EmployerOverallReport from "../EmployerOverallReport";
import CandidateOverallReport from "../CandidateOverallReport";

const fullEmployer = {
  fit_score: 78, confidence: 80, data_completeness: 90,
  verdict: "частичное соответствие",
  executive_summary:
    "Очень длинный управленческий текст ".repeat(40) +
    "с финальной мыслью, которую обязательно нужно скрыть до раскрытия подробного разбора.",
  stage_summary: [
    { stage: "resume", score: 70, conclusion: "ОК", key_evidence: ["3 года продукта"] },
    { stage: "checklist", score: 80, conclusion: "Сильно" },
    { stage: "situations", score: 60, conclusion: "Средне" },
    { stage: "training", score: 90, conclusion: "Отлично" },
  ],
  matches: [
    { criterion: "Python", degree: "полностью", evidence: "5 лет", source: "resume" },
    { criterion: "SQL", degree: "полностью", evidence: "опыт", source: "resume" },
    { criterion: "ML", degree: "полностью", evidence: "проекты", source: "resume" },
    { criterion: "DevOps", degree: "полностью", evidence: "k8s", source: "resume" },
    { criterion: "Лидерство", degree: "частично", evidence: "1 проект", source: "checklist" },
    { criterion: "Менторство", degree: "частично", evidence: "1 человек", source: "checklist" },
  ],
  gaps: [{ criterion: "Английский", finding: "Не подтверждён", impact: "Среднее", source: "resume" }],
  risks: [
    { title: "Малый стаж", evidence: "<1 год на роли", impact: "Стабильность", severity: "средний", how_to_verify: "Спросить" },
    { title: "Job-hopping", evidence: "3 места за 2 года", severity: "высокий" },
    { title: "Локация", evidence: "Удалённо", severity: "низкий" },
    { title: "Лишний риск", evidence: "x", severity: "низкий" },
  ],
  red_flags: [{ title: "Расхождение", evidence: "Противоречивые ответы", source: "situations", severity: "высокий" }],
  employer_wishes_alignment: [{ wish: "Гибкий график", status: "соответствует", evidence: "ок" }],
  strengths: ["Системное мышление", "Быстрая обучаемость", "Опыт продукта", "Лидерские задачи", "Аналитика"],
  interview_focus: [
    "Уточнить ожидания по зарплате",
    "Что обязательно проверить на финальном интервью по архитектуре",
    "Дата возможного выхода",
    "Готовность к гибридному графику",
  ],
  missing_sections: ["Обучение"],
  recommendation: "Рекомендуем продолжить с кандидатом — высокий потенциал, требуется уточнить ожидания и сроки выхода.",
};

describe("EmployerOverallReport — compact summary UX", () => {
  it("shows the compact top metrics (AI fit, avg, verdict, confidence, completeness)", () => {
    const { getByTestId, getByText } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    expect(getByTestId("ai-fit-score-card").textContent).toMatch(/78/);
    expect(getByTestId("avg-stage-score-card").textContent).toMatch(/64/);
    expect(getByText(/Вердикт/)).toBeTruthy();
    expect(getByText(/Уверенность AI/)).toBeTruthy();
    expect(getByText(/Полнота оценки/)).toBeTruthy();
  });

  it("renders a compact 'Вывод по кандидату' card (short text)", () => {
    const { getByTestId } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    const card = getByTestId("overall-verdict-card");
    expect(within(card).getByText(/Вывод по кандидату/)).toBeTruthy();
    // The card must stay short — ~one paragraph, not the whole executive summary.
    expect(card.textContent!.length).toBeLessThan(700);
  });

  it("limits the open part to ≤3 strengths and ≤3 risks", () => {
    const { getByTestId } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    const strengths = getByTestId("block-strengths").querySelectorAll("li");
    const risks = getByTestId("block-risks").querySelectorAll("li");
    expect(strengths.length).toBeLessThanOrEqual(3);
    expect(risks.length).toBeLessThanOrEqual(3);
  });

  it("renames the intake block to «Что уточнить при знакомстве»", () => {
    const { getByTestId } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    expect(within(getByTestId("block-intake")).getByText(/Что уточнить при знакомстве/)).toBeTruthy();
  });

  it("never shows re-interview / re-verification phrasing anywhere in the open part", () => {
    const { container, getByTestId } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    // Walk only the open part (everything BEFORE the collapsed details).
    const details = getByTestId("overall-details");
    const openPart = container.cloneNode(true) as HTMLElement;
    const detailsClone = openPart.querySelector('[data-testid="overall-details"]');
    detailsClone?.parentElement?.removeChild(detailsClone);
    const text = openPart.textContent || "";
    expect(text).not.toMatch(/финальн\w*\s+интервью/i);
    expect(text).not.toMatch(/повторн\w*\s+интервью/i);
    expect(text).not.toMatch(/дополнительн\w*\s+интервью/i);
    expect(text).not.toMatch(/перепровер/i);
    // The closed accordion still exists.
    expect(details).toBeTruthy();
  });

  it("never renders a 'Недостающие данные' / 'Недостаточно данных' block", () => {
    const { container } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    const text = container.textContent || "";
    expect(text).not.toMatch(/Недостающие данные/);
    expect(text).not.toMatch(/Недостаточно данных/);
    expect(text).not.toMatch(/Данные не предоставлены/);
    expect(text).not.toMatch(/Не удалось оценить/);
  });

  it("hides full executive_summary by default; reveals it only after expanding", () => {
    const longTail = "финальной мыслью, которую обязательно нужно скрыть";
    const { getByTestId, queryByText } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    // The exact tail string is part of the long summary and must NOT be in DOM.
    expect(queryByText(new RegExp(longTail))).toBeNull();
    // After expanding the top accordion AND the inner one — text becomes available.
    const top = getByTestId("overall-details");
    fireEvent.click(top.querySelector("summary")!);
    const exec = getByTestId("full-exec-summary");
    fireEvent.click(exec.querySelector("summary")!);
    expect(exec.textContent || "").toMatch(new RegExp(longTail));
  });

  it("uses Russian stage labels inside the details accordion (no English RESUME/CHECKLIST/…)", () => {
    const { getByTestId, container } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    fireEvent.click(getByTestId("overall-details").querySelector("summary")!);
    const text = container.textContent || "";
    expect(text).not.toMatch(/\bRESUME\b/);
    expect(text).not.toMatch(/\bCHECKLIST\b/);
    expect(text).not.toMatch(/\bSITUATIONS\b/);
    expect(text).not.toMatch(/\bTRAINING\b/);
    expect(text).toMatch(/Резюме|Анкета|Ситуации|Обучение/);
  });

  it("the top accordion is closed by default and contains the full saved arrays after opening", () => {
    const { getByTestId } = render(
      <EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />,
    );
    const acc = getByTestId("overall-details") as HTMLDetailsElement;
    expect(acc.open).toBe(false);
    fireEvent.click(acc.querySelector("summary")!);
    // After opening, full lists are reachable (strengths: 5 items inside "Все сильные стороны").
    expect(acc.textContent).toMatch(/Все сильные стороны/);
    expect(acc.textContent).toMatch(/Все риски/);
    expect(acc.textContent).toMatch(/Красные флаги/);
    expect(acc.textContent).toMatch(/Полный управленческий вывод/);
  });

  it("hides empty sections", () => {
    const minimal = {
      ...fullEmployer,
      risks: [], red_flags: [], gaps: [], strengths: [], interview_focus: [],
      employer_wishes_alignment: [], missing_sections: [],
      executive_summary: "", recommendation: "",
      matches: [], stage_summary: [],
    };
    const { queryByTestId } = render(
      <EmployerOverallReport fitScore={50} overallScore={50} employerFeedback={minimal} />,
    );
    expect(queryByTestId("block-strengths")).toBeNull();
    expect(queryByTestId("block-risks")).toBeNull();
    expect(queryByTestId("match-full")).toBeNull();
    expect(queryByTestId("match-partial")).toBeNull();
    expect(queryByTestId("match-gaps")).toBeNull();
  });

  it("does not white-screen on malformed / legacy JSON", () => {
    const cases: any[] = [null, undefined, "legacy-string", 42, [], { stage_summary: "not-array", risks: null }];
    for (const c of cases) {
      const { container } = render(
        <EmployerOverallReport fitScore={null} overallScore={null} employerFeedback={c} />,
      );
      expect(container.textContent && container.textContent.length).toBeTruthy();
    }
  });

  it("renders explicit empty state when employerFeedback is null", () => {
    const { getByTestId, getByText } = render(
      <EmployerOverallReport fitScore={null} overallScore={null} employerFeedback={null} />,
    );
    expect(getByTestId("overall-employer-empty")).toBeTruthy();
    expect(getByText(/Общая AI-оценка ещё не сформирована/)).toBeTruthy();
  });

  it("renders the saved ai_fit_score and overall_score unchanged", () => {
    const { getByTestId } = render(
      <EmployerOverallReport fitScore={42} overallScore={87} employerFeedback={fullEmployer} />,
    );
    expect(getByTestId("ai-fit-score-card").textContent).toMatch(/42/);
    expect(getByTestId("avg-stage-score-card").textContent).toMatch(/87/);
  });

  it("rendering does NOT trigger any AI / network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    render(<EmployerOverallReport fitScore={78} overallScore={64} employerFeedback={fullEmployer} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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