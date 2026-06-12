/**
 * AppVersionGuard
 * ----------------
 * 1) Defensively unregisters any leftover service workers (the project does not
 *    use a PWA — if a stale SW ever got installed it would serve old HTML/JS
 *    forever). Runs once on app boot.
 * 2) Periodically checks /index.html for a new build hash. When the hash
 *    changes we clear app-specific cache keys (keeping Supabase tokens and
 *    role sessions) and reload the page so the user gets the fresh bundle.
 *
 * No UI is rendered — fully transparent.
 */
import { useEffect, useRef } from "react";

const VERSION_KEY = "rr_app_version";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchCurrentVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Hash the served HTML — its main.tsx import has a content-hashed URL,
    // so any new deploy changes the hash.
    let h = 0;
    for (let i = 0; i < html.length; i++) {
      h = (h * 31 + html.charCodeAt(i)) | 0;
    }
    return String(h);
  } catch {
    return null;
  }
}

function clearAppCacheKeepingAuth() {
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key) continue;
      // Keep Supabase auth tokens, referral / onboarding flags, role sessions.
      if (key.startsWith("sb-")) continue;
      if (key.startsWith("rr_")) continue;
      if (key === "cand_session" || key === "cand_session_id" || key === "cand_role") continue;
      if (key.startsWith("employer_session")) continue;
      toRemove.push(key);
    }
    for (const k of toRemove) ls.removeItem(k);
  } catch { /* ignore */ }
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
}

async function unregisterStaleServiceWorkers() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try { await reg.unregister(); } catch { /* ignore */ }
    }
    if (regs.length > 0 && "caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.allSettled(names.map((n) => caches.delete(n)));
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export default function AppVersionGuard() {
  const reloadedRef = useRef(false);

  useEffect(() => {
    // 1) Kill any leftover service workers (project is not a PWA).
    unregisterStaleServiceWorkers();

    // 2) Version polling — only in production builds.
    if (!import.meta.env.PROD) return;

    let cancelled = false;

    const check = async () => {
      if (reloadedRef.current || cancelled) return;
      const v = await fetchCurrentVersion();
      if (!v) return;
      const stored = localStorage.getItem(VERSION_KEY);
      if (!stored) {
        localStorage.setItem(VERSION_KEY, v);
        return;
      }
      if (stored !== v) {
        reloadedRef.current = true;
        localStorage.setItem(VERSION_KEY, v);
        clearAppCacheKeepingAuth();
        // Soft reload — keeps history; bypasses HTTP cache.
        try {
          window.location.reload();
        } catch { /* ignore */ }
      }
    };

    // Initial check shortly after boot, then on interval / focus.
    const initial = window.setTimeout(check, 3000);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onFocus = () => { check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return null;
}