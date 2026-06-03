import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  safeRedirect,
  safeNextPath,
  safeNextPathStrict,
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

// ─── safeRedirect: extra edge cases ───
Deno.test("safeRedirect: rejects non-443 port", () => {
  const r = safeRedirect("https://hr-rr.online:8443/x");
  assert(r.rejected);
  assertEquals(r.reason, "bad_port");
});

Deno.test("safeRedirect: rejects userinfo", () => {
  const r = safeRedirect("https://user:pass@hr-rr.online/x");
  assert(r.rejected);
  assertEquals(r.reason, "has_userinfo");
});

Deno.test("safeRedirect: case-insensitive scheme/host accepted", () => {
  const r = safeRedirect("HTTPS://HR-RR.ONLINE/x?ref=1");
  assert(!r.rejected);
  assertEquals(r.url.hostname, "hr-rr.online");
  assertEquals(r.url.pathname, "/x");
});

// ─── safeNextPathStrict: detailed reason coverage ───
Deno.test("safeNextPathStrict: javascript scheme", () => {
  const r = safeNextPathStrict("javascript:alert(1)", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "bad_scheme");
});

Deno.test("safeNextPathStrict: data scheme", () => {
  const r = safeNextPathStrict("data:text/html,<script>1</script>", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "bad_scheme");
});

Deno.test("safeNextPathStrict: percent-encoded traversal", () => {
  const r = safeNextPathStrict("/%2e%2e/admin", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "decoded_traversal");
});

Deno.test("safeNextPathStrict: double-encoded traversal", () => {
  const r = safeNextPathStrict("/%252e%252e/admin", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "decoded_traversal");
});

Deno.test("safeNextPathStrict: null byte", () => {
  const r = safeNextPathStrict("/foo%00bar", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "bad_encoding");
});

Deno.test("safeNextPathStrict: backslash protocol-relative", () => {
  const r = safeNextPathStrict("\\\\evil.com", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "protocol_relative");
});

Deno.test("safeNextPathStrict: bare dot segment", () => {
  const r = safeNextPathStrict("/a/./b", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "path_traversal");
});

Deno.test("safeNextPathStrict: disallowed /api/ prefix", () => {
  const r = safeNextPathStrict("/api/secret", "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "disallowed_path");
});

Deno.test("safeNextPathStrict: too long", () => {
  const r = safeNextPathStrict("/" + "a".repeat(1100), "https://hr-rr.online");
  assert(r.rejected);
  assertEquals(r.reason, "too_long");
});

Deno.test("safeNextPathStrict: ok with query string", () => {
  const r = safeNextPathStrict("/landing?ref=emp123456", "https://hr-rr.online");
  assert(!r.rejected);
  assertEquals(r.value, "/landing?ref=emp123456");
});

// ─── chooseCandidateTarget: matrix coverage ───
Deno.test("chooseCandidateTarget: negative vacancyCount falls through", () => {
  const d = chooseCandidateTarget({
    vacancyCount: -1, firstPublicId: null, nextPath: null, profileFallback: "/p",
  });
  assertEquals(d.target, "/p");
  assertEquals(d.reason, "fallback_profile");
});

Deno.test("chooseCandidateTarget: multi with empty firstPublicId → /main", () => {
  const d = chooseCandidateTarget({
    vacancyCount: 2, firstPublicId: "", nextPath: "/x", profileFallback: "/p",
  });
  assertEquals(d.target, "/main");
});

Deno.test("chooseCandidateTarget: matrix 0/1/2/3 × next", () => {
  const matrix = [
    { v: 0, n: null,  pid: "pid", expect: "/p" },
    { v: 0, n: "/x",  pid: "pid", expect: "/x" },
    { v: 1, n: null,  pid: "pid", expect: "/p" },
    { v: 1, n: "/x",  pid: "pid", expect: "/x" },
    { v: 2, n: "/x",  pid: "pid", expect: "/candidatepid/profile" },
    { v: 3, n: null,  pid: "pid", expect: "/candidatepid/profile" },
  ];
  for (const m of matrix) {
    const d = chooseCandidateTarget({
      vacancyCount: m.v, firstPublicId: m.pid, nextPath: m.n, profileFallback: "/p",
    });
    assertEquals(d.target, m.expect, `v=${m.v} n=${m.n}`);
  }
});

// Legacy safeNextPath still returns string|null
Deno.test("safeNextPath legacy: still works", () => {
  assertEquals(safeNextPath("/ok", "https://hr-rr.online"), "/ok");
  assertEquals(safeNextPath("javascript:1", "https://hr-rr.online"), null);
});