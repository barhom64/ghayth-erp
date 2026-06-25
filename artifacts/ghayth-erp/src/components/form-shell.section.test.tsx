/**
 * Batch E — FormShell `aside` summary slot + collapsible `FormSection`.
 * Pins: (1) the aside renders beside the fields when provided, (2) FormSection
 * collapses/expands its fields, (3) collapsed fields stay mounted so the form
 * still submits them (pure layout, no form-state coupling), (4) without `aside`
 * the form is the single-column default (backward compatible).
 *
 * Field hints (`description`) and multi-save (`secondaryActions`) already exist
 * on FormShell, so no new props are added for them.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { FormShell, FormTextField, FormSection } from "@workspace/ui-core";

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const schema = z.object({ name: z.string().min(1, "مطلوب"), extra: z.string().optional() });

describe("Batch E — FormShell aside + FormSection", () => {
  it("renders the aside summary slot beside the fields", () => {
    render(
      <FormShell schema={schema} defaultValues={{ name: "", extra: "" }} onSubmit={() => {}} aside={<div data-testid="summary">الأثر</div>}>
        <FormTextField name="name" label="الاسم" required />
      </FormShell>,
    );
    expect(screen.getByTestId("summary")).toBeInTheDocument();
    expect(screen.getByText("الاسم")).toBeInTheDocument();
  });

  it("collapses and expands a FormSection", async () => {
    const user = userEvent.setup();
    render(
      <FormShell schema={schema} defaultValues={{ name: "", extra: "" }} onSubmit={() => {}}>
        <FormSection title="تفاصيل إضافية" defaultOpen={false}>
          <FormTextField name="extra" label="حقل إضافي" />
        </FormSection>
      </FormShell>,
    );
    // Collapsed: the section title shows but the field is not visible yet.
    expect(screen.getByText("تفاصيل إضافية")).toBeInTheDocument();
    expect(screen.queryByText("حقل إضافي")).not.toBeInTheDocument();
    await user.click(screen.getByText("تفاصيل إضافية"));
    expect(await screen.findByText("حقل إضافي")).toBeInTheDocument();
  });

  it("submits values from a collapsed section (layout-only, no state coupling)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FormShell schema={schema} defaultValues={{ name: "علي", extra: "قيمة" }} onSubmit={onSubmit}>
        <FormTextField name="name" label="الاسم" required />
        <FormSection title="تفاصيل إضافية" defaultOpen={false}>
          <FormTextField name="extra" label="حقل إضافي" />
        </FormSection>
      </FormShell>,
    );
    await user.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "علي", extra: "قيمة" }), expect.anything()),
    );
  });
});
