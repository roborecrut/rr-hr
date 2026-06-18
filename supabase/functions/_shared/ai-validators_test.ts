import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  combineChecklist20,
  validateChecklistChoice10,
  validateChecklistText10,
  validateSituations3,
  validateResumeScreenReport,
  detectProtectedCharacteristic,
  validateChecklistGradeReport,
  validateSituationsGradeReport,
} from "./ai-validators.ts";
import { canonicalJsonStringify, isTerminalStatus } from "./ai-jobs.ts";

const choice = (id: string) => ({
  id, type: "choice", question: `Q ${id}`, options: ["a", "b", "c", "d"], correct: "a",
});
const text = (id: string) => ({
  id, type: "text", question: `Q ${id}`, expected_answer: `A ${id} reply`,
});
const sit = (id: string) => ({
  id, title: "Звонок клиенту", brief: "Контекст ситуации", criteria: "1; 2; 3",
});

Deno.test("choice: exactly 10 valid", () => {
  const arr = Array.from({ length: 10 }, (_, i) => choice(`c${i + 1}`));
  const r = validateChecklistChoice10(arr);
  assertEquals(r.ok, true);
});

Deno.test("choice: 9 rejected", () => {
  const arr = Array.from({ length: 9 }, (_, i) => choice(`c${i + 1}`));
  const r = validateChecklistChoice10(arr);
  assertEquals(r.ok, false);
});

Deno.test("choice: correct outside options rejected", () => {
  const arr = Array.from({ length: 10 }, (_, i) => choice(`c${i + 1}`));
  (arr[3] as any).correct = "ZZZ";
  const r = validateChecklistChoice10(arr);
  assertEquals(r.ok, false);
});

Deno.test("choice: duplicate id rejected", () => {
  const arr = Array.from({ length: 10 }, (_, i) => choice(`c${i + 1}`));
  (arr[5] as any).id = "c1";
  const r = validateChecklistChoice10(arr);
  assertEquals(r.ok, false);
});

Deno.test("choice: 3 options rejected", () => {
  const arr = Array.from({ length: 10 }, (_, i) => choice(`c${i + 1}`));
  (arr[0] as any).options = ["a", "b", "c"];
  const r = validateChecklistChoice10(arr);
  assertEquals(r.ok, false);
});

Deno.test("text: 11 rejected", () => {
  const arr = Array.from({ length: 11 }, (_, i) => text(`t${i + 1}`));
  const r = validateChecklistText10(arr);
  assertEquals(r.ok, false);
});

Deno.test("text: empty expected rejected", () => {
  const arr = Array.from({ length: 10 }, (_, i) => text(`t${i + 1}`));
  (arr[2] as any).expected_answer = "";
  const r = validateChecklistText10(arr);
  assertEquals(r.ok, false);
});

Deno.test("combine: 10+10 → 20 with q1..q20", () => {
  const c = Array.from({ length: 10 }, (_, i) => choice(`c${i + 1}`)) as any;
  const t = Array.from({ length: 10 }, (_, i) => text(`t${i + 1}`)) as any;
  const cv = validateChecklistChoice10(c);
  const tv = validateChecklistText10(t);
  if (!cv.ok || !tv.ok) throw new Error("setup");
  const combined = combineChecklist20(cv.value, tv.value);
  assertEquals(combined.length, 20);
  assertEquals(combined[0].id, "q1");
  assertEquals(combined[10].id, "q11");
  assertEquals(combined[19].id, "q20");
});

Deno.test("situations: exactly 3 valid", () => {
  const r = validateSituations3([sit("s1"), sit("s2"), sit("s3")]);
  assertEquals(r.ok, true);
});

Deno.test("situations: 2 rejected", () => {
  const r = validateSituations3([sit("s1"), sit("s2")]);
  assertEquals(r.ok, false);
});

Deno.test("situations: 4 rejected", () => {
  const r = validateSituations3([sit("s1"), sit("s2"), sit("s3"), sit("s4" as any)]);
  assertEquals(r.ok, false);
});

