import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CandidateChecklistReport from "@/components/reports/CandidateChecklistReport";
import CandidateSituationsReport from "@/components/reports/CandidateSituationsReport";
import EmployerChecklistReport from "@/components/reports/EmployerChecklistReport";
import EmployerSituationsReport from "@/components/reports/EmployerSituationsReport";
import {
  adaptCandidateChecklist,
  adaptCandidateSituations,
  adaptEmployerChecklist,
  adaptEmployerSituations,
} from "@/lib/feedbackAdapters";

const fullRaw = {
  total: 75, summary: "OVERALL_SUMMARY",
  strengths: ["GOOD_THING"],
  areas_to_improve: ["IMPROVE_ME"],
  gaps: [{ criterion: "EmpCrit", finding: "EmpFinding" }],
  risks: [{ title: "RISK_TITLE", evidence: "RISK_EV", severity: "high", how_to_verify: "HOW_VER" }],
  red_flags: [{ title: "RED_TITLE", evidence: "RED_EV", severity: "high" }],
  items: [{
    question_id: "q1", question: "QUESTION_TEXT", score: 7,
    feedback: "CAND_FB", recommendation: "CAND_REC",
    expected_answer: "EXPECTED_SECRET",
    employer_feedback: "EMPLOYER_FB", evidence: "EVIDENCE_TXT",
  }],
};

describe("CandidateChecklistReport", () => {
  const v = adaptCandidateChecklist(fullRaw);
  it("renders summary, strengths, areas, items", () => {
    const { container } = render(<CandidateChecklistReport view={v} score={75} />);
    expect(screen.getByText("OVERALL_SUMMARY")).toBeInTheDocument();
    expect(screen.getByText("GOOD_THING")).toBeInTheDocument();
    expect(screen.getByText("IMPROVE_ME")).toBeInTheDocument();
    expect(screen.getByText(/QUESTION_TEXT/)).toBeInTheDocument();
    expect(screen.getByText("CAND_FB")).toBeInTheDocument();
    const html = container.innerHTML;
    expect(html).not.toContain("EXPECTED_SECRET");
    expect(html).not.toContain("EMPLOYER_FB");
    expect(html).not.toContain("EVIDENCE_TXT");
    expect(html).not.toContain("RISK_TITLE");
    expect(html).not.toContain("RED_TITLE");
  });
  it("legacy string renders without JSON brackets", () => {
    const lv = adaptCandidateChecklist("simple text");
    const { container } = render(<CandidateChecklistReport view={lv} score={50} />);
    expect(container.textContent).toContain("simple text");
    expect(container.innerHTML).not.toContain("{");
  });
});

describe("CandidateSituationsReport", () => {
  const v = adaptCandidateSituations(fullRaw);
  it("renders without employer risks / red flags", () => {
    const { container } = render(<CandidateSituationsReport view={v} score={60} />);
    expect(screen.getByText("OVERALL_SUMMARY")).toBeInTheDocument();
    const html = container.innerHTML;
    expect(html).not.toContain("RISK_TITLE");
    expect(html).not.toContain("RED_TITLE");
    expect(html).not.toContain("EMPLOYER_FB");
  });
});

describe("EmployerChecklistReport", () => {
  const v = adaptEmployerChecklist(fullRaw);
  it("renders summary, gaps, risks, red_flags, evidence", () => {
    render(<EmployerChecklistReport view={v} score={75} />);
    expect(screen.getByText("OVERALL_SUMMARY")).toBeInTheDocument();
    expect(screen.getByText("RISK_TITLE")).toBeInTheDocument();
    expect(screen.getByText("RED_TITLE")).toBeInTheDocument();
    expect(screen.getByText(/EmpCrit/)).toBeInTheDocument();
    expect(screen.getByText(/EVIDENCE_TXT/)).toBeInTheDocument();
  });
  it("hides empty sections", () => {
    const empty = adaptEmployerChecklist({ summary: "only-summary" });
    const { container } = render(<EmployerChecklistReport view={empty} />);
    expect(container.textContent).toContain("only-summary");
    expect(container.textContent).not.toContain("Риски");
    expect(container.textContent).not.toContain("Красные флаги");
  });
  it("legacy string renders safely (no JSON)", () => {
    const lv = adaptEmployerChecklist("legacy plain text");
    const { container } = render(<EmployerChecklistReport view={lv} />);
    expect(container.textContent).toContain("legacy plain text");
    expect(container.innerHTML).not.toContain("<pre");
  });
});

describe("EmployerSituationsReport", () => {
  const v = adaptEmployerSituations({
    ...fullRaw,
    items: [{ situation_id: "s1", title: "ST", score: 5, employer_feedback: "EMP_S_FB", evidence: "EVIDENCE_TXT" }],
  });
  it("renders risks/red_flags and evidence", () => {
    render(<EmployerSituationsReport view={v} score={60} />);
    expect(screen.getByText("RISK_TITLE")).toBeInTheDocument();
    expect(screen.getByText("RED_TITLE")).toBeInTheDocument();
    expect(screen.getByText(/EVIDENCE_TXT/)).toBeInTheDocument();
  });
  it("hides empty sections when no risks", () => {
    const v2 = adaptEmployerSituations({ summary: "S", items: [{ situation_id: "s1", title: "T", score: 1, employer_feedback: "ef" }] });
    const { container } = render(<EmployerSituationsReport view={v2} />);
    expect(container.textContent).not.toContain("Риски");
    expect(container.textContent).not.toContain("Красные флаги");
  });
});