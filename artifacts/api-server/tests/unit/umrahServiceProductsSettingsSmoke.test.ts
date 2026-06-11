import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins Phase 3a — service-type → product mapping on companies +
 * extension of the existing /umrah/settings endpoints to read/write
 * it. Phase 3b (next PR) will use these FKs in the engine resolver
 * to populate per-line accountCode / vatRate from the products
 * masters, enabling the actual visa/services/transport GL split.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/241_companies_umrah_service_products.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("migration 241 — companies umrahVisa/Services/TransportProductId", () => {
  it("adds the 3 nullable integer FK columns (additive — no backfill)", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "umrahVisaProductId" integer/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "umrahServicesProductId" integer/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "umrahTransportProductId" integer/);
  });

  it("rollback annotation drops all 3 (additive ⇒ trivial undo)", () => {
    expect(MIGRATION).toMatch(/-- @rollback: ALTER TABLE companies/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "umrahTransportProductId"/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "umrahServicesProductId"/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "umrahVisaProductId"/);
  });

  it("schema_pre.sql mirror has the 3 columns on companies", () => {
    const block = SCHEMA.match(/CREATE TABLE public\.companies \(([\s\S]*?)\);/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/"umrahVisaProductId" integer/);
    expect(block![1]).toMatch(/"umrahServicesProductId" integer/);
    expect(block![1]).toMatch(/"umrahTransportProductId" integer/);
  });
});

describe("nullableFkPreproc — shared preprocess for nullable FKs", () => {
  it("maps '' to null but leaves undefined alone so PATCH preserves vs. clears correctly", () => {
    // The crux of PATCH semantics for /umrah/settings: a field absent
    // from the body must be PRESERVED (engine sees undefined), a
    // field set to null must be CLEARED (engine sees null), a field
    // set to value must be UPDATED. The settings preprocess MUST
    // distinguish "" (treat as clear) from undefined (preserve);
    // folding both → null would make PATCH unable to preserve.
    //
    // Scope assertion to the `nullableFkPreproc` definition specifically
    // — there's an UNRELATED `nullableFkId` preprocess from PR #1428
    // (patchPilgrimSchema) that folds both, which is correct for
    // that use case (the reassign modal only sends explicit values).
    const settingsPreproc = ROUTE.match(/const nullableFkPreproc = z\.preprocess\([\s\S]{0,400}\);/);
    expect(settingsPreproc).not.toBeNull();
    expect(settingsPreproc![0]).toContain('v === "" ? null : v');
    expect(settingsPreproc![0]).not.toMatch(/v === "" \|\| v === undefined/);
  });
});

describe("GET /umrah/settings — returns the 3 product mappings + names", () => {
  it("LEFT JOINs products 3 times so the UI shows names without 3 extra fetches", () => {
    const m = ROUTE.match(/router\.get\("\/settings"[\s\S]*?(?=router\.\w+\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    expect(handler).toMatch(/LEFT JOIN products pv[\s\S]{1,200}pv\."companyId" = c\.id/);
    expect(handler).toMatch(/LEFT JOIN products ps[\s\S]{1,200}ps\."companyId" = c\.id/);
    expect(handler).toMatch(/LEFT JOIN products pt[\s\S]{1,200}pt\."companyId" = c\.id/);
  });

  it("returns null placeholders for all fields when company row is missing", () => {
    expect(ROUTE).toMatch(/umrahVisaProductId: null,\s*umrahVisaProductName: null/);
    expect(ROUTE).toMatch(/umrahServicesProductId: null,\s*umrahServicesProductName: null/);
    expect(ROUTE).toMatch(/umrahTransportProductId: null,\s*umrahTransportProductName: null/);
  });
});

describe("PATCH /umrah/settings — validates + dynamic SET clause", () => {
  it("each product FK is verified to belong to THIS company (defence-in-depth)", () => {
    // Cross-tenant product id leaking through settings would silently
    // mis-route revenue on every future invoice. The check matches
    // the existing supplier-check pattern from PR #1456.
    expect(ROUTE).toMatch(/SELECT id FROM products WHERE id=\$1 AND "companyId"=\$2/);
  });

  it("the validation iterates ALL 3 product fields (no silent miss)", () => {
    expect(ROUTE).toMatch(/\["umrahVisaProductId"[\s\S]{0,80}\["umrahServicesProductId"[\s\S]{0,80}\["umrahTransportProductId"/);
  });

  it("UPDATE is built dynamically based on which fields are present (true PATCH semantics)", () => {
    // The previous draft used COALESCE which made "clear to null"
    // impossible — pin the dynamic-set approach to lock in PATCH
    // semantics (omit=preserve, null=clear, value=update).
    expect(ROUTE).toMatch(/if \(value === undefined\) continue/);
    expect(ROUTE).toMatch(/sets\.push\(`"\$\{field\}" = \$\$\{params\.length\}`\)/);
  });

  it("audit log captures only the fields the operator actually changed", () => {
    // Audit logs are evidence. Logging unchanged values would muddy
    // the trail and could mislead a compliance reviewer (looks like
    // every setting was touched when only one was). §8 of #1870
    // widened the type to accept string|boolean for the new
    // umrahVatMode + commissionViaHr knobs alongside the existing
    // number|null fields — the captures-only-what-changed invariant
    // stays exactly the same.
    expect(ROUTE).toMatch(/auditAfter: Record<string, number \| string \| boolean \| null> = \{\}/);
    expect(ROUTE).toMatch(/auditAfter\[field\] = value/);
  });

  it("response echoes only the changed fields (consistent with audit log)", () => {
    expect(ROUTE).toMatch(/res\.json\(\{ success: true, \.\.\.auditAfter \}\)/);
  });
});
