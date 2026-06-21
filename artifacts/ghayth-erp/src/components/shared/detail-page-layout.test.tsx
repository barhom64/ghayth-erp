/**
 * Batch G — DetailPageLayout reviewer/submitter/readonly mode + review panel.
 * Pins: (1) a «المراجعة» tab appears (and is default for mode="reviewer")
 * hosting the owner-supplied panel, (2) the mode badge reflects the
 * perspective, (3) without reviewPanel there is no review tab (backward
 * compatible). The layout adds NO approval logic — reviewPanel is owner content.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

vi.mock("@/lib/api", () => ({
  API_BASE: "",
  nativeAuthHeaders: () => ({}),
  apiFetch: vi.fn().mockResolvedValue({}),
  asList: (r: any) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []),
  useApiQuery: () => ({ data: [], refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Drives the auto-activation of attachment review (Batch K). null = outside app
// shell (default); set to grant/deny manager review.
const appCtx: { value: any } = { value: null };
vi.mock("@/contexts/app-context", () => ({ useAppContextOptional: () => appCtx.value }));

import { DetailPageLayout } from "@workspace/entity-kit";

afterEach(() => cleanup());

const base = {
  title: "طلب إجازة #12",
  entityType: "leave",
  entityId: 12,
  overview: <div>نظرة عامة على الطلب</div>,
};

describe("Batch G — review mode + panel", () => {
  it("shows the review tab + panel + reviewer badge, defaulting to review for mode=reviewer", () => {
    render(<DetailPageLayout {...base} mode="reviewer" reviewPanel={<div data-testid="review-panel">قرار الاعتماد</div>} />);
    expect(screen.getByRole("tab", { name: /المراجعة/ })).toBeInTheDocument();
    expect(screen.getByTestId("review-panel")).toBeInTheDocument();
    expect(screen.getByText("وضع المراجعة")).toBeInTheDocument();
  });

  it("shows the readonly badge for mode=readonly", () => {
    render(<DetailPageLayout {...base} mode="readonly" />);
    expect(screen.getByText("اطّلاع فقط")).toBeInTheDocument();
  });

  it("has no review tab and no mode badge by default (backward compatible)", () => {
    render(<DetailPageLayout {...base} />);
    expect(screen.queryByRole("tab", { name: /المراجعة/ })).not.toBeInTheDocument();
    expect(screen.queryByText("وضع المراجعة")).not.toBeInTheDocument();
    expect(screen.queryByText("اطّلاع فقط")).not.toBeInTheDocument();
  });
});

describe("Batch K — auto-activate review for managers", () => {
  afterEach(() => { appCtx.value = null; });

  it("enables document review when a manager+ holds documents:update", async () => {
    const user = userEvent.setup();
    appCtx.value = { can: (p: string) => p === "documents:update", roleLevel: 80 };
    render(<DetailPageLayout {...base} />);
    await user.click(screen.getByRole("tab", { name: /المرفقات/ }));
    // empty docs + canReview → requirements card exposes the manager «إضافة متطلب»
    expect(await screen.findByRole("button", { name: /إضافة متطلب/ })).toBeInTheDocument();
  });

  it("does NOT enable review for a low-level role even with the permission", async () => {
    const user = userEvent.setup();
    appCtx.value = { can: (p: string) => p === "documents:update", roleLevel: 10 };
    render(<DetailPageLayout {...base} />);
    await user.click(screen.getByRole("tab", { name: /المرفقات/ }));
    expect(screen.queryByRole("button", { name: /إضافة متطلب/ })).not.toBeInTheDocument();
  });
});
