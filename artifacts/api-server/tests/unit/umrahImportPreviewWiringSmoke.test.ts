import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the rewiring of POST /umrah/import/preview to actually use the
 * engine's previewMutamersImport / previewVouchersImport — the path that
 * generates the agent-linking warnings (newAgentsToCreate +
 * rowsWithoutAgent) the wizard's UI banners depend on.
 *
 * Before this PR the route ran inline legacy logic that returned
 * `totalRows / newRecords / duplicateRecords / errorRecords`. The wizard
 * UI expects `total / newCount / updatedCount / errorCount /
 * newAgentsToCreate / rowsWithoutAgent`, so the banners + counters were
 * silently broken.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const NAV = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("umrah route — /import/preview wired through the engine", () => {
  it("imports previewMutamersImport + previewVouchersImport", () => {
    // Both must be imported from the engine. The import block carries
    // other engine exports too (normalizeImportRows, the header maps,
    // UMRAH_FIELD_LABELS_AR), so the windows between the two names and
    // the closing brace are generous — this pins presence + source,
    // not field ordering.
    expect(ROUTE).toMatch(/import\s*\{[\s\S]{1,600}previewMutamersImport,[\s\S]{1,400}previewVouchersImport,?[\s\S]{1,400}\}\s*from\s*"\.\.\/lib\/umrahImportEngine\.js"/);
  });

  it("delegates by fileType: vouchers → previewVouchersImport, default → previewMutamersImport", () => {
    // The discriminator variable may be the raw `fileType` or the
    // normalized union literal — what matters is voucher rows take the
    // voucher-preview branch.
    expect(ROUTE).toMatch(/(?:fileType|normalizedFileType)\s*===\s*"vouchers"\s*\?\s*[\r\n\s]*await previewVouchersImport/);
    expect(ROUTE).toMatch(/:\s*[\r\n\s]*await previewMutamersImport\(importScope,/);
  });

  it("response includes the modern UI field names (total / newCount / updatedCount / errorCount)", () => {
    // The wizard's PreviewSummary interface uses these names. Without
    // them the counters in step 2 render as "—".
    expect(ROUTE).toMatch(/total:\s*diff\.totalRows/);
    expect(ROUTE).toMatch(/newCount:\s*diff\.newRows\.length/);
    expect(ROUTE).toMatch(/updatedCount:\s*diff\.updatedRows\.length/);
    expect(ROUTE).toMatch(/errorCount:\s*diff\.errorRows\.length/);
  });

  it("response surfaces newAgentsToCreate + rowsWithoutAgent (gap #5 warnings reach the UI)", () => {
    // These are the warnings that previously sat in dead engine code;
    // wiring them through the route is the whole point of gap #5.
    expect(ROUTE).toMatch(/newAgentsToCreate:\s*diff\.newAgentsToCreate/);
    expect(ROUTE).toMatch(/rowsWithoutAgent:\s*diff\.rowsWithoutAgent/);
  });

  it("normalises errors into the rich shape the wizard renders as a table", () => {
    // Includes:
    //   - row     : 1-based, so the operator's row number matches Excel.
    //   - message : human reason.
    //   - fieldName / sample : structured metadata so the UI shows WHICH
    //                          column failed + a row preview the operator
    //                          can match against the source file.
    expect(ROUTE).toMatch(/errors:\s*diff\.errorRows\.map/);
    expect(ROUTE).toMatch(/row:\s*e\.rowIndex \+ 1/);
    expect(ROUTE).toMatch(/message:\s*e\.error/);
    expect(ROUTE).toMatch(/fieldName:\s*e\.fieldName \?\? null/);
    expect(ROUTE).toMatch(/sample:\s*e\.sample \?\? null/);
  });

  it("keeps legacy field names alongside the modern ones for back-compat", () => {
    // Older callers / mobile clients may have snapshotted the previous
    // shape. The new route ships both names from the same diff.
    expect(ROUTE).toContain("totalRows: diff.totalRows");
    expect(ROUTE).toContain("newRecords: diff.newRows.length");
    expect(ROUTE).toContain("duplicateRecords: diff.skippedCount");
    expect(ROUTE).toContain("errorRecords: diff.errorRows.length");
  });

  it("the analytics event carries the new counters", () => {
    // emitEvent payload mirrors the response, so audit/analytics queries
    // see the same field names as the wizard UI.
    expect(ROUTE).toMatch(/details:[\s\S]{1,400}newCount:\s*diff\.newRows\.length/);
    expect(ROUTE).toMatch(/newAgentsCount:\s*diff\.newAgentsToCreate\.length/);
    expect(ROUTE).toMatch(/rowsWithoutAgent:\s*diff\.rowsWithoutAgent/);
  });

  it("entity on the audit event reflects the actual write target per fileType", () => {
    // mutamers preview writes to umrah_pilgrims; vouchers preview writes
    // to umrah_nusk_invoices. The event tag matches so downstream alerts
    // route by source.
    expect(ROUTE).toMatch(/entity:\s*fileType\s*===\s*"vouchers"\s*\?\s*"umrah_nusk_invoices"\s*:\s*"umrah_pilgrims"/);
  });
});

describe("frontend — UmrahTabsNav exposes /umrah/sales-wizard", () => {
  it("registers the معالج المبيعات tab next to التسعير and الفواتير", () => {
    expect(NAV).toContain('"/umrah/sales-wizard"');
    expect(NAV).toContain('"معالج المبيعات"');
  });

  it("places the new tab between pricing and invoices in the workflow order", () => {
    const idxPricing = NAV.indexOf("/umrah/pricing");
    const idxWizard = NAV.indexOf("/umrah/sales-wizard");
    const idxInvoices = NAV.indexOf("/umrah/invoices");
    expect(idxPricing).toBeGreaterThan(0);
    expect(idxWizard).toBeGreaterThan(idxPricing);
    expect(idxInvoices).toBeGreaterThan(idxWizard);
  });

  it("imports the Sparkles icon for the new tab", () => {
    // Position-independent — pin only that the symbol is in the
    // lucide-react import block. Earlier this regex required Sparkles
    // to be the LAST symbol before `}`, which broke whenever another
    // tab added a new icon import below it.
    expect(NAV).toMatch(/Sparkles[\s\S]{0,500}from\s*"lucide-react"/);
  });
});