Deno.test("situations: empty criteria rejected", () => {
  const r = validateSituations3([sit("s1"), { ...sit("s2"), criteria: "" }, sit("s3")]);
  assertEquals(r.ok, false);
});

Deno.test("situations: bad id rejected", () => {
  const r = validateSituations3([sit("s1"), sit("xx" as any), sit("s3")]);
  assertEquals(r.ok, false);
});

Deno.test("isTerminalStatus correctness", () => {
  assertEquals(isTerminalStatus("primary_succeeded"), true);
  assertEquals(isTerminalStatus("fallback_succeeded"), true);
  assertEquals(isTerminalStatus("save_failed"), true);
  assertEquals(isTerminalStatus("validation_failed"), true);
  assertEquals(isTerminalStatus("cancelled"), true);
  assertEquals(isTerminalStatus("primary_running"), false);
  assertEquals(isTerminalStatus("created"), false);
  assertEquals(isTerminalStatus(undefined), false);
});

Deno.test("canonicalJsonStringify is stable across key order", () => {
  const a = canonicalJsonStringify({ b: 1, a: { y: [1, 2], x: "s" } });
  const b = canonicalJsonStringify({ a: { x: "s", y: [1, 2] }, b: 1 });
  assertEquals(a, b);
});

// ---------------- ResumeScreenReport v2 ----------------

function validReport(over: Record<string, any> = {}): any {
  const base: any = {
    score: 72,
    employer: {
      verdict: "частичное соответствие",
      summary: "Кандидат закрывает половину ключевых требований, есть пробелы по продажам B2B.",
      matches: [
        { criterion: "Опыт холодных звонков", degree: "полностью", evidence: "5 лет в колл-центре" },
      ],
      gaps: [
        { criterion: "Опыт B2B-продаж", finding: "Не указано", impact: "Критично для роли" },
      ],
      strengths: ["Системное мышление"],
      risks: [
        { title: "Частая смена работы", evidence: "5 мест за 3 года", severity: "средний", how_to_verify: "Спросить на интервью" },
      ],
      red_flags: [],
      questions_to_verify: ["Опишите конкретную сделку B2B"],
    },
    candidate: {
      summary: "Спасибо за резюме! Видно сильную базу в продажах, давайте уточним опыт B2B.",
      strengths: ["Опыт колл-центра"],
      areas_to_clarify: ["Опыт B2B"],
      recommendations: ["Добавить конкретные цифры результатов"],
    },
    ...over,
  };
  return base;
}

Deno.test("resume v2: valid report passes", () => {
  const r = validateResumeScreenReport(validReport());
  assertEquals(r.ok, true);
});

Deno.test("resume v2: bad verdict rejected", () => {
  const r = validateResumeScreenReport(validReport({ employer: { ...validReport().employer, verdict: "идеально" } }));
  assertEquals(r.ok, false);
});

Deno.test("resume v2: score out of range rejected", () => {
  const r = validateResumeScreenReport(validReport({ score: 150 }));
  assertEquals(r.ok, false);
});

Deno.test("resume v2: risk without evidence rejected", () => {
  const bad = validReport();
  bad.employer.risks = [{ title: "Что-то", evidence: "", severity: "низкий", how_to_verify: "" }];
  const r = validateResumeScreenReport(bad);
  assertEquals(r.ok, false);
});

Deno.test("resume v2: red_flag without evidence rejected", () => {
  const bad = validReport();
  bad.employer.red_flags = [{ title: "Подозрительно", evidence: "", severity: "высокий" }];
  const r = validateResumeScreenReport(bad);
  assertEquals(r.ok, false);
});

Deno.test("resume v2: match with bad degree rejected", () => {
  const bad = validReport();
  bad.employer.matches[0].degree = "очень круто";
  const r = validateResumeScreenReport(bad);
  assertEquals(r.ok, false);
});

Deno.test("resume v2: missing candidate block rejected", () => {
  const bad: any = validReport();
  delete bad.candidate;
  const r = validateResumeScreenReport(bad);
  assertEquals(r.ok, false);
});

