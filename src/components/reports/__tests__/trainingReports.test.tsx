import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmployerTrainingStageReport from "../EmployerTrainingStageReport";
import EmployerTrainingSummaryReport from "../EmployerTrainingSummaryReport";
import CandidateTrainingStageReport from "../CandidateTrainingStageReport";
import CandidateTrainingSummaryReport from "../CandidateTrainingSummaryReport";

describe("training reports", () => {
  it("employer stage renders structured summary first, not just questions", () => {
    render(
      <EmployerTrainingStageReport
        status="passed"
        score={85}
        max={100}
        passScore={70}
        summary={{
          summary: "Кандидат сдал этап.",
          strengths: ["Знает API"],
          gaps: ["Слабо в безопасности"],
          risks: [{ title: "Доступы", evidence: "Перепутал роль", severity: "средний" }],
          red_flags: [],
          items: [],
          recommendation: "Допустить",
        }}
        perQuestionLegacy={[{ id: "q1", score: 5, max: 5, question: "Что такое API?" }]}
      />,
    );
    expect(screen.getByText("Общий вывод")).toBeInTheDocument();
    expect(screen.getByText("Сильные стороны")).toBeInTheDocument();
    expect(screen.getByText("Допустить")).toBeInTheDocument();
  });

  it("candidate stage does NOT render employer-only fields", () => {
    render(
      <CandidateTrainingStageReport
        passed={true}
        score={85}
        max={100}
        passScore={70}
        summary={{
          summary: "Поздравляем!",
          strengths: ["Логика"],
          areas_to_improve: ["Скорость"],
          items: [],
          next_steps: ["Дальше"],
        }}
      />,
    );
    expect(screen.queryByText(/красные флаги/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/риски/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/рекомендация/i)).not.toBeInTheDocument();
    expect(screen.getByText("Что получилось")).toBeInTheDocument();
  });

  it("employer summary renders partial state with missing stages", () => {
    render(
      <EmployerTrainingSummaryReport
        report={{
          score: 60, data_completeness: 66, verdict: "частично готов",
          summary: "Частично готов.",
          completed_stages: ["Профессия", "Продукт"],
          missing_stages: ["Система"],
          mastered_topics: [], weak_topics: [],
          risks: [], red_flags: [], revision_plan: [],
          readiness: "", recommendation: "",
        }}
      />,
    );
    expect(screen.getByTestId("emp-training-summary")).toBeInTheDocument();
    expect(screen.getByText(/Система/i)).toBeInTheDocument();
  });

  it("candidate summary hides empty sections", () => {
    render(
      <CandidateTrainingSummaryReport
        report={{
          summary: "Готово.", completed_stages: ["Профессия"], missing_stages: [],
          strengths: [], topics_to_repeat: [], revision_plan: [], next_steps: ["Дальше"],
        }}
      />,
    );
    expect(screen.getByTestId("cand-training-summary")).toBeInTheDocument();
    expect(screen.queryByText("Сильные стороны")).not.toBeInTheDocument();
    expect(screen.getByText("Следующие шаги")).toBeInTheDocument();
  });
});