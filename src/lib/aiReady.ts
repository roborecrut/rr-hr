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
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function beginAIRestart() {
  pending += 1;
  notify();
}

export function endAIRestart() {
  pending = Math.max(0, pending - 1);
  notify();
}

export function isAIReady(): boolean {
  return pending === 0;
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