import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageShell } from "./page-shell";

/**
 * Batch C — PageShell `summary` slot. Pins: (1) the optional summary renders
 * between the header and the body when provided, (2) it renders nothing when
 * omitted (backward compatible — existing pages unaffected).
 */
describe("Batch C — PageShell summary slot", () => {
  it("renders the summary slot when provided", () => {
    render(
      <PageShell title="الفواتير" summary={<div data-testid="page-summary">ملخص</div>}>
        <div>المحتوى</div>
      </PageShell>,
    );
    expect(screen.getByTestId("page-summary")).toBeInTheDocument();
    expect(screen.getByText("المحتوى")).toBeInTheDocument();
  });

  it("renders nothing extra when summary is omitted", () => {
    render(
      <PageShell title="الفواتير">
        <div>المحتوى</div>
      </PageShell>,
    );
    expect(screen.queryByTestId("page-summary")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "الفواتير" })).toBeInTheDocument();
  });
});
