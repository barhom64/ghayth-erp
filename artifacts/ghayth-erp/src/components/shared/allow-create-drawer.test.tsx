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
    if (k === "settings-companies") return { data: { data: [{ id: 7, name: "شركة غيث" }] } };
    if (k === "settings-branches") return { data: { data: [{ id: 1, name: "الفرع الرئيسي" }] } };
    if (k === "settings-departments") return { data: { data: [{ id: 5, name: "المالية" }] } };
    if (k === "employees-list-deps") return { data: { data: [{ id: 9, name: "أحمد", empNumber: "E1" }] } };
    return { data: { data: [] } };
  },
  useApiMutation: () => ({ mutateAsync, isPending: false }),
  asList: (resp: any) => (Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : []),
  apiFetch: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AllowCreateDrawer } from "./allow-create-drawer";

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
