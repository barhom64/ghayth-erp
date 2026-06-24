import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeImportRows,
  MUTAMER_HEADER_MAP,
  VOUCHER_HEADER_MAP,
} from "../../src/lib/umrahImportEngine.js";

/**
 * Pins the column-mapping pipeline end-to-end:
 *
 *   - normalizeImportRows() translates Arabic-keyed Excel rows into
 *     engine-keyed rows. Built-in dictionary handles the standard NUSK
 *     / MOFA layouts; an optional customMapping wins per import so
 *     operators can wire up non-standard column titles.
 *
 *   - The 3 import routes (preview / mutamers / vouchers) call the
 *     normalizer BEFORE handing rows to the engine. Without that step
 *     the engine would see `row.nuskNumber === undefined` and silently
 *     bucket every row as an error.
 *
 *   - GET /umrah/import/header-maps surfaces the built-in dictionaries
 *     to the wizard so the column-mapping step can pre-fill known
 *     headers without round-trips.
 *
 *   - The wizard captures detected Excel headers, lets the operator
 *     override per column, and ships the result on every preview +
 *     confirm call.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("umrahImportEngine — normalizeImportRows runtime behaviour", () => {
  it("translates Arabic mutamer headers into camelCase engine fields", () => {
    const rows = [{ "رقم المعتمر": "M-1", "اسم المعتمر": "Test", "رقم الجواز": "P-1" }];
    const out = normalizeImportRows(rows, "mutamers");
    expect(out).toEqual([{ nuskNumber: "M-1", fullName: "Test", passportNumber: "P-1" }]);
  });

  it("translates Arabic voucher headers into camelCase invoice fields", () => {
    const rows = [{ "رقم الفاتورة": "V-1", "الإجمالي": "1000", "حالة الفاتورة": "pending" }];
    const out = normalizeImportRows(rows, "vouchers");
    expect(out[0]).toMatchObject({ nuskInvoiceNumber: "V-1", totalAmount: "1000", nuskStatus: "pending" });
  });

  it("customMapping wins over the built-in dictionary per import", () => {
    const rows = [{ "ID Mu'tamir": "M-9" }];
    const out = normalizeImportRows(rows, "mutamers", { "ID Mu'tamir": "nuskNumber" });
    expect(out[0]).toEqual({ nuskNumber: "M-9" });
  });

  it("drops columns that neither dictionary recognises (no leakage of arbitrary keys)", () => {
    const rows = [{ "اسم المعتمر": "Test", "Custom Column": "ignore" }];
    const out = normalizeImportRows(rows, "mutamers");
    expect(out[0]).toHaveProperty("fullName", "Test");
    expect(out[0]).not.toHaveProperty("Custom Column");
  });

  it("empty / whitespace-only custom values fall through to built-in lookup", () => {
    // The operator left the dropdown blank → built-in still kicks in.
    const rows = [{ "اسم المعتمر": "Test" }];
    const out = normalizeImportRows(rows, "mutamers", { "اسم المعتمر": "  " });
    expect(out[0]).toEqual({ fullName: "Test" });
  });

  it("trims Excel header whitespace (vendor files often pad)", () => {
    const rows = [{ "  رقم المعتمر  ": "M-1" }];
    const out = normalizeImportRows(rows, "mutamers");
    expect(out[0]).toEqual({ nuskNumber: "M-1" });
  });

  it("preserves numeric + boolean values without coercing to strings", () => {
    const rows = [{ "عدد المعتمرين": 42, "داخل المملكة": true }];
    const out = normalizeImportRows(rows, "mutamers");
    // mutamerCount only exists on voucher map; isInsideKingdom is on
    // mutamers. Verify the boolean preserved.
    expect(out[0]).toMatchObject({ isInsideKingdom: true });
    const out2 = normalizeImportRows(rows, "vouchers");
    expect(out2[0]).toMatchObject({ mutamerCount: 42 });
  });

  it("MUTAMER_HEADER_MAP + VOUCHER_HEADER_MAP are re-exported for the route", () => {
    expect(MUTAMER_HEADER_MAP["رقم المعتمر"]).toBe("nuskNumber");
    expect(VOUCHER_HEADER_MAP["رقم الفاتورة"]).toBe("nuskInvoiceNumber");
  });
});

describe("umrah route — normalization wired into every import path", () => {
  it("imports normalizeImportRows + both maps from the engine", () => {
    expect(ROUTE).toMatch(/normalizeImportRows,\s*[\r\n]?\s*MUTAMER_HEADER_MAP,\s*[\r\n]?\s*VOUCHER_HEADER_MAP/);
  });

  it("/import/preview normalizes BEFORE calling the engine", () => {
    expect(ROUTE).toMatch(/const normalizedRows = normalizeImportRows\(importRows, normalizedFileType, columnMapping\)/);
    expect(ROUTE).toMatch(/previewVouchersImport\(importScope, normalizedRows\)/);
    expect(ROUTE).toMatch(/previewMutamersImport\(importScope, normalizedRows\)/);
  });

  it("/import/mutamers normalizes BEFORE calling confirmMutamersImport", () => {
    // The route is now wired to the engine (not the legacy doImport
    // helper) so each row resolves agentId / groupId / subAgentId
    // FKs — without that resolution every row landed with NULL FKs
    // and didn't appear on any agent roster.
    expect(ROUTE).toMatch(/const normalizedRows = normalizeImportRows\(importRows, "mutamers", columnMapping\)/);
    expect(ROUTE).toMatch(/confirmMutamersImport\(importScope, normalizedRows,/);
  });

  it("/import/vouchers normalizes BEFORE calling confirmVouchersImport", () => {
    expect(ROUTE).toMatch(/const normalizedRows = normalizeImportRows\(importRows, "vouchers", columnMapping\)/);
    expect(ROUTE).toMatch(/confirmVouchersImport\(importScope, normalizedRows,/);
  });

  it("all 3 zod schemas accept the optional columnMapping field", () => {
    expect(ROUTE).toMatch(/columnMappingSchema = z\.record\(z\.string\(\), z\.string\(\)\)\.optional\(\)/);
    expect(ROUTE).toMatch(/importPreviewSchema = z\.object\(\{[\s\S]{0,300}columnMapping: columnMappingSchema/);
    expect(ROUTE).toMatch(/importMutamersSchema = z\.object\(\{[\s\S]{0,300}columnMapping: columnMappingSchema/);
    expect(ROUTE).toMatch(/importVouchersSchema = z\.object\(\{[\s\S]{0,760}columnMapping: columnMappingSchema/);
  });

  it("GET /import/header-maps exposes both forward + inverted dictionaries", () => {
    expect(ROUTE).toMatch(/router\.get\("\/import\/header-maps"/);
    expect(ROUTE).toMatch(/forward:\s*MUTAMER_HEADER_MAP/);
    expect(ROUTE).toMatch(/forward:\s*VOUCHER_HEADER_MAP/);
    expect(ROUTE).toMatch(/targets:\s*invertMap\(MUTAMER_HEADER_MAP\)/);
  });
});

describe("import-wizard UI — column-mapping step", () => {
  it("fetches /umrah/import/header-maps so the dropdown is pre-populated", () => {
    expect(WIZARD).toContain('"umrah-import-header-maps"');
    expect(WIZARD).toContain('"/umrah/import/header-maps"');
  });

  it("captures detected headers + auto-fills mapping from the built-in dictionary", () => {
    expect(WIZARD).toContain("setDetectedHeaders(headers)");
    // Built-in lookup must be on the assignment path. The variable may
    // sit alone (`= forward[h]`) or as a fallback after a preset lookup
    // (`= fromPreset || forward[h]`) — both shapes count.
    expect(WIZARD).toMatch(/const target = (?:fromPreset \|\| )?forward\[h\]/);
  });

  it("auto-opens the mapping panel when any column is unmapped", () => {
    // Zero-noise default: panel stays hidden when everything matches a
    // known header; it surfaces only when intervention is needed.
    // PR #1475 renamed `unmapped` → `finalUnmapped` (smart-mapping
    // can reduce the count after the cascade); pin the rename-tolerant
    // form so the contract stays "panel shows iff > 0 columns are
    // still blank after the full priority cascade".
    expect(WIZARD).toMatch(/setShowMapping\((?:final)?[Uu]nmapped > 0\)/);
  });

  it("sends columnMapping on the preview request", () => {
    expect(WIZARD).toMatch(/body:\s*JSON\.stringify\(\{[\s\S]{0,400}rows:\s*parsedRows,[\s\S]{0,200}columnMapping,/);
  });

  it("sends columnMapping on the confirm request (mutamers + vouchers)", () => {
    expect(WIZARD).toContain("body.columnMapping = columnMapping;");
  });

  it("operator can toggle the panel manually via the ربط الأعمدة button", () => {
    expect(WIZARD).toContain("ربط الأعمدة");
    expect(WIZARD).toContain('setShowMapping((v) => !v)');
  });

  it("shows the unmapped-count warning chip when any column has no target", () => {
    expect(WIZARD).toContain("عمود غير مربوط");
  });

  it("each row offers a — تجاهل — option so the operator can opt out of unknown columns", () => {
    expect(WIZARD).toContain("— تجاهل العمود —");
  });
});
