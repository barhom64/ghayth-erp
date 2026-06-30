/**
 * Batch F1 — entity-documents presentation. Display-only over data already on
 * the row. Pins: (1) list/grid view toggle, (2) group-by-category, (3) correct
 * Arabic status labels incl. `active`/`archived` (were falling back to «مسودة»),
 * (4) «منتهي» badge derived from retentionUntil when present. No status/notes
 * workflow is added — that needs a migration (tracked separately).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const DOCS = [
  // expired (retentionUntil in the past) + active status + a rejecting verdict with note
  { id: 1, title: "هوية", fileName: "id.png", fileSize: 1024, category: "compliance", status: "active", currentVersion: 1, mimeType: "image/png", storageKey: "k1", createdAt: "2026-01-01", retentionUntil: "2020-01-01", reviewStatus: "rejected", reviewNote: "الصورة غير واضحة" },
  { id: 2, title: "عقد", fileName: "c.pdf", fileSize: 2048, category: "contracts", status: "approved", currentVersion: 2, mimeType: "application/pdf", storageKey: "k2", createdAt: "2026-01-02", reviewStatus: "new" },
];

// Requirements: «صورة الهوية» (category compliance → present, matches doc 1) and
// «شهادة ضريبية» (category finance → missing). Labels resolve via shared CATEGORIES.
const REQS = [
  { id: 10, entityType: "employee", label: "صورة الهوية", docCategory: "compliance", required: true, isActive: true },
  { id: 11, entityType: "employee", label: "شهادة ضريبية", docCategory: "finance", required: true, isActive: true },
];

// Mutable holder so individual tests can swap the document set (e.g. duplicates).
const apiMock = vi.hoisted(() => ({ docs: [] as any[], reqs: [] as any[] }));
vi.mock("@/lib/api", () => ({
  API_BASE: "",
  nativeAuthHeaders: () => ({}),
  apiFetch: vi.fn().mockResolvedValue({}),
  asList: (r: any) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []),
  useApiQuery: (key: string[]) => {
    if (key[0] === "entity-docs") return { data: apiMock.docs, refetch: vi.fn() };
    if (key[0] === "entity-doc-reqs") return { data: { data: apiMock.reqs }, refetch: vi.fn() };
    return { data: { items: [] }, refetch: vi.fn() };
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { EntityDocuments } from "@workspace/entity-kit";

beforeEach(() => { apiMock.docs = DOCS; apiMock.reqs = REQS; });
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

describe("Batch H2 — attachment review surface", () => {
  it("shows the rejected verdict badge + reviewer note (visible to everyone once decided)", () => {
    render(<EntityDocuments entityType="employee" entityId={1} />);
    expect(screen.getByText("مرفوض")).toBeInTheDocument();
    expect(screen.getByText(/الصورة غير واضحة/)).toBeInTheDocument();
    // an undecided doc shows no verdict badge to a non-reviewer
    expect(screen.queryByText("لم يُراجَع")).not.toBeInTheDocument();
  });

  it("exposes review controls only when canReview is set", () => {
    const { rerender } = render(<EntityDocuments entityType="employee" entityId={1} />);
    expect(screen.queryByRole("button", { name: "مراجعة المرفق" })).not.toBeInTheDocument();
    rerender(<EntityDocuments entityType="employee" entityId={1} canReview />);
    expect(screen.getAllByRole("button", { name: "مراجعة المرفق" }).length).toBe(2);
    // reviewer sees the «لم يُراجَع» verdict on the undecided doc
    expect(screen.getByText("لم يُراجَع")).toBeInTheDocument();
  });

  it("the verdict dialog requires a reason for reject/needs-replacement", async () => {
    const user = userEvent.setup();
    render(<EntityDocuments entityType="employee" entityId={1} canReview />);
    await user.click(screen.getAllByRole("button", { name: "مراجعة المرفق" })[1]);
    // default verdict «قبول» → save enabled with no note
    const save = await screen.findByRole("button", { name: /حفظ المراجعة/ });
    expect(save).toBeEnabled();
    // switch to «رفض» → reason required → save disabled until note typed
    await user.click(screen.getByRole("button", { name: "رفض" }));
    expect(save).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "ناقص");
    expect(save).toBeEnabled();
  });

  it("shows the decision-impact preview that updates with the verdict", async () => {
    const user = userEvent.setup();
    render(<EntityDocuments entityType="employee" entityId={1} canReview />);
    await user.click(screen.getAllByRole("button", { name: "مراجعة المرفق" })[1]);
    await screen.findByRole("button", { name: /حفظ المراجعة/ });
    const impact = screen.getByTestId("decision-impact");
    // default «قبول» → اعتماد + إشعار
    expect(within(impact).getByText("اعتماد المرفق للكيان")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "رفض" }));
    expect(within(impact).getByText("رفض المرفق")).toBeInTheDocument();
  });
});

describe("Batch L — likely-duplicate detection", () => {
  it("flags «مكرر محتمل» on attachments sharing fileName + fileSize", () => {
    const dupDocs = [
      { id: 5, title: "إيصال أ", fileName: "receipt.pdf", fileSize: 900, category: "finance", status: "active", currentVersion: 1, storageKey: "a" },
      { id: 6, title: "إيصال ب", fileName: "receipt.pdf", fileSize: 900, category: "finance", status: "active", currentVersion: 1, storageKey: "b" },
      { id: 7, title: "فريد", fileName: "unique.pdf", fileSize: 123, category: "finance", status: "active", currentVersion: 1, storageKey: "c" },
    ];
    apiMock.docs = dupDocs;
    render(<EntityDocuments entityType="employee" entityId={1} />);
    // two colliding docs → two «مكرر محتمل» badges; the unique one has none
    expect(screen.getAllByText("مكرر محتمل").length).toBe(2);
    apiMock.docs = DOCS;
  });
});

describe("Batch I2 — requirements completeness card", () => {
  it("derives present/missing from the entity's documents and flags «ناقص»", () => {
    render(<EntityDocuments entityType="employee" entityId={1} />);
    const card = screen.getByTestId("requirements-card");
    expect(card).toBeInTheDocument();
    // «صورة الهوية» (compliance) is present; «شهادة ضريبية» (finance) is missing
    expect(within(card).getByText("صورة الهوية")).toBeInTheDocument();
    expect(within(card).getByText("شهادة ضريبية")).toBeInTheDocument();
    expect(within(card).getByText("متوفر")).toBeInTheDocument();
    expect(within(card).getByText("ناقص")).toBeInTheDocument();
    // overall verdict badge: ناقص (1)
    expect(within(card).getByText("ناقص (1)")).toBeInTheDocument();
  });

  it("shows the «إضافة متطلب» manager only to admins (canReview)", () => {
    const { rerender } = render(<EntityDocuments entityType="employee" entityId={1} />);
    expect(screen.queryByRole("button", { name: /إضافة متطلب/ })).not.toBeInTheDocument();
    rerender(<EntityDocuments entityType="employee" entityId={1} canReview />);
    expect(screen.getByRole("button", { name: /إضافة متطلب/ })).toBeInTheDocument();
  });
});
