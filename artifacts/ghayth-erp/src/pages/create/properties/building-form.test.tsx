import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * B1-b (توجيه إبراهيم «أ») — الإضافة السريعة لـ«+ مبنى جديد» تفتح النموذج الكامل
 * المعتمد، لا الإضافة المبتورة [اسم، مدينة]. هذا الاختبار يثبّت أن النموذج
 * المُشارَك يعرض الحقول الغنية الفعلية (نوع المبنى/الصك/العنوان الوطني/الإحداثيات)
 * — فلا يرتدّ أحدٌ إلى نموذج مبتور.
 */
beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class {
    observe() {} unobserve() {} disconnect() {}
  };
});

// Isolate the form from the data/network layer. PropertyOwnerSelect reads a list
// via useApiQuery; the POST goes through apiFetch.
vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ data: { data: [] }, refetch: vi.fn() }),
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  apiFetch: vi.fn(),
}));
// DatePicker (تاريخ الصك) reads the user's calendar preference via useAuth; stub it
// so the form renders without an AuthProvider.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { preferredCalendar: "gregorian" }, isAuthenticated: true }),
}));

import { BuildingForm } from "./building-form";

describe("BuildingForm (B1-b — full embedded create form)", () => {
  it("renders the rich fields the truncated quick-add lacked (not just name + city)", () => {
    render(<BuildingForm onCreated={() => {}} onCancel={() => {}} />);

    // the two fields the old generic quick-add had
    expect(screen.getByText("اسم المبنى")).toBeInTheDocument();
    expect(screen.getByText("المدينة")).toBeInTheDocument();
    // the rich fields it did NOT — proving the full form is now the surface
    expect(screen.getByText("نوع المبنى")).toBeInTheDocument();
    expect(screen.getByText("رقم الصك")).toBeInTheDocument();
    expect(screen.getByText("العنوان الوطني")).toBeInTheDocument();
    expect(screen.getByText("خط العرض")).toBeInTheDocument();
    expect(screen.getByText("المالك")).toBeInTheDocument();
  });

  it("exposes the create/cancel actions the drawer host drives", () => {
    const onCancel = vi.fn();
    render(<BuildingForm onCreated={() => {}} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: /حفظ المبنى/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
  });
});
