import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Arabic-as-origin continuation (المرحلة 3 — part of the audit trail):
 *
 *   The batch-changes drill-down ("تفاصيل التعديلات للدفعة #N") was
 *   reading `c.changeKind ?? c.action` from the API response, but the
 *   actual schema column populated by `logChange()` is `changeType` —
 *   so the column always rendered "—". Same shape for entityType.
 *
 *   The fix:
 *     1. Read the real columns (`entityType`, `changeType`, `fieldName`).
 *     2. Translate them via inline AR dictionaries — operators see
 *        "معتمر / أُنشئ" not raw "mutamer / created".
 *     3. Translate `fieldName` via the same `/import/header-maps`
 *        labels source so "totalAmount" reads "المبلغ الإجمالي" in
 *        the change row.
 */
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);

describe("import-wizard batch-changes — Arabic audit trail labels", () => {
  it("entity dictionary covers every entityType the engine actually emits", () => {
    // Pin the engine's emit-side so any new entityType has to also land
    // here, forcing the wizard's AR map to grow alongside the engine.
    expect(ENGINE).toMatch(/logChange\(client, batchId, "mutamer"/);
    expect(ENGINE).toMatch(/logChange\(client, batchId, "nusk_invoice"/);
    expect(WIZARD).toMatch(/IMPORT_CHANGE_ENTITY_LABELS_AR[\s\S]{0,200}mutamer:\s*"معتمر"/);
    expect(WIZARD).toMatch(/IMPORT_CHANGE_ENTITY_LABELS_AR[\s\S]{0,200}nusk_invoice:\s*"فاتورة نُسك"/);
  });

  it("changeType dictionary covers created / updated / skipped / error", () => {
    // Same lock-step contract as entityType.
    expect(ENGINE).toMatch(/"created"/);
    expect(ENGINE).toMatch(/"updated"/);
    expect(ENGINE).toMatch(/"skipped"/);
    expect(ENGINE).toMatch(/"error"/);
    expect(WIZARD).toMatch(/IMPORT_CHANGE_TYPE_LABELS_AR[\s\S]{0,400}created:\s*"أُنشئ"/);
    expect(WIZARD).toMatch(/IMPORT_CHANGE_TYPE_LABELS_AR[\s\S]{0,400}updated:\s*"حُدّث"/);
    expect(WIZARD).toMatch(/IMPORT_CHANGE_TYPE_LABELS_AR[\s\S]{0,400}skipped:\s*"تُجوهل"/);
    expect(WIZARD).toMatch(/IMPORT_CHANGE_TYPE_LABELS_AR[\s\S]{0,400}error:\s*"خطأ"/);
  });

  it("renders the actual schema column (changeType) not the legacy ghost field (changeKind)", () => {
    // The previous code read `c.changeKind ?? c.action` — both names
    // never existed in `umrah_import_changes`. Lock to the real column
    // and prove the legacy fallback is gone.
    expect(WIZARD).toMatch(/IMPORT_CHANGE_TYPE_LABELS_AR\[c\.changeType\]/);
    expect(WIZARD).not.toMatch(/c\.changeKind/);
    expect(WIZARD).not.toMatch(/c\.action\s*\?\?/);
  });

  it("entity render reads c.entityType not the legacy c.table fallback", () => {
    expect(WIZARD).toMatch(/IMPORT_CHANGE_ENTITY_LABELS_AR\[c\.entityType\]/);
    expect(WIZARD).not.toMatch(/c\.table\s*\?\?/);
  });

  it("fieldName is translated via /import/header-maps labels (same source as elsewhere)", () => {
    // Both header dictionaries are merged so the change row can resolve
    // either a mutamer field (e.g. passportNumber) or a voucher field
    // (e.g. totalAmount) without knowing which fileType the batch was.
    expect(WIZARD).toMatch(/\.\.\.\(headerMapsQ\.data\?\.mutamers\?\.labels \?\? \{\}\),/);
    expect(WIZARD).toMatch(/\.\.\.\(headerMapsQ\.data\?\.vouchers\?\.labels \?\? \{\}\),/);
    expect(WIZARD).toMatch(/c\.fieldName \? \(fieldLabels\[c\.fieldName\] \?\? c\.fieldName\) : null/);
  });

  it("entity id renders through formatNumber so it picks up Arabic-Indic digits", () => {
    // formatNumber is the project-wide formatter that already toggles
    // Arabic-Indic numerals from the global format setting, so the
    // change row stays consistent with every other number on screen.
    expect(WIZARD).toMatch(/#\{formatNumber\(c\.entityId \?\? 0\)\}/);
  });
});
