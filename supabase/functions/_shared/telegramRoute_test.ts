import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  safeRedirect,
  safeNextPath,
  chooseCandidateTarget,
  isAllowedHost,
} from "./telegramRoute.ts";

Deno.test("isAllowedHost: whitelist", () => {
  assert(isAllowedHost("hr-rr.online"));
  assert(isAllowedHost("www.hr-rr.ru"));
  assert(isAllowedHost("preview--x.lovable.app"));
  assert(isAllowedHost("foo.lovableproject.com"));
  assert(!isAllowedHost("evil.com"));
  assert(!isAllowedHost("hr-rr.online.evil.com"));
});

Deno.test("safeRedirect: rejects empty", () => {
  const r = safeRedirect(null);
  assert(r.rejected);
  assertEquals(r.reason, "empty");
  assertEquals(r.url.origin, "https://hr-rr.online");
});

Deno.test("safeRedirect: rejects http protocol", () => {
  const r = safeRedirect("http://hr-rr.online/x");
  assert(r.rejected);
  assertEquals(r.reason, "bad_protocol");
});

Deno.test("safeRedirect: rejects unknown host", () => {
  const r = safeRedirect("https://evil.com/landing");
  assert(r.rejected);
  assertEquals(r.reason, "host_not_allowed");
  assertEquals(r.url.origin, "https://hr-rr.online");
});

Deno.test("safeRedirect: rejects garbage", () => {
  const r = safeRedirect("not a url");
  assert(r.rejected);
  assertEquals(r.reason, "parse_error");
});

Deno.test("safeRedirect: accepts whitelisted with path/search", () => {
  const r = safeRedirect("https://hr-rr.online/acme/dev-job?ref=emp1");
  assert(!r.rejected);
  assertEquals(r.url.pathname, "/acme/dev-job");
  assertEquals(r.url.search, "?ref=emp1");
});

Deno.test("safeNextPath: same-origin absolute → path", () => {
  assertEquals(
    safeNextPath("https://hr-rr.online/acme/dev-job", "https://hr-rr.online"),
    "/acme/dev-job",
  );
});

Deno.test("safeNextPath: cross-origin → null", () => {
  assertEquals(
    safeNextPath("https://evil.com/x", "https://hr-rr.online"),
    null,
  );
});

Deno.test("safeNextPath: rejects protocol-relative", () => {
  assertEquals(safeNextPath("//evil.com", "https://hr-rr.online"), null);
});

Deno.test("safeNextPath: rejects OIDC bounce", () => {
  assertEquals(
    safeNextPath("/auth/telegram/done", "https://hr-rr.online"),
    null,
  );
});

Deno.test("safeNextPath: passes plain path", () => {
  assertEquals(safeNextPath("/acme/dev", "https://hr-rr.online"), "/acme/dev");
});

// e2e-style routing matrix for candidate after Telegram OIDC.
const FALLBACK = "/candidate123/profile";

Deno.test("candidate: 0 vacancies + no next → profile fallback", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 0, firstPublicId: null, nextPath: null, profileFallback: FALLBACK,
  });
  assertEquals(d.target, FALLBACK);
  assertEquals(d.reason, "fallback_profile");
});

Deno.test("candidate: 0 vacancies + next → next (landing)", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 0, firstPublicId: null,
    nextPath: "/acme/dev-job", profileFallback: FALLBACK,
  });
  assertEquals(d.target, "/acme/dev-job");
  assertEquals(d.reason, "no_vacancy_next");
});

Deno.test("candidate: 1 vacancy + next → back to landing", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 1, firstPublicId: "555555",
    nextPath: "/acme/dev-job", profileFallback: FALLBACK,
  });
  assertEquals(d.target, "/acme/dev-job");
  assertEquals(d.reason, "single_vacancy_next");
});

Deno.test("candidate: 1 vacancy + no next → fallback profile", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 1, firstPublicId: "555555",
    nextPath: null, profileFallback: FALLBACK,
  });
  assertEquals(d.target, FALLBACK);
  assertEquals(d.reason, "fallback_profile");
});

Deno.test("candidate: 2+ vacancies → general candidate profile (ignores next)", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 3, firstPublicId: "555555",
    nextPath: "/acme/dev-job", profileFallback: FALLBACK,
  });
  assertEquals(d.target, "/candidate555555/profile");
  assertEquals(d.reason, "multi_vacancy_profile");
});

Deno.test("candidate: 2+ vacancies with missing public_id → /main", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 2, firstPublicId: null,
    nextPath: null, profileFallback: FALLBACK,
  });
  assertEquals(d.target, "/main");
});