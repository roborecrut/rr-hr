// Global "AI ready" flag. We send /restart in background whenever the user
// opens an AI-powered editor (vacancy, company, edit-company). Until that
// /restart round-trip completes, ProTalk may answer the next user prompt
// with the stale system response — so we hide AI-generation buttons in the
// UI until the restart finishes.
//
// Usage:
//   - call `beginAIRestart()` before firing aiRestart(...)
//   - call `endAIRestart()` in the .finally / .then / .catch
//   - components call `useAIReady()` to know when to render AI buttons
import { useEffect, useState } from "react";

let pending = 0;
let overlayDismissed = false;
const listeners = new Set<() => void>();
const waiters = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
  if (pending === 0) {
    for (const w of waiters) w();
    waiters.clear();
  }
}

export function beginAIRestart() {
  pending += 1;
  // New restart cycle: reset dismissed flag so overlay reappears.
  overlayDismissed = false;
  notify();
}

export function endAIRestart() {
  pending = Math.max(0, pending - 1);
  notify();
}

export function isAIReady(): boolean {
  return pending === 0;
}

export function isAIRestartPending(): boolean {
  return pending > 0;
}

export function isOverlayDismissed(): boolean {
  return overlayDismissed;
}

export function dismissAIRestartOverlay() {
  overlayDismissed = true;
  notify();
}

export function requestAIRestartOverlay() {
  overlayDismissed = false;
  notify();
}

/** Resolves as soon as no /restart is in flight. */
export function waitForAIReady(timeoutMs = 120_000): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    waiters.add(finish);
    setTimeout(finish, timeoutMs);
  });
}

export function useAIReady(): boolean {
  const [ready, setReady] = useState<boolean>(isAIReady());
  useEffect(() => {
    const l = () => setReady(isAIReady());
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
  }, []);
  return ready;
}

export function useAIRestartOverlayVisible(): boolean {
  const [v, setV] = useState<boolean>(isAIRestartPending() && !isOverlayDismissed());
  useEffect(() => {
    const l = () => setV(isAIRestartPending() && !isOverlayDismissed());
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
  }, []);
  return v;
}