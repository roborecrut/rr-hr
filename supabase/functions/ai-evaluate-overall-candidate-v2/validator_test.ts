import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateOverallCandidateReport } from "../_shared/ai-validators.ts";

function baseReport(over: Record<string, unknown> = {}): any {
  return {
    employer: {
      fit_score: 72, confidence: 80, data_completeness: 75,
      verdict: "частичное соответствие",
      executive_summary: "Опытный кандидат с релевантным бэкграундом, частично подтверждает требования по продуктовой работе.",
      stage_summary: [
        { stage: "resume", score: 70, conclusion: "Релевантный опыт.", key_evidence: ["3 года в продуктовых командах"] },
      ],
      matches: [
        { criterion: "Python", degree: "полностью", evidence: "5 лет коммерческого опыта", source: "resume" },
      ],
      gaps: [{ criterion: "Лидерство", finding: "Нет подтверждений", impact: "Среднее", source: "resume" }],
      risks: [{ title: "Малый стаж", evidence: "Меньше 2 лет на текущей роли", impact: "Возможна низкая стабильность", severity: "средний", how_to_verify: "Спросить мотивацию" }],
      red_flags: [],
      employer_wishes_alignment: [{ wish: "Гибкий график", status: "соответствует", evidence: "Готов к гибкому графику" }],
      strengths: ["Системное мышление"],
      interview_focus: ["Уточнить лидерский опыт"],
      missing_sections: [],
      recommendation: "Пригласить на финальное интервью.",
      ...((over as any).employer || {}),
    },
    candidate: {
      summary: "Спасибо за прохождение этапов. У вас сильные технические стороны и есть зоны роста.",
      strengths: ["Технические навыки"],
      areas_to_improve: ["Лидерство"],
      stage_feedback: [{ stage: "resume", conclusion: "Хорошее резюме." }],
      next_steps: ["Подготовиться к интервью"],
      missing_sections: [],
      ...((over as any).candidate || {}),
    },
  };
}

Deno.test("valid overall report passes", () => {
  const v = validateOverallCandidateReport(baseReport());
  assert(v.ok, (v as any).code);
});

Deno.test("fit_score out of range -> bad_fit_score", () => {
  const r = baseReport(); r.employer.fit_score = 120;
  const v = validateOverallCandidateReport(r);
  assert(!v.ok); assertEquals((v as any).code, "bad_fit_score");
});

Deno.test("bad verdict -> bad_verdict", () => {
  const r = baseReport(); r.employer.verdict = "одобрен";
  const v = validateOverallCandidateReport(r);
  assertEquals((v as any).code, "bad_verdict");
});

Deno.test("risk without evidence -> rejected", () => {
  const r = baseReport(); r.employer.risks = [{ title: "X", evidence: "", severity: "низкий" }];
  const v = validateOverallCandidateReport(r);
  assertEquals((v as any).code, "risk_without_evidence");
});

Deno.test("red flag without evidence -> rejected", () => {
  const r = baseReport();
  r.employer.red_flags = [{ title: "X", evidence: "", severity: "высокий" }];
  const v = validateOverallCandidateReport(r);
  assertEquals((v as any).code, "red_flag_without_evidence");
});

Deno.test("protected characteristic in employer summary -> rejected", () => {
  const r = baseReport();
  r.employer.executive_summary = "Кандидату 55 лет, возраст кандидата может влиять на адаптацию в молодой команде.";
  const v = validateOverallCandidateReport(r);
  assertEquals((v as any).code, "protected_characteristic");
});

Deno.test("candidate forbidden key risks -> rejected", () => {
  const r = baseReport();
  (r.candidate as any).risks = [{ title: "x" }];
  const v = validateOverallCandidateReport(r);
  assert(!v.ok); assert(String((v as any).code).startsWith("candidate_forbidden_"));
});

Deno.test("missing employer -> rejected", () => {
  const v = validateOverallCandidateReport({ candidate: { summary: "x".repeat(40) } });
  assertEquals((v as any).code, "missing_employer");
});

Deno.test("missing sections allowed (empty stages)", () => {
  const r = baseReport();
  r.employer.data_completeness = 25;
  r.employer.verdict = "недостаточно данных";
  r.employer.missing_sections = ["Анкета", "Ситуации"];
  r.candidate.missing_sections = ["Анкета", "Ситуации"];
  r.employer.stage_summary = [];
  r.employer.matches = [];
  r.employer.gaps = [];
  const v = validateOverallCandidateReport(r);
  assert(v.ok, (v as any).code);
});