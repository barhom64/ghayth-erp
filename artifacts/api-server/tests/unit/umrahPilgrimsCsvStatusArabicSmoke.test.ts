import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pilgrim CSV export (`/umrah/pilgrims/export.csv`) — Arabic-first
 * status column.
 *
 *   The export endpoint emits a 21-column manifest with Arabic
 *   headers. The cell values for most columns are operator-supplied
 *   text (passport, fullName, ...) — they're naturally Arabic / Latin
 *   as entered. The exception was `status`, which is the raw lifecycle
 *   enum from the DB ("pending" / "arrived" / ...). The header said
 *   "الحالة" but the value read "overstayed", forcing the operator to
 *   mentally translate.
 *
 *   The fix mirrors the canonical client-side dictionary
 *   `umrah-pilgrim-status.ts`: a `PILGRIM_STATUS_LABELS_AR` map on the
 *   server, applied only to the `status` column, falling through to
 *   the raw value when the map doesn't know it (forward-compat).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const STATUS_MODULE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/umrah-pilgrim-status.ts"),
  "utf8",
);

describe("pilgrims CSV export — Arabic status labels", () => {
  it("declares a PILGRIM_STATUS_LABELS_AR dictionary on the server", () => {
    expect(ROUTE).toMatch(/const PILGRIM_STATUS_LABELS_AR:\s*Record<string, string>\s*=\s*\{/);
  });

  it("server map covers every value of PILGRIM_STATUSES — no silent gap", () => {
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}pending:\s*"لم يصل"/);
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}arrived:\s*"وصل"/);
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}active:\s*"نشط"/);
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}overstayed:\s*"متجاوز"/);
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}departed:\s*"غادر"/);
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}violated:\s*"مخالف"/);
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR[\s\S]{0,400}cancelled:\s*"ملغى"/);
  });

  it("server map mirrors the client canonical dictionary exactly", () => {
    // Server is a downstream mirror — every value present here must
    // also be present in the client module with the SAME Arabic word.
    const pairs: [string, string][] = [
      ["pending", "لم يصل"],
      ["arrived", "وصل"],
      ["active", "نشط"],
      ["overstayed", "متجاوز"],
      ["departed", "غادر"],
      ["violated", "مخالف"],
      ["cancelled", "ملغى"],
    ];
    for (const [value, label] of pairs) {
      const reLiteral = new RegExp(`value:\\s*"${value}",\\s*label:\\s*"${label}"`);
      expect(STATUS_MODULE).toMatch(reLiteral);
    }
  });

  it("status column gets translated; other columns flow through unchanged", () => {
    // The dataRows map() special-cases only the `status` cell — every
    // other column reads through `csvEscape(r[key])` directly so we
    // don't accidentally mutate dates, names, or NUSK numbers.
    expect(ROUTE).toMatch(/if \(key === "status" && typeof raw === "string"\)/);
    expect(ROUTE).toMatch(/csvEscape\(PILGRIM_STATUS_LABELS_AR\[raw\] \?\? raw\)/);
  });

  it("unknown statuses fall through to the raw value (forward-compat)", () => {
    // The `?? raw` arm guarantees that a future backend state that
    // hasn't yet been mapped won't render as blank/undefined.
    expect(ROUTE).toMatch(/PILGRIM_STATUS_LABELS_AR\[raw\] \?\? raw/);
  });
});
