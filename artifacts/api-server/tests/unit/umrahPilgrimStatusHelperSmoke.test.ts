import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `umrahPilgrimStatusLabel(status)` — the canonical client-side lookup
 * helper. The print-payload row builders used to do
 *   "الحالة": p.status || "—"
 * which shipped the raw enum value to the print engine ("overstayed",
 * not "متجاوز"). The helper centralises the lookup so every print +
 * export site reads the same wording the dropdown / badge / CSV use.
 */
const STATUS_MODULE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/umrah-pilgrim-status.ts"),
  "utf8",
);
const PILGRIMS_LIST = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);

describe("umrahPilgrimStatusLabel — single resolver for raw → Arabic", () => {
  it("module exports a named function alongside the options array", () => {
    expect(STATUS_MODULE).toMatch(/export function umrahPilgrimStatusLabel\(status: string \| null \| undefined\): string/);
  });

  it("resolver walks UMRAH_PILGRIM_STATUS_OPTIONS — single source", () => {
    // No second dictionary inside the helper, just a lookup against
    // the canonical array. Future label edits happen in one place.
    expect(STATUS_MODULE).toMatch(/UMRAH_PILGRIM_STATUS_OPTIONS\.find\(\(o\) => o\.value === status\)/);
  });

  it("nullish input returns the project-wide missing-value glyph", () => {
    expect(STATUS_MODULE).toMatch(/if \(!status\) return "—"/);
  });

  it("unknown statuses fall through to the raw value (forward-compat)", () => {
    // Same `?? raw` arm the server-side CSV translator uses.
    expect(STATUS_MODULE).toMatch(/hit\?\.label \?\? status/);
  });

  it("pilgrims list print payload uses the helper, not raw p.status", () => {
    // The print engine renders the value into the report cell directly,
    // so unless we resolve here the report shows "overstayed" while the
    // on-screen list shows "متجاوز".
    expect(PILGRIMS_LIST).toMatch(/import\s*\{[^}]*umrahPilgrimStatusLabel[^}]*\}\s*from\s*"@\/lib\/umrah-pilgrim-status"/);
    expect(PILGRIMS_LIST).toMatch(/"الحالة":\s*umrahPilgrimStatusLabel\(p\.status\)/);
    // And no resurrection of the raw fallback.
    expect(PILGRIMS_LIST).not.toMatch(/"الحالة":\s*p\.status\s*\|\|\s*"—"/);
  });
});