Deno.test("resume v2: protected characteristic in evidence rejected (age)", () => {
  const bad = validReport();
  bad.employer.risks = [
    { title: "Возраст", evidence: "Кандидату 52 лет, может не подойти", severity: "средний", how_to_verify: "" },
  ];
  const r = validateResumeScreenReport(bad);
  assertEquals(r.ok, false);
});

Deno.test("resume v2: protected characteristic in summary rejected (religion)", () => {
  const bad = validReport({
    employer: {
      ...validReport().employer,
      summary: "Кандидат православный, рекомендую отказать. ".repeat(2),
    },
  });
  const r = validateResumeScreenReport(bad);
  assertEquals(r.ok, false);
});

Deno.test("resume v2: detectProtectedCharacteristic finds gender mention", () => {
  const hit = detectProtectedCharacteristic("Кандидат — женщина, что важно");
  assertEquals(typeof hit, "string");
});

Deno.test("resume v2: candidate report has no employer-only fields after validation", () => {
  const r = validateResumeScreenReport(validReport());
  if (!r.ok) throw new Error("setup");
  const c = r.value.candidate as any;
  assertEquals("verdict" in c, false);
  assertEquals("risks" in c, false);
  assertEquals("red_flags" in c, false);
  assertEquals("questions_to_verify" in c, false);
  assertEquals("matches" in c, false);
});

// =============================================================================
// Checklist Grade Report v2 validator tests
// =============================================================================

const CK_ALLOWED = ["q1","q2","q3"];
function validChecklist(): any {
  return {
    total: 72,
    employer: {
      summary: "Кандидат показал уверенное знание процесса продаж и работу с возражениями.",
      strengths: ["структурное мышление"],
      gaps: [{ criterion: "CRM", finding: "не упомянул HubSpot", impact: "средний" }],
      risks: [{ title: "Опыт холодных звонков", evidence: "ответ обтекаемый", severity: "средний", how_to_verify: "ролевая ситуация" }],
      red_flags: [{ title: "Противоречие в стаже", evidence: "сначала 2 года, потом 4", severity: "средний" }],
      items: [
        { question_id: "q1", score: 80, employer_feedback: "Развёрнутый ответ по этапам воронки.", evidence: "перечислил 5 этапов" },
        { question_id: "q2", score: 60, employer_feedback: "Поверхностный ответ.", evidence: "одно предложение" },
        { question_id: "q3", score: 90, employer_feedback: "Чёткий ответ с примером.", evidence: "пример из практики" },
      ],
    },
    candidate: {
      summary: "Вы хорошо описали воронку продаж и привели пример работы с возражениями.",
      strengths: ["структурное мышление"],
      areas_to_improve: ["глубже раскрывать второй вопрос"],
      items: [
        { question_id: "q1", score: 80, feedback: "Хороший развёрнутый ответ.", recommendation: "добавить метрики" },
        { question_id: "q2", score: 60, feedback: "Слишком кратко.", recommendation: "приведите 2-3 примера" },
        { question_id: "q3", score: 90, feedback: "Отличный пример.", recommendation: "сохранить такой подход" },
      ],
    },
  };
}

