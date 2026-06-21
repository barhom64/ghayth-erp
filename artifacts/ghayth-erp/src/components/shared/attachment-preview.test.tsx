import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentPreview, type PreviewableAttachment } from "./attachment-preview";

/**
 * Batch A — attachment-preview view controls.
 * Pins: (1) images gain zoom + rotate controls that mutate the transform,
 * (2) PDF still renders in the native <object> viewer with NO image controls
 * (backward compatible), (3) unsupported types still show the download prompt.
 */
const IMG: PreviewableAttachment = { id: 1, title: "هوية", fileName: "id.png", mimeType: "image/png" };
const PDF: PreviewableAttachment = { id: 2, title: "عقد", fileName: "c.pdf", mimeType: "application/pdf" };
const ODD: PreviewableAttachment = { id: 3, title: "أرشيف", fileName: "x.zip", mimeType: "application/zip" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) }) as any));
  // jsdom lacks the object-URL helpers the component uses for the blob preview.
  (URL as any).createObjectURL = vi.fn(() => "blob:mock");
  (URL as any).revokeObjectURL = vi.fn();
});

describe("Batch A — image view controls", () => {
  it("shows zoom + rotate controls for an image", async () => {
    render(<AttachmentPreview attachment={IMG} open onOpenChange={() => {}} />);
    await screen.findByRole("img");
    expect(screen.getByTitle("تكبير")).toBeTruthy();
    expect(screen.getByTitle("تصغير")).toBeTruthy();
    expect(screen.getByTitle("تدوير")).toBeTruthy();
    expect(screen.getByTitle("إعادة الضبط")).toBeTruthy();
  });

  it("rotates the image transform on click", async () => {
    render(<AttachmentPreview attachment={IMG} open onOpenChange={() => {}} />);
    const img = await screen.findByRole("img");
    expect(img.getAttribute("style") || "").toContain("rotate(0deg)");
    await userEvent.click(screen.getByTitle("تدوير"));
    expect(img.getAttribute("style") || "").toContain("rotate(90deg)");
  });
});

describe("Batch A — backward compatibility", () => {
  it("renders a PDF in the native <object> viewer with no image controls", async () => {
    render(<AttachmentPreview attachment={PDF} open onOpenChange={() => {}} />);
    await waitFor(() => expect(document.querySelector('object[type="application/pdf"]')).toBeTruthy());
    expect(screen.queryByTitle("تدوير")).toBeNull();
  });

  it("shows the download prompt for an unsupported type", async () => {
    render(<AttachmentPreview attachment={ODD} open onOpenChange={() => {}} />);
    expect(await screen.findByText("لا يوجد عرض مباشر لهذا النوع")).toBeTruthy();
  });
});
