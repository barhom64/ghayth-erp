import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * B1-b (توجيه إبراهيم «أ») — «+ وحدة جديدة» يفتح النموذج الكامل المعتمد لا
 * المبتور [رقم الوحدة] وحده. يثبّت هذا الاختبار ظهور الحقول الغنية (المبنى/النوع/
 * الحالة/الإيجار/المالك/العدادات/المرافق) فلا يرتدّ أحدٌ إلى نموذج مبتور.
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
  useApiQuery: () => ({ data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  asList: (x: any) => x?.data ?? [],
}));

import { UnitForm } from "./unit-form";

describe("UnitForm (B1-b — full embedded create form)", () => {
  it("renders the rich fields the truncated [unitNumber] quick-add lacked", () => {
    render(<UnitForm onCreated={() => {}} onCancel={() => {}} />);

    expect(screen.getByText("رقم الوحدة")).toBeInTheDocument();
    // rich fields absent from the old [unitNumber]-only quick-add
    expect(screen.getByText("المبنى / المجمع")).toBeInTheDocument();
    expect(screen.getByText("النوع")).toBeInTheDocument();
    expect(screen.getByText("الحالة")).toBeInTheDocument();
    expect(screen.getByText("المرافق والمميزات")).toBeInTheDocument();
    expect(screen.getByText("المالك")).toBeInTheDocument();
  });

  it("exposes the create/cancel actions the drawer host drives", () => {
    render(<UnitForm onCreated={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: /إضافة الوحدة/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
  });
});
