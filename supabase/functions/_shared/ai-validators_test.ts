import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  combineChecklist20,
  validateChecklistChoice10,
  validateChecklistText10,
  validateSituations3,
  validateResumeScreenReport,
  detectProtectedCharacteristic,
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

function validReport(over: Record<string, any> = {}) {
  const base = {
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