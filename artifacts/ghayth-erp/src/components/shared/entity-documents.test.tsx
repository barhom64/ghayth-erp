/**
 * Batch F1 — entity-documents presentation. Display-only over data already on
 * the row. Pins: (1) list/grid view toggle, (2) group-by-category, (3) correct
 * Arabic status labels incl. `active`/`archived` (were falling back to «مسودة»),
 * (4) «منتهي» badge derived from retentionUntil when present. No status/notes
 * workflow is added — that needs a migration (tracked separately).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const DOCS = [
  // expired (retentionUntil in the past) + active status
  { id: 1, title: "هوية", fileName: "id.png", fileSize: 1024, category: "official", status: "active", currentVersion: 1, mimeType: "image/png", storageKey: "k1", createdAt: "2026-01-01", retentionUntil: "2020-01-01" },
  { id: 2, title: "عقد", fileName: "c.pdf", fileSize: 2048, category: "contracts", status: "approved", currentVersion: 2, mimeType: "application/pdf", storageKey: "k2", createdAt: "2026-01-02" },
];

vi.mock("@/lib/api", () => ({
  API_BASE: "",
  nativeAuthHeaders: () => ({}),
  apiFetch: vi.fn().mockResolvedValue({}),
  asList: (r: any) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []),
  useApiQuery: (key: string[]) =>
    key[0] === "entity-docs"
      ? { data: DOCS, refetch: vi.fn() }
      : { data: { items: [] }, refetch: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { EntityDocuments } from "@workspace/entity-kit";

afterEach(() => cleanup());

describe("Batch F1 — entity-documents views", () => {
  it("defaults to the list view with correct status labels + «منتهي» badge", () => {
    render(<EntityDocuments entityType="employee" entityId={1} />);
    expect(screen.getByTestId("docs-list")).toBeInTheDocument();
    expect(screen.queryByTestId("docs-grid")).not.toBeInTheDocument();
    // active → «نشط» (previously fell back to «مسودة»)
    expect(screen.getByText("نشط")).toBeInTheDocument();
    expect(screen.getByText("معتمد")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    // doc 1 retentionUntil is in the past → expired
    expect(screen.getByText("منتهي")).toBeInTheDocument();
  });

  it("switches to the grid view", async () => {
    const user = userEvent.setup();
    render(<EntityDocuments entityType="employee" entityId={1} />);
    await user.click(screen.getByRole("button", { name: "عرض شبكي" }));
    expect(screen.getByTestId("docs-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("docs-list")).not.toBeInTheDocument();
  });

  it("groups documents by category", async () => {
    const user = userEvent.setup();
    render(<EntityDocuments entityType="employee" entityId={1} />);
    await user.click(screen.getByRole("button", { name: "تجميع حسب النوع" }));
    // group headers carry the count, disambiguating from the per-row category badge
    expect(screen.getByText("وثائق رسمية (1)")).toBeInTheDocument();
    expect(screen.getByText("عقود (1)")).toBeInTheDocument();
  });
});
