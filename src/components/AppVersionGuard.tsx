/**
 * AppVersionGuard — silent safe update strategy.
 * --------------------------------------------------
 * • Polls /version.json (stable build version) every 5 min — never hashes HTML.
 * • On new version: sets `update_pending` in localStorage, then waits for a
 *   SAFE moment before doing a single silent `location.reload()`.
 * • SAFE = public/login/logout route, OR user is idle >90s on a non-critical
 *   authenticated route with no dirty forms and no pending requests.
 * • Never touches Supabase auth/session/role keys. Never calls
 *   localStorage.clear(). Never shows UI.
 * • Protects against reload loops via `last_reloaded_version`.
 * • One-time defensive unregister of leftover service workers (no reload).
 */
import { useEffect, useRef } from "react";

declare const __APP_VERSION__: string;

const PENDING_KEY = "rr_update_pending";
const PENDING_VERSION_KEY = "rr_update_pending_version";
const LAST_RELOADED_KEY = "rr_last_reloaded_version";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_MS = 90 * 1000;

const CRITICAL_ROUTE_PATTERNS: RegExp[] = [
  /\/onboarding(\/|$)/i,
  /\/companies\/(new|[^/]+\/edit)/i,
  /\/vacancies\/(new|[^/]+\/edit)/i,
  /\/candidates(\/|$)/i,
  /\/interviews?(\/|$)/i,
  /\/billing\/payment(\/|$)/i,
  /\/setup(\/|$)/i,
  // employer/candidate cabinet sub-flows that mutate data
  /\/emp\d+\/(vacancy|vacancies|candidate|candidates|interview|onboarding|training|company|billing|payment)/i,
  /\/cand\d+\/(interview|training|onboarding)/i,
];

const PUBLIC_ROUTE_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/main$/,
  /^\/auth$/,
  /^\/login$/,
  /^\/register$/,
  /^\/offer$/,
  /^\/blog/,
  /^\/faq$/,
  /^\/demo$/,
  /^\/vacancy/,
  /^\/vacancies$/,
  /^\/job$/,
  /^\/company\//,
  /^\/payment\/(success|fail)$/,
];

function isPublicRoute(p: string) {
  return PUBLIC_ROUTE_PATTERNS.some((r) => r.test(p));
}
function isCriticalRoute(p: string) {
  return CRITICAL_ROUTE_PATTERNS.some((r) => r.test(p));
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.version === "string" ? j.version : null;
  } catch {
    return null;
  }
}

async function unregisterStaleServiceWorkers() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try { await reg.unregister(); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export default function AppVersionGuard() {
  const reloadedRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const pendingRequestsRef = useRef<number>(0);

  useEffect(() => {
    // One-time SW cleanup, no reload.
    unregisterStaleServiceWorkers();

    if (!import.meta.env.PROD) return;

    const currentVersion =
      typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

    // ---- activity tracking ----
    const bumpActivity = () => { lastActivityRef.current = Date.now(); };
    const activityEvents = ["click", "keydown", "input", "scroll", "pointerdown", "touchstart"];
    for (const e of activityEvents) {
      window.addEventListener(e, bumpActivity, { passive: true, capture: true });
    }

    // ---- pending-request tracking (fetch monkeypatch) ----
    const origFetch = window.fetch.bind(window);
    const wrappedFetch: typeof fetch = (input, init) => {
      pendingRequestsRef.current++;
      return origFetch(input as any, init).finally(() => {
        pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
      });
    };
    window.fetch = wrappedFetch;

    // ---- dirty form detection ----
    const hasDirtyForm = (): boolean => {
      try {
        if ((window as any).__rrDirty === true) return true;
        if (document.querySelector("[data-dirty='true'], [data-unsaved='true']")) return true;
        // Any text-like input with a non-empty value that the user typed into
        const ae = document.activeElement as HTMLElement | null;
        if (ae) {
          const tag = ae.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable) return true;
        }
        // Forms with modified inputs
        const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input, textarea"
        );
        for (const el of Array.from(inputs)) {
          const def = (el as any).defaultValue ?? "";
          if ((el.value ?? "") !== def && (el.value ?? "").length > 0) return true;
        }
      } catch { /* ignore */ }
      return false;
    };

    const isSafeToReload = (route: string): { safe: boolean; reason: string } => {
      if (isPublicRoute(route)) return { safe: true, reason: "public-route" };
      if (isCriticalRoute(route)) return { safe: false, reason: "critical-route" };
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs < IDLE_MS) return { safe: false, reason: `not-idle(${Math.round(idleMs / 1000)}s)` };
      if (pendingRequestsRef.current > 0)
        return { safe: false, reason: `pending-requests(${pendingRequestsRef.current})` };
      if (hasDirtyForm()) return { safe: false, reason: "dirty-form" };
      return { safe: true, reason: "idle-neutral" };
    };

    const doReload = (reason: string, latestVersion: string) => {
      if (reloadedRef.current) return;
      const last = localStorage.getItem(LAST_RELOADED_KEY);
      if (last === latestVersion) {
        // Already tried reloading to this version — avoid loop.
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(PENDING_VERSION_KEY);
        return;
      }
      reloadedRef.current = true;
      localStorage.setItem(LAST_RELOADED_KEY, latestVersion);
      localStorage.removeItem(PENDING_KEY);
      localStorage.removeItem(PENDING_VERSION_KEY);
      console.info("[AppVersionGuard] silent reload", { reason, latestVersion });
      try { window.location.reload(); } catch { /* ignore */ }
    };

    const attemptReloadIfPending = () => {
      const pending = localStorage.getItem(PENDING_KEY) === "1";
      if (!pending) return;
      const latest = localStorage.getItem(PENDING_VERSION_KEY) || "";
      if (!latest || latest === currentVersion) {
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(PENDING_VERSION_KEY);
        return;
      }
      const route = window.location.pathname;
      const { safe, reason } = isSafeToReload(route);
      console.debug("[AppVersionGuard] check", {
        currentVersion, latestVersion: latest,
        update_pending: true, safeToReload: safe, reloadReason: reason,
        isIdle: Date.now() - lastActivityRef.current >= IDLE_MS,
        isDirtyForm: hasDirtyForm(),
        hasPendingRequests: pendingRequestsRef.current > 0,
        route,
      });
      if (safe) doReload(reason, latest);
    };

    const checkVersion = async () => {
      if (reloadedRef.current) return;
      const latest = await fetchLatestVersion();
      if (!latest) return;
      if (latest === currentVersion) return;
      // Mark pending (idempotent).
      localStorage.setItem(PENDING_KEY, "1");
      localStorage.setItem(PENDING_VERSION_KEY, latest);
      attemptReloadIfPending();
    };

    // initial check after boot
    const initial = window.setTimeout(checkVersion, 5000);
    const versionInterval = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    // periodically re-evaluate safety while a pending update is queued
    const safetyInterval = window.setInterval(attemptReloadIfPending, 15 * 1000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(versionInterval);
      window.clearInterval(safetyInterval);
      for (const e of activityEvents) {
        window.removeEventListener(e, bumpActivity, { capture: true } as any);
      }
      if (window.fetch === wrappedFetch) window.fetch = origFetch;
    };
  }, []);

  return null;
}