Deno.test("checklist v2: valid report passes", () => {
  const r = validateChecklistGradeReport(validChecklist(), { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, true);
});
Deno.test("checklist v2: total out of range rejected", () => {
  const o = validChecklist(); o.total = 150;
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: unknown question_id rejected", () => {
  const o = validChecklist(); o.employer.items[0].question_id = "qXX";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: duplicate question_id rejected", () => {
  const o = validChecklist(); o.employer.items[1].question_id = "q1";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: risk without evidence rejected", () => {
  const o = validChecklist(); o.employer.risks[0].evidence = "";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: red_flag without evidence rejected", () => {
  const o = validChecklist(); o.employer.red_flags[0].evidence = "";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: candidate with employer-only field rejected", () => {
  const o = validChecklist(); o.candidate.risks = [{ title: "x" }];
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: protected characteristic rejected", () => {
  const o = validChecklist();
  o.employer.summary = "Кандидат — женщина, поэтому будут сложности с командировками. Полная характеристика.";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: expected_answer leak to candidate rejected", () => {
  const o = validChecklist();
  const expected = "пять этапов воронки: квалификация лид пресейл коммерция закрытие";
  o.candidate.items[0].feedback = `Правильный ответ: ${expected}. Старайтесь так же.`;
  const r = validateChecklistGradeReport(o, {
    allowedQuestionIds: CK_ALLOWED,
    expectedAnswers: { q1: expected },
  });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: missing employer summary rejected", () => {
  const o = validChecklist(); o.employer.summary = "";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("checklist v2: missing candidate summary rejected", () => {
  const o = validChecklist(); o.candidate.summary = "";
  const r = validateChecklistGradeReport(o, { allowedQuestionIds: CK_ALLOWED });
  assertEquals(r.ok, false);
});

// =============================================================================
// Situations Grade Report v2 validator tests
// =============================================================================

const SIT_ALLOWED = ["s1","s2","s3"];
function validSituations(): any {
  return {
    total: 65,
    employer: {
      summary: "Кандидат демонстрирует базовые навыки переговоров и эмпатию в сложных ситуациях.",
      demonstrated_competencies: ["эмпатия", "структурный диалог"],
      weak_competencies: ["работа с эскалацией"],
      risks: [{ title: "Эскалация", evidence: "не предложил руководителя", severity: "средний", how_to_verify: "повторная роль" }],
      red_flags: [{ title: "Конфликтность", evidence: "повышение тона в ответе s2", severity: "средний" }],
      items: [
        { situation_id: "s1", score: 70, employer_feedback: "Адекватная реакция на возражение.", evidence: "сослался на условия" },
        { situation_id: "s2", score: 50, employer_feedback: "Слабая эскалация.", evidence: "не передал руководителю" },
        { situation_id: "s3", score: 75, employer_feedback: "Хорошо удержал клиента.", evidence: "предложил скидку" },
      ],
    },
    candidate: {
      summary: "Вы хорошо справились с двумя ситуациями, в третьей стоит чётче управлять эскалацией.",
      strengths: ["эмпатия"],
      areas_to_improve: ["управление эскалацией"],
      items: [
        { situation_id: "s1", score: 70, feedback: "Хорошая реакция.", recommendation: "добавить сверку фактов" },
        { situation_id: "s2", score: 50, feedback: "Не хватило структуры.", recommendation: "используйте SLA" },
        { situation_id: "s3", score: 75, feedback: "Удержали клиента.", recommendation: "проговорите риски" },
      ],
    },
  };
}

Deno.test("situations v2: valid report passes", () => {
  const r = validateSituationsGradeReport(validSituations(), { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, true);
});
Deno.test("situations v2: total out of range rejected", () => {
  const o = validSituations(); o.total = -5;
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: unknown situation_id rejected", () => {
  const o = validSituations(); o.employer.items[0].situation_id = "sX";
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: duplicate situation_id rejected", () => {
  const o = validSituations(); o.employer.items[1].situation_id = "s1";
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: risk without evidence rejected", () => {
  const o = validSituations(); o.employer.risks[0].evidence = "";
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: red_flag without evidence rejected", () => {
  const o = validSituations(); o.employer.red_flags[0].evidence = "";
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: candidate with employer-only field rejected", () => {
  const o = validSituations(); o.candidate.red_flags = [{ title: "x" }];
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: protected characteristic rejected", () => {
  const o = validSituations();
  o.employer.summary = "Кандидату 55 лет и это сильно мешает гибкости. Полная характеристика для отчёта.";
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});
Deno.test("situations v2: missing summary rejected", () => {
  const o = validSituations(); o.employer.summary = "";
  const r = validateSituationsGradeReport(o, { allowedSituationIds: SIT_ALLOWED });
  assertEquals(r.ok, false);
});