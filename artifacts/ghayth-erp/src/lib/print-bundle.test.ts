/**
 * Feature M (البند 4) — bundled print composer. Pins the pure HTML builder:
 * record section + one page per image (with its data URL) + a listing for
 * non-embeddable files, page-break between sections, and HTML-escaped captions.
 */
import { describe, it, expect } from "vitest";
import { buildBundleHtml } from "./print-bundle";

const IMG = { name: "هوية", dataUrl: "data:image/png;base64,AAAA" };
const IMG2 = { name: "إيصال", dataUrl: "data:image/jpeg;base64,BBBB" };

describe("buildBundleHtml", () => {
  it("embeds one page per image with its data URL", () => {
    const html = buildBundleHtml({ title: "موظف #1", images: [IMG, IMG2] });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('src="data:image/jpeg;base64,BBBB"');
    expect(html).toContain("هوية");
    expect(html).toContain("إيصال");
    // one page-break section per image (+ the fallback record page)
    expect((html.match(/bundle-page/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("prepends the record HTML when provided, else a title fallback", () => {
    const withRecord = buildBundleHtml({ title: "ت", recordHtml: "<div>سجل الكيان</div>", images: [] });
    expect(withRecord).toContain("bundle-record");
    expect(withRecord).toContain("سجل الكيان");

    const without = buildBundleHtml({ title: "عنوان السجل", images: [] });
    expect(without).not.toContain("bundle-record");
    expect(without).toContain("عنوان السجل");
  });

  it("lists non-embeddable files in their own section", () => {
    const html = buildBundleHtml({ title: "ت", images: [], otherFiles: [{ name: "عقد.pdf" }] });
    expect(html).toContain("غير قابلة للتضمين");
    expect(html).toContain("عقد.pdf");
  });

  it("escapes HTML in captions (no injection via file names)", () => {
    const html = buildBundleHtml({ title: "ت", images: [{ name: "<script>x</script>", dataUrl: "data:image/png;base64,AAAA" }] });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the other-files section entirely when there are none", () => {
    const html = buildBundleHtml({ title: "ت", images: [IMG] });
    expect(html).not.toContain("غير قابلة للتضمين");
  });
});
