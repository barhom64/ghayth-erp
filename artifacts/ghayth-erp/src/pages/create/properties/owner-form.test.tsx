import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * B1-b (توجيه إبراهيم «أ») — «+ مالك جديد» يفتح النموذج الكامل المعتمد لا
 * المبتور [اسم، هاتف]. يثبّت هذا الاختبار ظهور الحقول الغنية الفعلية (نوع المالك/
 * الهوية/البنك/الوكالة) فلا يرتدّ أحدٌ إلى نموذج مبتور.
 */
beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class {
    observe() {} unobserve() {} disconnect() {}
  };
});

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ data: { data: [] }, refetch: vi.fn() }),
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  apiFetch: vi.fn(),
}));
// DatePicker (الوكالة) reads the calendar preference via useAuth; stub it.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { preferredCalendar: "gregorian" }, isAuthenticated: true }),
}));

import { OwnerForm } from "./owner-form";

describe("OwnerForm (B1-b — full embedded create form)", () => {
  it("renders the rich fields the truncated quick-add lacked (not just name + phone)", () => {
    render(<OwnerForm onCreated={() => {}} onCancel={() => {}} />);

    expect(screen.getByText("الاسم")).toBeInTheDocument();
    expect(screen.getByText("الهاتف")).toBeInTheDocument();
    // rich fields absent from the old [name, phone] quick-add
    expect(screen.getByText("نوع المالك")).toBeInTheDocument();
    expect(screen.getByText("رقم الهوية")).toBeInTheDocument();
    expect(screen.getByText("رقم الآيبان")).toBeInTheDocument();
    expect(screen.getByText("رقم الوكالة")).toBeInTheDocument();
  });

  it("exposes the create/cancel actions the drawer host drives", () => {
    render(<OwnerForm onCreated={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /حفظ المالك/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
  });
});
