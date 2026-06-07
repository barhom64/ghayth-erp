import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Umrah pilgrim lifecycle states must render in Arabic, not raw English.
 *
 * PageStatusBadge resolves a status via STATUS_MAP (domain → shared →
 * all-domain scan) and falls back to `def?.label ?? status` — so any
 * state NOT in the map renders the raw English value to an Arabic
 * operator. The umrah pilgrim list (pilgrims.tsx) renders
 * <PageStatusBadge status={p.status} /> with backend states
 * arrived / overstayed / departed / violated, none of which were in
 * STATUS_MAP. This pins the umrah block + the shared overlaps.
 */

const BADGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/page-status-badge.tsx"),
  "utf8",
);

describe("STATUS_MAP — umrah pilgrim lifecycle", () => {
  it("has a dedicated umrah domain block", () => {
    expect(BADGE).toMatch(/umrah: \{/);
  });

  it("translates the umrah-specific states that were leaking English", () => {
    expect(BADGE).toMatch(/arrived:\s*\{ label: "وصل"/);
    expect(BADGE).toMatch(/overstayed:\s*\{ label: "متجاوز"/);
    expect(BADGE).toMatch(/departed:\s*\{ label: "غادر"/);
    expect(BADGE).toMatch(/violated:\s*\{ label: "مخالف"/);
  });

  it("overstayed + violated are danger-toned (operator must act)", () => {
    expect(BADGE).toMatch(/overstayed:\s*\{ label: "متجاوز",\s*tone: "danger"/);
    expect(BADGE).toMatch(/violated:\s*\{ label: "مخالف",\s*tone: "danger"/);
  });

  it("active / pending / cancelled stay in shared (umrah reuses them, no duplication)", () => {
    // Drift alarm: if someone duplicates these into the umrah block the
    // shared ones become dead. The umrah block should ONLY carry the
    // umrah-specific lifecycle states.
    expect(BADGE).toMatch(/umrah: \{[\s\S]{0,400}\}/);
    const umrahBlock = BADGE.match(/umrah: \{([\s\S]{0,400}?)\n  \}/)?.[1] ?? "";
    expect(umrahBlock).not.toMatch(/\bactive:/);
    expect(umrahBlock).not.toMatch(/\bpending:/);
    expect(umrahBlock).not.toMatch(/\bcancelled:/);
  });

  it("the all-domain resolver scan means pages need no domain prop to find umrah states", () => {
    // resolveStatus scans every domain as a last resort, so
    // <PageStatusBadge status={p.status} /> (no domain) still resolves
    // arrived/overstayed/etc. This pins that the fallback scan exists.
    expect(BADGE).toMatch(/for \(const key of Object\.keys\(STATUS_MAP\)[\s\S]{0,200}return def/);
  });
});
