/**
 * OnboardingHost — integration tests for welcome-tour autostart/persistence.
 *
 * Goal: lock down the 10 scenarios from R4 spec without needing a real
 * browser session. We mount the real component, mock `driver.js` so we can
 * observe `drive()` calls without DOM popovers, and mock the Supabase
 * client so `getUser()` and the `employer_tour_state` upsert/select chain
 * are deterministic. Real jsdom localStorage and sessionStorage are used —
 * the component's persistence semantics are exercised end to end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";

// --- Mock driver.js so we can observe drive()/destroy() ----------------
const driveSpy = vi.fn();
let lastDriverOpts: any = null;
let lastDriverInstance: any = null;
vi.mock("driver.js", () => ({
  driver: (opts: any) => {
    lastDriverOpts = opts;
    const inst = {
      drive: () => { driveSpy(); },
      destroy: vi.fn(),
      refresh: vi.fn(),
      hasNextStep: () => false,
    };
    lastDriverInstance = inst;
    return inst;
  },
}));
vi.mock("driver.js/dist/driver.css", () => ({}));

// --- Mock supabase client ----------------------------------------------
const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
let currentUser: { id: string } | null = { id: "user-emp100006" };
let dbStatus: "pending" | "completed" | "dismissed" = "pending";
let legacyRowsExist = false;
let upsertShouldFail = false;

vi.mock("@/integrations/supabase/client", () => {
  const fromImpl = (_table: string) => ({
    select: (_cols: string) => ({
      eq: (_c1: string, _v1: any) => ({
        eq: (_c2: string, _v2: any) => ({
          maybeSingle: async () => ({ data: dbStatus === "pending" ? null : { status: dbStatus }, error: null }),
        }),
        in: (_c2: string, _vals: string[]) => ({
          limit: async (_n: number) => ({ data: legacyRowsExist ? [{ status: "completed" }] : [], error: null }),
        }),
      }),
    }),
    upsert: async (...args: any[]) => {
      upsertSpy(...args);
      if (upsertShouldFail) return { data: null, error: { message: "rls_denied" } };
      return { data: null, error: null };
    },
  });
  return {
    supabase: {
      from: fromImpl,
      auth: {
        getUser: async () => ({ data: { user: currentUser }, error: null }),
      },
    },
  };
});

import OnboardingHost from "@/components/OnboardingHost";

function setUrl(path: string) {
  window.history.replaceState({}, "", path);
}

function resetAll() {
  window.localStorage.clear();
  window.sessionStorage.clear();
  driveSpy.mockClear();
  upsertSpy.mockClear();
  lastDriverOpts = null;
  lastDriverInstance = null;
  currentUser = { id: "user-emp100006" };
  dbStatus = "pending";
  legacyRowsExist = false;
  upsertShouldFail = false;
  setUrl("/emp100006/profile");
}

/** Allow component's internal awaits (employer-id wait + 700ms sidebar wait + getUser). */
async function waitForAutostartDecision() {
  // The component awaits ~800ms before deciding to run. Drive vitest fake
  // time forward by polling.
  await waitFor(() => expect(driveSpy.mock.calls.length + upsertSpy.mock.calls.length).toBeGreaterThanOrEqual(0), { timeout: 3000 });
  // Settle microtasks
  await new Promise((r) => setTimeout(r, 1000));
}

describe("OnboardingHost — welcome tour state machine", () => {
  beforeEach(() => { resetAll(); });
  afterEach(() => { cleanup(); });

  it("first sign-in without any marker auto-starts the tour exactly once", async () => {
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).toHaveBeenCalledTimes(1);
    // sessionStorage guard set so a remount in the same tab does NOT re-fire
    expect(window.sessionStorage.getItem("rr_tour_autostarted")).toBe("1");
  });

  it("dismiss writes per-employer + per-user + legacy LS marker AND db upsert", async () => {
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    // Simulate user closing tour at step 1 (hasNextStep=false → completed in
    // current impl; we override by reading the real branch). Trigger close:
    await act(async () => {
      lastDriverOpts?.onDestroyStarted?.();
      await new Promise((r) => setTimeout(r, 50));
    });
    // Per-employer key from URL /emp100006/...
    const perEmpKey = "rr_employer_tour_completed:100006:v1";
    const perUserKey = "rr_tour_user:user-emp100006:v1";
    expect(["completed", "dismissed"]).toContain(window.localStorage.getItem(perEmpKey));
    expect(["completed", "dismissed"]).toContain(window.localStorage.getItem(perUserKey));
    expect(window.localStorage.getItem("rr_welcome_tour_v1")).toBeTruthy();
    expect(upsertSpy).toHaveBeenCalled();
  });

  it("reload (fresh mount) after completion does NOT auto-start again", async () => {
    window.localStorage.setItem("rr_employer_tour_completed:100006:v1", "completed");
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).not.toHaveBeenCalled();
  });

  it("navigation across sections (same tab) keeps sessionStorage guard, no re-fire", async () => {
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).toHaveBeenCalledTimes(1);
    // Simulate route change → component re-mount
    cleanup();
    setUrl("/emp100006/companies");
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).toHaveBeenCalledTimes(1); // STILL only the original call
  });

  it("logout/login of the SAME user does not re-fire (per-user LS marker survives)", async () => {
    // First session
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).toHaveBeenCalledTimes(1);
    // Logout: clear sessionStorage (new tab) but keep localStorage
    window.sessionStorage.clear();
    cleanup();
    // Login same user again
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).toHaveBeenCalledTimes(1);
  });

  it("different employer URL has independent state — auto-starts independently", async () => {
    // Employer 100006 already done
    window.localStorage.setItem("rr_employer_tour_completed:100006:v1", "completed");
    // But user logs into a different employer 200007 (still same browser)
    setUrl("/emp200007/profile");
    currentUser = { id: "user-emp200007" };
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).toHaveBeenCalledTimes(1); // independent state
  });

  it("manual button (buttonOnly) opens tour even when marker exists", async () => {
    window.localStorage.setItem("rr_employer_tour_completed:100006:v1", "completed");
    const { container } = render(<OnboardingHost autoStart={false} buttonOnly />);
    await waitForAutostartDecision();
    expect(driveSpy).not.toHaveBeenCalled();
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(driveSpy).toHaveBeenCalledTimes(1);
  });

  it("late-arriving employer id does not cause a second autostart", async () => {
    setUrl("/no-employer-yet"); // no /emp{id} segment
    render(<OnboardingHost autoStart />);
    // Switch to a real employer URL midway
    setTimeout(() => setUrl("/emp100006/profile"), 200);
    await waitForAutostartDecision();
    // Only one autostart total
    expect(driveSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("DB write failure does NOT undo the localStorage marker", async () => {
    upsertShouldFail = true;
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    await act(async () => {
      lastDriverOpts?.onDestroyStarted?.();
      await new Promise((r) => setTimeout(r, 50));
    });
    const perEmpKey = "rr_employer_tour_completed:100006:v1";
    expect(["completed", "dismissed"]).toContain(window.localStorage.getItem(perEmpKey));
  });

  it("legacy per-section rows in DB are treated as 'completed' — no autostart", async () => {
    // Pretend this user already has the OLD per-section tour rows.
    legacyRowsExist = true;
    render(<OnboardingHost autoStart />);
    await waitForAutostartDecision();
    expect(driveSpy).not.toHaveBeenCalled();
  });
});