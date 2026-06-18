import { describe, it, expect } from "vitest";
import {
  adaptCandidateChecklist,
  adaptCandidateSituations,
  adaptEmployerChecklist,
  adaptEmployerSituations,
} from "@/lib/feedbackAdapters";

const raw = {
  total: 75,
  summary: "Общий разбор",
  strengths: ["s1"],
  areas_to_improve: ["a1"],
  gaps: [{ criterion: "Опыт", finding: "мало" }],
  risks: [{ title: "R1", evidence: "ev", severity: "high", how_to_verify: "spr" }],
  red_flags: [{ title: "RF1", evidence: "rf-ev", severity: "low" }],
  items: [{
    question_id: "q1", question: "Q1", score: 8,
    feedback: "fb-cand", recommendation: "rec",
    expected_answer: "SECRET_EXPECTED",
    employer_feedback: "SECRET_EMPLOYER",
    evidence: "SECRET_EVIDENCE",
  }],
};

describe("adaptCandidateChecklist", () => {
  it("keeps candidate-facing fields, drops employer-only", () => {
    const v = adaptCandidateChecklist(raw);
    expect(v.kind).toBe("structured");
    expect(v.summary).toBe("Общий разбор");
    expect(v.strengths).toEqual(["s1"]);
    expect(v.areasToImprove).toEqual(["a1"]);
    expect(v.items[0]).toMatchObject({ questionId: "q1", question: "Q1", score: 8, feedback: "fb-cand" });
    const json = JSON.stringify(v);
    expect(json).not.toContain("SECRET_EXPECTED");
    expect(json).not.toContain("SECRET_EMPLOYER");
    expect(json).not.toContain("SECRET_EVIDENCE");
    expect(json).not.toContain("R1");
    expect(json).not.toContain("RF1");
  });

  it("unknown JSON does NOT leak as raw text", () => {
    const v = adaptCandidateChecklist({ unknown_field: "xx", risks: [{}] });
    expect(v.kind).toBe("empty");
  });

  it("legacy string becomes safe text", () => {
    const v = adaptCandidateChecklist("plain text feedback");
    expect(v.kind).toBe("legacy_text");
    expect(v.legacyText).toBe("plain text feedback");
  });
});

describe("adaptCandidateSituations", () => {
  it("drops criteria / employer risks / red flags", () => {
    const v = adaptCandidateSituations({
      summary: "S",
      items: [{ situation_id: "s1", title: "T", score: 5, feedback: "fb",
        criteria: "SECRET_CRIT", employer_feedback: "SECRET_EMP" }],
      risks: [{ title: "RX", evidence: "e" }],
      red_flags: [{ title: "RFX", evidence: "e" }],
    });
    const json = JSON.stringify(v);
    expect(json).not.toContain("SECRET_CRIT");
    expect(json).not.toContain("SECRET_EMP");
    expect(json).not.toContain("RX");
    expect(json).not.toContain("RFX");
  });
});

describe("adaptEmployerChecklist", () => {
  it("preserves risks, red_flags, gaps, evidence", () => {
    const v = adaptEmployerChecklist(raw);
    expect(v.kind).toBe("structured");
    expect(v.risks).toHaveLength(1);
    expect(v.redFlags).toHaveLength(1);
    expect(v.gaps).toHaveLength(1);
    expect(v.items[0].evidence).toBe("SECRET_EVIDENCE");
    expect(v.items[0].employerFeedback).toBe("SECRET_EMPLOYER");
  });
});

describe("adaptEmployerSituations", () => {
  it("preserves risks and red_flags", () => {
    const v = adaptEmployerSituations({
      summary: "S",
      items: [{ situation_id: "s1", title: "T", score: 5, employer_feedback: "ef", evidence: "ev" }],
      risks: [{ title: "R", evidence: "e" }],
      red_flags: [{ title: "RF", evidence: "e" }],
    });
    expect(v.risks).toHaveLength(1);
    expect(v.redFlags).toHaveLength(1);
    expect(v.items[0].evidence).toBe("ev");
  });
});