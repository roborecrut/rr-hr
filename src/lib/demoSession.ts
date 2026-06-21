// LocalStorage helpers for the /demo interview flow.
// All progress (template, answers, results) lives in the browser.

export type DemoStage = "pick" | "restart" | "situations" | "checklist" | "resume" | "done";

export type DemoQuestion = {
  id: string;
  kind: "choice" | "text";
  question: string;
  options?: string[] | null;
  correct?: string | null;
  expected_answer?: string | null;
};

export type DemoSituation = { id: string; title: string; brief: string; criteria?: string };

export type DemoTemplate = {
  titleId: string;
  title: string;
  vacancy_text?: string;
  situations: DemoSituation[];
  checklist: DemoQuestion[];
  resume_criteria: string;
};

export type DemoState = {
  titleId: string;
  title: string;
  stage: DemoStage;
  template: DemoTemplate | null;
  sitAnswers: Record<string, string>;
  checkAnswers: Record<string, string>;
  resumeText: string;
  sitResult: { score: number; items: { id: string; feedback: string; score: number }[]; advice: string } | null;
  checkResult: { score: number; feedback: any } | null;
  resumeResult: { score: number; summary: string; strengths: string[]; gaps: string[] } | null;
  finalScore: number | null;
};

const STATE_KEY = "demo:state";
const TPL_PREFIX = "demo:tpl:";
const DEMO_USER_KEY = "demo:user_id";

/**
 * Stable per-browser anonymous demo user id. Used as ProTalk chat_id /
 * social_id seed across all 3 demo stages (situations → checklist → resume)
 * so the conversation stays in ONE ProTalk dialog. Reset only when the user
 * picks a different position (see `resetDemoUserId`).
 */
export function getDemoUserId(): string {
  try {
    const cur = localStorage.getItem(DEMO_USER_KEY);
    if (cur && cur.length > 4) return cur;
    const fresh = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEMO_USER_KEY, fresh);
    return fresh;
  } catch {
    // localStorage unavailable — fall back to per-tab id (won't survive reload,
    // but keeps a single page session consistent).
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function resetDemoUserId(): void {
  try { localStorage.removeItem(DEMO_USER_KEY); } catch { /* ignore */ }
}

export function loadDemoState(): DemoState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoState;
  } catch { return null; }
}

export function saveDemoState(s: DemoState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* ignore quota */ }
}

export function clearDemoState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
}

export function loadCachedTemplate(titleId: string): DemoTemplate | null {
  try {
    const raw = localStorage.getItem(TPL_PREFIX + titleId);
    if (!raw) return null;
    return JSON.parse(raw) as DemoTemplate;
  } catch { return null; }
}

export function saveCachedTemplate(tpl: DemoTemplate) {
  try { localStorage.setItem(TPL_PREFIX + tpl.titleId, JSON.stringify(tpl)); } catch { /* ignore */ }
}

export function makeInitialState(titleId: string, title: string): DemoState {
  return {
    titleId, title,
    stage: "restart",
    template: null,
    sitAnswers: {}, checkAnswers: {}, resumeText: "",
    sitResult: null, checkResult: null, resumeResult: null,
    finalScore: null,
  };
}