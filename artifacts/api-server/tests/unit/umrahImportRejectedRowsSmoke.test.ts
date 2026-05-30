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

  it("CSV helper prepends a UTF-8 BOM so Excel detects Arabic encoding", () => {
    // Without the BOM, opening the file in Excel garbles Arabic headers
    // into mojibake — the BOM is the only reliable Excel signal.
    expect(WIZARD).toMatch(/const BOM = "[﻿]"/);
    expect(WIZARD).toMatch(/Blob\(\[csv\], \{\s*type: "text\/csv;charset=utf-8"\s*\}\)/);
  });

  it("CSV columns: row, field, reason, then every sample key seen in the batch", () => {
    expect(WIZARD).toMatch(/sampleKeys = Array\.from\(\s*new Set\(errors\.flatMap/);
    expect(WIZARD).toMatch(/\["row",\s*"field",\s*"reason",\s*\.\.\.sampleKeys\]/);
  });

  it("csvEscape quotes fields containing the delimiters per RFC 4180", () => {
    // Operators occasionally have commas or newlines in pilgrim names —
    // mishandling them silently corrupts the export.
    expect(WIZARD).toMatch(/csvEscape/);
    expect(WIZARD).toMatch(/\/\[",\\n\\r\]\//);
    expect(WIZARD).toMatch(/replace\(\/"\/g,\s*'""'\)/);
  });

  it("file name encodes fileType + Riyadh-local date so multiple downloads don't collide", () => {
    // todayLocal() (not new Date().toISOString().slice(0,10)) is the
    // project's Riyadh-aware day helper — the guard's check:utc-time-drift
    // step rejects the UTC variant.
    expect(WIZARD).toMatch(/umrah-rejected-\$\{fileType\}-\$\{todayLocal\(\)\}\.csv/);
    expect(WIZARD).toMatch(/import \{[^}]*todayLocal[^}]*\} from "@\/lib\/formatters"/);
  });
});
