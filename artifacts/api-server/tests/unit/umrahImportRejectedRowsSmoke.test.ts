import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeImportRows,
  previewMutamersImport,
  previewVouchersImport,
} from "../../src/lib/umrahImportEngine.js";

/**
 * Pins the rejected-rows diagnostics improvement:
 *
 *   - Engine returns structured rejection metadata (fieldName + sample)
 *     so the UI can render WHY each row failed AND show a tiny preview
 *     of the row values for cross-referencing against Excel.
 *
 *   - Route surfaces fieldName + sample on the `/import/preview`
 *     response with 1-based row numbers (so operator's "row N" lines
 *     up with Excel).
 *
 *   - Wizard renders a table (not just a 20-row list) and offers a
 *     "تنزيل الصفوف المرفوضة CSV" download that includes a UTF-8 BOM
 *     so Excel correctly detects Arabic headers.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("umrahImportEngine — structured rejection metadata", () => {
  it("mutamers reject (missing nuskNumber) carries fieldName + sample", async () => {
    const rows = normalizeImportRows(
      [{ "اسم المعتمر": "Test", "رقم الجواز": "P-1", "الجنسية": "SA" }],
      "mutamers",
    );
    const diff = await previewMutamersImport(
      { companyId: -1, branchId: 0, userId: -1, seasonId: -1 },
      rows,
    );
    expect(diff.errorRows).toHaveLength(1);
    const e = diff.errorRows[0]!;
    expect(e).toMatchObject({
      rowIndex: 0,
      error: "رقم المعتمر مفقود",
      fieldName: "nuskNumber",
    });
    // Sample carries the operator-recognizable fields from the row so
    // the reviewer can match it against Excel even if rows were re-sorted.
    expect(e.sample).toMatchObject({
      fullName: "Test",
      passportNumber: "P-1",
      nationality: "SA",
    });
  });

  it("vouchers reject (missing nuskInvoiceNumber) carries fieldName + sample", async () => {
    const rows = normalizeImportRows(
      [{ "الإجمالي": "1000", "عدد المعتمرين": 5, "حالة الفاتورة": "pending" }],
      "vouchers",
    );
    const diff = await previewVouchersImport(
      { companyId: -1, branchId: 0, userId: -1, seasonId: -1 },
      rows,
    );
    expect(diff.errorRows).toHaveLength(1);
    const e = diff.errorRows[0]!;
    expect(e).toMatchObject({
      rowIndex: 0,
      error: "رقم الفاتورة مفقود",
      fieldName: "nuskInvoiceNumber",
    });
    expect(e.sample).toMatchObject({
      totalAmount: "1000",
      mutamerCount: 5,
      nuskStatus: "pending",
    });
  });
});

describe("umrah route — /import/preview surfaces the rich error shape", () => {
  it("response includes fieldName + sample alongside row + message", () => {
    expect(ROUTE).toMatch(/fieldName:\s*e\.fieldName \?\? null/);
    expect(ROUTE).toMatch(/sample:\s*e\.sample \?\? null/);
  });

  it("row number is 1-based so it aligns with Excel's row numbering", () => {
    // The engine stores rowIndex 0-based (array position); the route adds
    // +1 before shipping so the operator's mental model ("row 42") matches
    // what's in their source spreadsheet.
    expect(ROUTE).toMatch(/row:\s*e\.rowIndex \+ 1/);
  });
});

describe("import-wizard UI — rejected rows table + CSV download", () => {
  it("renders a real table (header row + thead/tbody) instead of a 20-row list", () => {
    expect(WIZARD).toContain("<thead");
    expect(WIZARD).toContain("<tbody");
    expect(WIZARD).toContain("سبب الرفض");
    expect(WIZARD).toContain("قيم الصف");
  });

  it("ditches the 20-row cap — operator sees every failure", () => {
    // Previously the list cut off after 20 items with "...X more"; the
    // table scrolls, so all errors are accessible without losing UI
    // performance.
    expect(WIZARD).not.toMatch(/preview\.errors\.slice\(0,\s*20\)/);
  });

  it("download button is wired to a helper that builds + saves a CSV", () => {
    expect(WIZARD).toContain("تنزيل الصفوف المرفوضة (CSV)");
    expect(WIZARD).toContain("downloadRejectedRowsCsv");
    expect(WIZARD).toContain('data-testid="download-rejected-rows-csv"');
  });

  it("CSV download routes through the unified export helper", () => {
    // The wizard previously hand-rolled BOM + Blob + csvEscape. After the
    // print/export unification (GAP_MATRIX item #7 + Agent 6 of the
    // platform-stabilization workflow), all CSV downloads flow through
    // `exportRowsToCsv`, which centralises BOM prefix, RFC-4180 escaping,
    // and the `print_jobs` audit row in the csvAdapter.
    expect(WIZARD).toContain('from "@/lib/unified-export"');
    expect(WIZARD).toMatch(/exportRowsToCsv\(/);
  });

  it("CSV columns: row, field, reason, then every sample key seen in the batch", () => {
    // Helper preserves the column order — first row/field/reason, then
    // the dynamically-derived sample keys observed across rejected rows.
    // Post-migration the columns are passed as an array of
    // `{ key, label }` objects to exportRowsToCsv, not raw strings —
    // assert the shape of that projection.
    expect(WIZARD).toMatch(/sampleKeys\s*=\s*Array\.from\(\s*new Set\(/);
    expect(WIZARD).toMatch(/\{\s*key:\s*"row"/);
    expect(WIZARD).toMatch(/\{\s*key:\s*"field"/);
    expect(WIZARD).toMatch(/\{\s*key:\s*"reason"/);
    expect(WIZARD).toMatch(/\.\.\.sampleKeys\.map/);
  });

  it("filename encodes fileType + Riyadh-local date", () => {
    // todayLocal() is the project's Riyadh-aware day helper — the
    // unified-export `title` propagates it into the print_jobs row and
    // the saved filename, so multiple downloads on the same day for
    // different file types don't collide.
    expect(WIZARD).toMatch(/umrah-rejected-\$\{fileType\}-\$\{todayLocal\(\)\}/);
    expect(WIZARD).toMatch(/import \{[^}]*todayLocal[^}]*\} from "@\/lib\/formatters"/);
  });
});
