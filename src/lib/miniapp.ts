/**
 * Detect whether the current page is being opened inside a Telegram Mini App.
 * Used to (a) show a splash screen while auto-auth runs, and
 * (b) hide flows that don't work in WebView (Google OAuth).
 */
export function isTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const tg: any = (window as any)?.Telegram?.WebApp;
    if (tg?.initData) return true;
    if (tg && (tg.platform && tg.platform !== "unknown")) return true;
    if (tg?.initDataUnsafe && Object.keys(tg.initDataUnsafe).length) return true;
    if (/Telegram/i.test(navigator.userAgent || "")) return true;
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "") || window.location.search.replace(/^\?/, ""),
    );
    if (params.get("tgWebAppData") || params.get("tgWebAppPlatform")) return true;
  } catch { /* ignore */ }
  return false;
}