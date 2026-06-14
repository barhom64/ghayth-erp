/**
 * HR-REV-3 (#2222) — "تفعيل سريع" quick-activate modal on the
 * employee-activation page. Static source-reading smoke: we assert the
 * page wires the modal to the backend endpoint, carries the Arabic
 * label, and submits via the page's mutation hook. Behaviour proven by
 * the live page; this pins the contract cheaply.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/employee-activation.tsx"),
  "utf8",
);

describe('HR-REV-3 (#2222) — "تفعيل سريع" modal', () => {
  it("posts to the /employees/quick-activate endpoint", () => {
    expect(PAGE).toContain("/employees/quick-activate");
  });

  it('carries the "تفعيل سريع" label', () => {
    expect(PAGE).toContain("تفعيل سريع");
  });

  it("renders a name field and submits via useApiMutation", () => {
    expect(PAGE).toMatch(/id="qa-name"/);
    expect(PAGE).toMatch(/quickActivateMutation\s*=\s*useApiMutation/);
    expect(PAGE).toMatch(/quickActivateMutation\.mutate\(/);
  });
});
