import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom lacks the pointer-capture + scroll + ResizeObserver APIs that Radix
// (the Sheet primitive) calls when the drawer opens. Shim them locally.
beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Isolate the drawer + embedded department form from the data + toast layers.
const CREATED = { id: 101, name: "قسم جديد" };
const mutateAsync = vi.fn().mockResolvedValue(CREATED);

vi.mock("@/lib/api", () => ({
  useApiQuery: (key: string[]) => {
    const k = key[0];
    const wrap = (rows: any[]) => ({ data: { data: rows }, refetch: vi.fn() });
    if (k === "settings-companies") return wrap([{ id: 7, name: "شركة غيث" }]);
    if (k === "settings-branches") return wrap([{ id: 1, name: "الفرع الرئيسي" }]);
    if (k === "settings-departments") return wrap([{ id: 5, name: "المالية" }]);
    if (k === "employees-list-deps") return wrap([{ id: 9, name: "أحمد", empNumber: "E1" }]);
    if (k === "departments-list") return wrap([{ id: 5, name: "المالية" }]);
    return wrap([]);
  },
  useApiMutation: () => ({ mutateAsync, isPending: false }),
  asList: (resp: any) => (Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : []),
  apiFetch: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useState } from "react";
import { AllowCreateDrawer } from "./allow-create-drawer";
import { DepartmentSelect } from "./entity-selects";

describe("AllowCreateDrawer", () => {
  it("opens the FULL department form in the drawer — not a truncated quick-add", async () => {
    render(<AllowCreateDrawer kind="department" open onOpenChange={() => {}} onCreated={() => {}} />);

    // The full form exposes every field of the department entity, proving the
    // drawer is not the 1-field QuickCreateDialog the selector used before.
    expect(await screen.findByTestId("input-dept-name")).toBeInTheDocument();
    expect(screen.getByTestId("select-dept-branch")).toBeInTheDocument();
    expect(screen.getByTestId("select-dept-parent")).toBeInTheDocument();
    expect(screen.getByTestId("select-dept-manager")).toBeInTheDocument();
    expect(screen.getByTestId("select-dept-status")).toBeInTheDocument();
  });

  it("returns the freshly-created row to the parent on save", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<AllowCreateDrawer kind="department" open onOpenChange={() => {}} onCreated={onCreated} />);

    await user.type(await screen.findByTestId("input-dept-name"), "قسم جديد");
    await user.click(screen.getByTestId("button-submit-dept"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 101 })));
  });
});

describe("AllowCreateDrawer — branch", () => {
  it("opens the FULL branch form including the required companyId the quick-add dropped", async () => {
    render(<AllowCreateDrawer kind="branch" open onOpenChange={() => {}} onCreated={() => {}} />);

    // companyId (required), nameEn and phone were absent from the truncated
    // quick-add; the drawer hosts the complete branch form. The lazy form pulls
    // the full FormShell graph, so allow generous time for the on-demand load.
    expect(await screen.findByText("الشركة", {}, { timeout: 12000 })).toBeInTheDocument();
    expect(screen.getByText("اسم الفرع (عربي)")).toBeInTheDocument();
    expect(screen.getByText("الهاتف")).toBeInTheDocument();
  }, 15000);
});

// NOTE: ProjectCreateForm is a page-derived form that depends on app providers
// (AuthProvider) and DatePicker, so it can't be mounted in an isolated unit
// test without heavy scaffolding. The drawer MECHANISM is proven by the
// department + branch cases above; the project wiring is covered by typecheck
// and the shared form being reused by projects-create.tsx.

// ── الاختبار السلوكي (شرط مجلس ghayth-review على #2629) ───────────────────────
// الطبقة 1 السابقة كانت تثبت الرندرة فقط. هذا يثبت مسار المستخدم الفعلي عبر
// المحدِّد: «+ جديد» → الدرج بالنموذج الكامل → الحفظ → اختيار الكيان الجديد
// تلقائيًا (#2134) → إغلاق الدرج. هذا ما تعتمد عليه كل المحدِّدات المعمَّمة.
describe("AllowCreateDrawer — سلوكي: إنشاء → اختيار تلقائي → إغلاق عبر المحدِّد", () => {
  function SelectHarness() {
    const [val, setVal] = useState("");
    return (
      <div>
        <DepartmentSelect value={val} onChange={setVal} label="القسم" />
        <div data-testid="selected-dept">{val}</div>
      </div>
    );
  }

  it("«+ قسم جديد» يفتح الدرج، والحفظ يختار الكيان الجديد ثم يغلق الدرج", async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);

    // لا قيمة مختارة بعد.
    expect(screen.getByTestId("selected-dept").textContent).toBe("");

    // افتح المحدِّد ثم فعّل «+ قسم جديد».
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("+ قسم جديد"));

    // الدرج فتح بالنموذج الكامل (تحميل كسول — أمهله).
    const nameInput = await screen.findByTestId("input-dept-name", {}, { timeout: 12000 });
    await user.type(nameInput, "قسم جديد");
    await user.click(screen.getByTestId("button-submit-dept"));

    // اختيار تلقائي للكيان الجديد (id=101 من mutateAsync) — جوهر #2134.
    await waitFor(() => expect(screen.getByTestId("selected-dept").textContent).toBe("101"));

    // الدرج أُغلق: النموذج لم يعد في الـ DOM.
    await waitFor(() => expect(screen.queryByTestId("input-dept-name")).not.toBeInTheDocument());
  }, 20000);
});
