import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Arabic-as-origin continuation (المرحلة 2):
 *
 *   The rejected-rows CSV export previously emitted English column
 *   headers ("row" / "field" / "reason") and raw camelCase keys for the
 *   sample columns ("passportNumber"). An Arabic-first operator opening
 *   the file in Excel saw the data but had to mentally translate the
 *   header row, defeating the point of the rest of the wizard already
 *   being Arabic. Pin the Arabic CSV headers + the sample-column
 *   translation so a regression turns the file back into English.
 */
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("import-wizard CSV export — Arabic column labels", () => {
  it("downloadRejectedRowsCsv takes a labels dictionary", () => {
    // Signature must accept the labels record so the helper can translate
    // engine field names (camelCase) to Arabic CSV headers from the same
    // dictionary the column-mapping dropdown uses.
    expect(WIZARD).toMatch(
      /async function downloadRejectedRowsCsv\(\s*errors: NonNullable<PreviewSummary\["errors"\]>,\s*fileType: FileType,\s*labels: Record<string, string>,\s*\)/,
    );
  });

  it("fixed CSV columns ship Arabic labels (الصف / الحقل / سبب الرفض)", () => {
    expect(WIZARD).toMatch(/\{\s*key:\s*"row",\s*label:\s*"الصف"\s*\}/);
    expect(WIZARD).toMatch(/\{\s*key:\s*"field",\s*label:\s*"الحقل"\s*\}/);
    expect(WIZARD).toMatch(/\{\s*key:\s*"reason",\s*label:\s*"سبب الرفض"\s*\}/);
  });

  it("sample columns translate camelCase keys through the labels map", () => {
    // Each dynamic sample column flows through `labels[k] ?? k` so an
    // operator sees "رقم الجواز" instead of "passportNumber" in the
    // header row of the downloaded file.
    expect(WIZARD).toMatch(
      /sampleKeys\.map\(\(k\)\s*=>\s*\(\{\s*key:\s*`sample_\$\{k\}`,\s*label:\s*labels\[k\]\s*\?\?\s*k\s*\}\)\)/,
    );
  });

  it("field column value is translated, not the raw camelCase engine name", () => {
    // The CSV row's `field` cell shows the operator-friendly Arabic name
    // ("رقم الجواز") rather than the raw engine identifier
    // ("passportNumber"), matching what the on-screen error table already
    // displays.
    expect(WIZARD).toMatch(/field:\s*e\.fieldName\s*\?\s*\(labels\[e\.fieldName\]\s*\?\?\s*e\.fieldName\)\s*:\s*""/);
  });

  it("call site passes the same errorLabels source used by the on-screen table", () => {
    // The CSV button and the on-screen error table must agree on labels —
    // both read from the same `errorLabels` IIFE-scoped binding so they
    // can't drift.
    expect(WIZARD).toMatch(
      /downloadRejectedRowsCsv\(preview\.errors \?\? \[\], fileType, errorLabels\)/,
    );
  });

  it("row numbers are emitted through formatNumber so the CSV inherits Arabic-Indic digits", () => {
    // The on-screen wizard already passes `e.row` through `formatNumber`
    // when rendering the row badge. Pinning the CSV's `row` cell to the
    // same helper makes the export inherit the global format setting
    // (Arabic-Indic vs Western) instead of always shipping ASCII digits.
    expect(WIZARD).toMatch(/row:\s*formatNumber\(e\.row\)/);
  });
});
