import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  combineChecklist20,
  validateChecklistChoice10,
  validateChecklistText10,
  validateSituations3,
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