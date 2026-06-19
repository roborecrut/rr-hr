/**
 * Regression: legacy `training_employer_feedback` rows can be a plain string,
 * or have non-array fields (strengths as string, risks as object). The old
 * employer training reports called `.map` on those directly, which threw and
 * blew up CandidateDetailsModal into a white screen. After Pass A-4 the
 * renderers normalize every list, so these payloads must render without
 * throwing.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import EmployerTrainingStageReport from "@/components/reports/EmployerTrainingStageReport";
import EmployerTrainingSummaryReport from "@/components/reports/EmployerTrainingSummaryReport";

describe("EmployerTrainingStageReport — legacy shapes", () => {
  it("renders when strengths/gaps are strings, risks are objects", () => {
    const summary: any = {
      summary: "ok",
      strengths: "знание продукта",
      gaps: { criterion: "опыт" },
      risks: { title: "low motivation", evidence: "" },
      red_flags: null,
      recommendation: 123,
    };
    expect(() =>
      render(
        <EmployerTrainingStageReport
          status="passed" score={80} max={100} passScore={70} summary={summary}
        />,
      ),
    ).not.toThrow();
  });

  it("renders when summary itself is null", () => {
    expect(() =>
      render(
        <EmployerTrainingStageReport
          status="in_progress" score={null} max={100} passScore={70} summary={null}
        />,
      ),
    ).not.toThrow();
  });
});

describe("EmployerTrainingSummaryReport — legacy shapes", () => {
  it("renders when report is a string (legacy text blob)", () => {
    expect(() =>
      render(<EmployerTrainingSummaryReport report={"legacy text" as any} />),
    ).not.toThrow();
  });

  it("renders when arrays are strings/objects/null", () => {
    const report: any = {
      score: "85", verdict: "ok", summary: 0,
      completed_stages: "professional",
      missing_stages: { stage: "product" },
      mastered_topics: null,
      weak_topics: ["loud voice", null, { name: "pacing" }],
      risks: "burnout",
      red_flags: { title: "lying", evidence: "x" },
      revision_plan: "повторить продукт",
    };
    expect(() => render(<EmployerTrainingSummaryReport report={report} />)).not.toThrow();
  });
});