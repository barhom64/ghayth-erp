import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the "print payload uses resolveStatus" sweep across the umrah
 * list pages. Every page below renders the status column on the data
 * table via PageStatusBadge (canonical Arabic via STATUS_MAP) but used
 * to ship raw `p.status || "—"` in the PrintButton payload. Result:
 * "الحالة: open" in the printed PDF while the on-screen list says
 * "الحالة: مفتوحة".
 *
 * The fix wires `resolveStatus` from @workspace/ui-core into each
 * payload so the printed cell inherits the same Arabic label.
 * Forward-compat: unknown enums fall through to the raw value.
 */
const ROOT = "../../../ghayth-erp/src/pages/umrah";

function readPage(name: string): string {
  return readFileSync(join(import.meta.dirname!, ROOT, name), "utf8");
}

const PAGES = {
  seasons: readPage("seasons.tsx"),
  groups: readPage("groups.tsx"),
  invoices: readPage("invoices.tsx"),
  payments: readPage("payments.tsx"),
  packages: readPage("packages.tsx"),
};

describe("umrah print-status sweep — resolveStatus import", () => {
  for (const [name, src] of Object.entries(PAGES)) {
    it(`${name}.tsx imports resolveStatus from @workspace/ui-core`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bresolveStatus\b[^}]*\}\s*from\s*"@workspace\/ui-core"/);
    });
  }
});

describe("umrah print-status sweep — print payload uses resolveStatus", () => {
  it("seasons.tsx wires resolveStatus through season status", () => {
    expect(PAGES.seasons).toMatch(/"الحالة":\s*\(s\.status && resolveStatus\(s\.status\)\?\.label\) \?\? s\.status \?\? "—"/);
    expect(PAGES.seasons).not.toMatch(/"الحالة":\s*s\.status\s*\|\|\s*"—"/);
  });

  it("groups.tsx wires resolveStatus through group status", () => {
    expect(PAGES.groups).toMatch(/"الحالة":\s*\(g\.status && resolveStatus\(g\.status\)\?\.label\) \?\? g\.status \?\? "—"/);
    expect(PAGES.groups).not.toMatch(/"الحالة":\s*g\.status\s*\|\|\s*"—"/);
  });

  it("invoices.tsx wires resolveStatus through every invoice status cell", () => {
    // Three printable lists in this file (agent invoices, nusk invoices,
    // reconciled). Each one used to ship raw status; each is fixed.
    expect(PAGES.invoices).toMatch(/"الحالة":\s*\(inv\.status && resolveStatus\(inv\.status\)\?\.label\) \?\? inv\.status \?\? "—"/);
    expect(PAGES.invoices).toMatch(/"الحالة":\s*\(r\.status && resolveStatus\(r\.status\)\?\.label\) \?\? r\.status \?\? "—"/);
    expect(PAGES.invoices).toMatch(/"الحالة":\s*\(r\.nuskStatus && resolveStatus\(r\.nuskStatus\)\?\.label\) \?\? r\.nuskStatus \?\? "—"/);
    expect(PAGES.invoices).not.toMatch(/"الحالة":\s*\w+\.\w+\s*\|\|\s*"—"/);
  });

  it("payments.tsx wires resolveStatus through payment status", () => {
    expect(PAGES.payments).toMatch(/"الحالة":\s*\(p\.status && resolveStatus\(p\.status\)\?\.label\) \?\? p\.status \?\? "—"/);
    expect(PAGES.payments).not.toMatch(/"الحالة":\s*p\.status\s*\|\|\s*"—"/);
  });

  it("packages.tsx wires resolveStatus through package status", () => {
    // Packages don't currently have a status enum, but the print payload
    // line `"الحالة": p.status` was still there. We route through
    // resolveStatus for consistency + forward-compat — if packages later
    // grow a status column, the print cell already speaks Arabic.
    expect(PAGES.packages).toMatch(/"الحالة":\s*\(p\.status && resolveStatus\(p\.status\)\?\.label\) \?\? p\.status \?\? "—"/);
    expect(PAGES.packages).not.toMatch(/"الحالة":\s*p\.status\s*\|\|\s*"—"/);
  });
});
