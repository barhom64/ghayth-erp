import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — «ربط المصروف» two-level cascade.
 *
 * The picker used a FLAT 15-option Select. The owner asked for a cascade:
 * pick the domain (مركبة / عقار / …) then the operation type drills down.
 * value.target stays the single source of truth; the domain is derived from
 * it so the existing per-target conditional rendering is untouched.
 */

const PICKER = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/allocation-target-select.tsx"),
  "utf8",
);

describe("AllocationTargetSelect — domain → operation cascade", () => {
  it("declares domain groups covering the main domains", () => {
    expect(PICKER).toMatch(/const TARGET_DOMAINS/);
    for (const d of ["vehicle", "property", "umrah", "parties", "fixed_asset"]) {
      expect(PICKER).toContain(`domain: "${d}"`);
    }
  });

  it("derives the domain from value.target (target stays the source of truth)", () => {
    expect(PICKER).toMatch(/function domainForTarget/);
    expect(PICKER).toMatch(/value=\{domainForTarget\(value\.target\)\}/);
  });

  it("renders the operation sub-select only when the domain has more than one target", () => {
    expect(PICKER).toMatch(/domainTargets\.length > 1/);
    expect(PICKER).toContain("نوع العملية");
  });
});
