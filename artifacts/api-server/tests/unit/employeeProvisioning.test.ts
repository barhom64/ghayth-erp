/**
 * Tests for the email local-part slugifier that powers the employee
 * create form's "real" email integration — when a mailbox domain is
 * connected, the form suggests a transliterated local part instead of
 * making the operator type the whole address.
 */
import { describe, it, expect } from "vitest";
import { slugifyLocalPart } from "../../src/routes/communications.js";

describe("slugifyLocalPart", () => {
  it("keeps plain ascii names", () => {
    expect(slugifyLocalPart("Ahmed Ali")).toBe("ahmed.ali");
  });

  it("transliterates Arabic names to a usable local part", () => {
    // أحمد علي → ahmd.aly (best-effort consonant map)
    const out = slugifyLocalPart("أحمد علي");
    expect(out).toMatch(/^[a-z.]+$/);
    expect(out).toContain(".");
    expect(out.startsWith(".")).toBe(false);
    expect(out.endsWith(".")).toBe(false);
  });

  it("collapses multiple spaces into single dots", () => {
    expect(slugifyLocalPart("John   Smith")).toBe("john.smith");
  });

  it("strips leading and trailing separators", () => {
    expect(slugifyLocalPart("  Ali  ")).toBe("ali");
  });

  it("returns empty string for empty input", () => {
    expect(slugifyLocalPart("")).toBe("");
    expect(slugifyLocalPart("   ")).toBe("");
  });

  it("preserves digits in mixed names", () => {
    expect(slugifyLocalPart("Agent 007")).toBe("agent.007");
  });

  it("never emits characters illegal in an email local part", () => {
    const out = slugifyLocalPart("محمد@الدور #1 <test>");
    expect(out).toMatch(/^[a-z0-9.]*$/);
  });
});
