import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins Phase 3c — the engine resolver that reads the 3 service-
 * product mappings (PR #1469 / migration 241) and routes each 'group'
 * lineItem through the services product's account + tax code.
 *
 * Phase 3c is INTENTIONALLY conservative — only the services
 * mapping is consumed today. Visa + transport mappings are
 * resolved into the productMap so Phase 3d's per-NUSK split has
 * the data ready, but they don't affect today's generated lines
 * until that split lands. When no product is configured, the line's
 * accountCode + vatRate fall back to undefined and the
 * invoice-header / Phase 2 bucketing defaults apply.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("Phase 3c — productMap resolver query", () => {
  it("fetches the 3 mappings + tax codes + account codes in ONE query", () => {
    // Six round-trips per invoice would be wasteful. The resolver
    // packs companies + 3 products + 3 chart_of_accounts into one
    // SELECT with LEFT JOINs.
    expect(ENGINE).toMatch(/SELECT c\."umrahVisaProductId"[\s\S]{1,3000}FROM companies c[\s\S]{1,3000}WHERE c\.id = \$1/);
  });

  it("each product JOIN gates on companyId (defence-in-depth)", () => {
    // A stale FK pointing at another tenant's product would let the
    // resolver lift their account into THIS company's invoice. Pin
    // the companyId guard on all 3 product joins.
    const productJoins = ENGINE.match(/LEFT JOIN products p[vst][\s\S]{0,200}p[vst]\."companyId" = c\.id/g) ?? [];
    expect(productJoins.length).toBe(3);
  });

  it("each chart_of_accounts JOIN also gates on companyId", () => {
    // Same defence-in-depth — account ids are global per tenant
    // and a wrong-tenant code would still post a balanced JE but
    // to the wrong books. Pin the guard on all 3 COA joins.
    const accountJoins = ENGINE.match(/LEFT JOIN chart_of_accounts (?:av|asv|at)[\s\S]{0,200}\."companyId" = c\.id/g) ?? [];
    expect(accountJoins.length).toBe(3);
  });

  it("resolves all 9 fields the TS type declares (no silent gaps)", () => {
    // visaProductId / visaTaxCode / visaAccountCode + same for
    // services and transport. Missing any one would yield undefined
    // at the call site and a future split could route revenue
    // wrong without throwing.
    expect(ENGINE).toMatch(/AS "visaProductId"/);
    expect(ENGINE).toMatch(/AS "visaTaxCode"/);
    expect(ENGINE).toMatch(/AS "visaAccountCode"/);
    expect(ENGINE).toMatch(/AS "servicesProductId"/);
    expect(ENGINE).toMatch(/AS "servicesTaxCode"/);
    expect(ENGINE).toMatch(/AS "servicesAccountCode"/);
    expect(ENGINE).toMatch(/AS "transportProductId"/);
    expect(ENGINE).toMatch(/AS "transportTaxCode"/);
    expect(ENGINE).toMatch(/AS "transportAccountCode"/);
  });
});

describe("Phase 3c — group lineItem consumes the resolved services mapping", () => {
  it("group lineItem reads servicesProductId from the resolved map", () => {
    expect(ENGINE).toMatch(/const servicesProductId = productMap\?\.servicesProductId \?\? null/);
  });

  it("group lineItem reads servicesAccountCode from the resolved map", () => {
    expect(ENGINE).toMatch(/const servicesAccountCode = productMap\?\.servicesAccountCode \?\? null/);
  });

  it("group lineItem maps 'zero' / 'exempt' tax codes to vatRate=0", () => {
    // The contract the user described:
    //   تأشيرة 422 — بدون ضريبة (zero-rated)
    // The services product is typically standard 15% but operators
    // CAN configure it as zero/exempt for special cases. Pin the
    // exact mapping so a future enum addition doesn't silently
    // default to standard for new codes.
    expect(ENGINE).toMatch(/productMap\?\.servicesTaxCode === "zero" \|\| productMap\?\.servicesTaxCode === "exempt"\s*\?\s*0\s*:\s*undefined/);
  });

  it("group lineItem.push includes the per-line fields from the resolver", () => {
    // Phase 1 (#1467) added the columns; Phase 3c populates them
    // from the resolver. Anchor on the push block so future
    // additions (e.g., violationId reordering) don't churn.
    expect(ENGINE).toMatch(/lineItems\.push\(\{\s*itemType: "group"[\s\S]{1,800}productId: servicesProductId,\s*accountCode: servicesAccountCode,\s*vatRate: servicesVatRate/);
  });

  it("falls back gracefully when no services product is configured", () => {
    // ?? null on both servicesProductId + servicesAccountCode means
    // the line stores null, which Phase 2's bucketing collapses to
    // the default revCode bucket → byte-identical output to before.
    expect(ENGINE).toMatch(/servicesProductId \?\? null/);
    expect(ENGINE).toMatch(/servicesAccountCode \?\? null/);
  });
});

describe("Phase 3c — Phase 3d foundation", () => {
  it("visa + transport mappings are RESOLVED but not yet CONSUMED on the group line", () => {
    // Pin the resolver's read so Phase 3d can pick them up. The
    // group lineItem deliberately doesn't reference them yet —
    // they need the per-NUSK split to be useful.
    expect(ENGINE).toMatch(/productMap\?\.servicesProductId/);
    // The visa + transport references should NOT appear inside the
    // group lineItem push block — Phase 3d will add them when the
    // engine splits each group into 3 sub-lines.
    const groupPush = ENGINE.match(/lineItems\.push\(\{\s*itemType: "group"[\s\S]{1,1000}\}\);/);
    expect(groupPush).not.toBeNull();
    expect(groupPush![0]).not.toMatch(/visaProductId/);
    expect(groupPush![0]).not.toMatch(/transportProductId/);
  });
});
