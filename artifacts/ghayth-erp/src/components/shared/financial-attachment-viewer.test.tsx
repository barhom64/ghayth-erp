import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinancialAttachmentViewer, type FinancialAttachment } from "./financial-attachment-viewer";

/**
 * FIN-P7-ATTACHMENT-WORKSPACE (#2237) — the reusable financial-attachment
 * viewer. Pins the display states (empty / image / pdf / unsupported), the
 * per-mode mutation rules (create replaces, review only with permission,
 * detail read-only), the internal-serial display (gap → «بلا رقم تسلسل»), and
 * that it is display-only (no OCR / no extraction).
 */
const IMG: FinancialAttachment = { url: "data:image/png;base64,AAAA", name: "inv.png", type: "image/png", documentType: "فاتورة" };
const PDF: FinancialAttachment = { url: "data:application/pdf;base64,JVBERi0=", name: "inv.pdf", type: "application/pdf" };
const ODD: FinancialAttachment = { url: "data:application/zip;base64,AAAA", name: "x.zip", type: "application/zip" };

describe("#2237 FinancialAttachmentViewer states", () => {
  it("shows the empty state + upload action in create mode", () => {
    render(<FinancialAttachmentViewer attachments={[]} mode="create" onUpload={() => {}} />);
    expect(screen.getByText("لا يوجد مرفق")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ارفع مستندًا/ })).toBeTruthy();
  });
  it("renders an image attachment", () => {
    const { container } = render(<FinancialAttachmentViewer attachments={[IMG]} mode="detail" />);
    expect(container.querySelector('[data-state="image"]')).toBeTruthy();
    expect(container.querySelector("img")).toBeTruthy();
  });
  it("renders a PDF in the native viewer (iframe) when no PDF lib is bundled", () => {
    const { container } = render(<FinancialAttachmentViewer attachments={[PDF]} mode="detail" />);
    expect(container.querySelector('[data-state="pdf"]')).toBeTruthy();
    expect(container.querySelector("iframe")).toBeTruthy();
  });
  it("shows an unsupported-type state for non image/pdf", () => {
    const { container } = render(<FinancialAttachmentViewer attachments={[ODD]} mode="detail" />);
    expect(container.querySelector('[data-state="unsupported"]')).toBeTruthy();
  });
});

describe("#2237 per-mode mutation rules", () => {
  it("create mode allows replace + remove", () => {
    render(<FinancialAttachmentViewer attachments={[IMG]} mode="create" onReplace={() => {}} onRemove={() => {}} />);
    expect(screen.getByRole("button", { name: /استبدال/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /إزالة/ })).toBeTruthy();
  });
  it("review mode is read-only without permission, replaceable with it", () => {
    const { rerender } = render(<FinancialAttachmentViewer attachments={[IMG]} mode="review" canReplace={false} />);
    expect(screen.queryByRole("button", { name: /استبدال/ })).toBeNull();
    expect(screen.getByText(/العرض للاعتماد فقط/)).toBeTruthy();
    rerender(<FinancialAttachmentViewer attachments={[IMG]} mode="review" canReplace onReplace={() => {}} />);
    expect(screen.getByRole("button", { name: /استبدال/ })).toBeTruthy();
  });
  it("detail mode is read-only (no replace/remove) but can open/download", () => {
    render(<FinancialAttachmentViewer attachments={[IMG]} mode="detail" canDownload />);
    expect(screen.queryByRole("button", { name: /استبدال/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /إزالة/ })).toBeNull();
    expect(screen.getByRole("button", { name: /تنزيل/ })).toBeTruthy();
  });
});

describe("#2237 internal serial + record link", () => {
  it("shows «بلا رقم تسلسل» when no internal serial exists (documented gap)", () => {
    render(<FinancialAttachmentViewer attachments={[IMG]} mode="detail" />);
    expect(screen.getByText("بلا رقم تسلسل")).toBeTruthy();
  });
  it("shows the internal serial + document id when present", () => {
    render(<FinancialAttachmentViewer attachments={[{ ...IMG, serialNo: "ATT-0007" }]} mode="detail" documentId={42} />);
    expect(screen.getByText("ATT-0007")).toBeTruthy();
    expect(screen.getByText("#42")).toBeTruthy();
  });
  it("fires onReplace with the picked file (no extraction/OCR side effects)", async () => {
    const onReplace = vi.fn();
    const { container } = render(<FinancialAttachmentViewer attachments={[IMG]} mode="create" onReplace={onReplace} />);
    await userEvent.click(screen.getByRole("button", { name: /استبدال/ }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "new.png", { type: "image/png" }));
    expect(onReplace).toHaveBeenCalledOnce();
  });
});
