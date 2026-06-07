import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MUTAMER_HEADER_MAP,
  VOUCHER_HEADER_MAP,
  UMRAH_FIELD_LABELS_AR,
} from "../../src/lib/umrahImportEngine.js";

/**
 * Arabic field labels for the umrah import wizard.
 *
 * Reported from a live screenshot: the column-mapping dropdown showed
 * raw English identifiers (nuskInvoiceNumber, mutamerCount,
 * nuskGroupNumber, totalAmount) to an Arabic operator. The operator's
 * own Excel headers are Arabic, but the "map this column to →" target
 * list was English — meaningless.
 *
 * UMRAH_FIELD_LABELS_AR is the curated reverse map (engine field →
 * one clean Arabic label). The header-maps endpoint surfaces it as
 * `labels`, and the wizard renders `labels[field] ?? field`.
 */

describe("UMRAH_FIELD_LABELS_AR — coverage", () => {
  it("covers EVERY distinct engine field in both forward maps (no English leaks through)", () => {
    // Drift alarm: any new field added to a forward map without an
    // Arabic label here would render as a raw English identifier in
    // the dropdown — the exact bug this map exists to kill.
    const allFields = new Set([
      ...Object.values(MUTAMER_HEADER_MAP),
      ...Object.values(VOUCHER_HEADER_MAP),
    ]);
    const missing = [...allFields].filter((f) => !UMRAH_FIELD_LABELS_AR[f]);
    expect(missing).toEqual([]);
  });

  it("every label is non-empty Arabic text (no accidental empty string)", () => {
    for (const [field, label] of Object.entries(UMRAH_FIELD_LABELS_AR)) {
      expect(label, `label for ${field}`).toBeTruthy();
      expect(label.trim().length, `label for ${field}`).toBeGreaterThan(0);
      // Contains at least one Arabic character.
      expect(/[؀-ۿ]/.test(label), `Arabic in ${field}`).toBe(true);
    }
  });

  it("canonical labels for the fields the operator saw in English", () => {
    // The exact fields from the reported screenshot.
    expect(UMRAH_FIELD_LABELS_AR.nuskInvoiceNumber).toBe("رقم فاتورة نسك");
    expect(UMRAH_FIELD_LABELS_AR.nuskGroupNumber).toBe("رقم المجموعة");
    expect(UMRAH_FIELD_LABELS_AR.mutamerCount).toBe("عدد المعتمرين");
    expect(UMRAH_FIELD_LABELS_AR.totalAmount).toBe("المبلغ الإجمالي");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint + wizard wiring
// ─────────────────────────────────────────────────────────────────────────────
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("header-maps endpoint exposes labels", () => {
  it("imports UMRAH_FIELD_LABELS_AR from the engine", () => {
    expect(ROUTE).toMatch(/UMRAH_FIELD_LABELS_AR,?\s*\n\} from "\.\.\/lib\/umrahImportEngine\.js"/);
  });

  it("returns labels in BOTH mutamers and vouchers payloads", () => {
    expect(ROUTE).toMatch(/mutamers: \{[\s\S]{0,200}labels: UMRAH_FIELD_LABELS_AR/);
    expect(ROUTE).toMatch(/vouchers: \{[\s\S]{0,200}labels: UMRAH_FIELD_LABELS_AR/);
  });
});

describe("import wizard renders Arabic labels", () => {
  it("reads labels from the header-maps response", () => {
    expect(WIZARD).toMatch(/const labels = headerMapsQ\.data\?\.\[fileType\]\?\.labels \?\? \{\}/);
  });

  it("the dropdown SelectItem renders labels[field], not the raw field", () => {
    expect(WIZARD).toMatch(/<SelectItem key=\{field\} value=\{field\}>\{labels\[field\] \?\? field\}<\/SelectItem>/);
  });

  it("sorts the dropdown by the Arabic label via localeCompare(.., 'ar')", () => {
    expect(WIZARD).toMatch(/\.sort\(\(a, b\) =>\s*\n?\s*\(labels\[a\] \?\? a\)\.localeCompare\(labels\[b\] \?\? b, "ar"\)/);
  });
});

describe("rejected-row diagnostics show Arabic field names", () => {
  it("the field column maps e.fieldName through the Arabic labels", () => {
    // Was: {e.fieldName || "—"} — showed raw "passportNumber".
    expect(WIZARD).toMatch(/\{e\.fieldName \? \(errorLabels\[e\.fieldName\] \?\? e\.fieldName\) : "—"\}/);
  });

  it("formatSamplePreview translates the sample's keys via the labels map", () => {
    // The helper takes a labels arg and renders `labels[k] ?? k`.
    expect(WIZARD).toMatch(/function formatSamplePreview\([\s\S]{0,200}labels: Record<string, string> = \{\}/);
    expect(WIZARD).toMatch(/`\$\{labels\[k\] \?\? k\}: \$\{String\(v\)\}`/);
    expect(WIZARD).toMatch(/formatSamplePreview\(e\.sample, errorLabels\)/);
  });

  it("errorLabels sources from the same header-maps labels as the dropdown", () => {
    expect(WIZARD).toMatch(/const errorLabels = headerMapsQ\.data\?\.\[fileType\]\?\.labels \?\? \{\}/);
  });
});
