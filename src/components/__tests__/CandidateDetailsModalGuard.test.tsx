/**
 * Regression test for CRITICAL HOTFIX — белый экран при открытии карточки.
 *
 * Root cause: the previous `CandidateBodyErrorBoundary` was rendered INSIDE
 * `CandidateDetailsModal`'s own return tree, so a render error in any
 * pre-JSX destructuring (e.g. legacy `employer_summary` with a string
 * instead of an array of risks, or a malformed `training_employer_feedback`
 * cell) escaped past it and unmounted the parent EmployerPanel.
 *
 * Fix: `CandidateDetailsModal` default export now wraps its inner body in
 * the boundary as an OUTER parent, with `key={candidateId}` so the
 * fallback resets when the employer switches between candidates.
 *
 * This test reuses the exported boundary to prove that:
 *   1. A throwing child does NOT bubble up — the parent stays mounted.
 *   2. The fallback still exposes a working close button.
 *   3. Changing `key` (i.e. switching candidate) resets the boundary so
 *      a healthy child renders again instead of the stuck fallback.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CandidateBodyErrorBoundary } from "@/components/CandidateDetailsModal";

function Boom(): JSX.Element {
  throw new Error("simulated render error from a report component");
}

function Healthy(): JSX.Element {
  return <div data-testid="healthy">card body</div>;
}

describe("CandidateDetailsModal outer error boundary", () => {
  it("catches a render error and shows the fallback with a working close button", () => {
    const onClose = vi.fn();
    // Silence React's console noise from the intentional throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div data-testid="parent">
        <CandidateBodyErrorBoundary onClose={onClose}>
          <Boom />
        </CandidateBodyErrorBoundary>
      </div>,
    );
    // Parent (i.e. EmployerPanel surrogate) is still mounted — no white screen.
    expect(screen.getByTestId("parent")).toBeInTheDocument();
    expect(screen.getByText(/Не удалось загрузить часть данных кандидата/i)).toBeInTheDocument();
    const closeBtn = screen.getByRole("button", { name: /Закрыть/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("resets when keyed differently — switching candidate clears the fallback", () => {
    const onClose = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <CandidateBodyErrorBoundary key="cand-1" onClose={onClose}>
        <Boom />
      </CandidateBodyErrorBoundary>,
    );
    expect(screen.getByText(/Не удалось загрузить часть данных кандидата/i)).toBeInTheDocument();
    rerender(
      <CandidateBodyErrorBoundary key="cand-2" onClose={onClose}>
        <Healthy />
      </CandidateBodyErrorBoundary>,
    );
    expect(screen.getByTestId("healthy")).toBeInTheDocument();
    spy.mockRestore();
  });
});