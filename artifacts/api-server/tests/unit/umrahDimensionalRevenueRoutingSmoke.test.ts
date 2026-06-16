import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dimensional revenue account routing — answers the operator's
 * «هل يمكن ربط الوكيل بحساب مبيعات مخصص؟ مبيعات العمرة موسم 1447
 *   ضمنها وكيل أساسي ثم وكيل فرعي، مع عدم تعارض ربطها بحساب الوكيل».
 *
 * Spans 5 surfaces (one PR):
 *   1. Migration 250 — extends subsidiary_accounts.entityType to accept
 *      umrah_agent / umrah_sub_agent / umrah_season / property_unit, and
 *      adds a partial index keyed on the resolver's lookup shape.
 *   2. revenueAccountResolver.ts — hierarchical resolver (most-specific
 *      first), single SQL with OR-of-pairs + CASE rank.
 *   3. umrahInvoicingEngine.ts — calls the resolver once per invoice,
 *      overrides each line's accountCode before the GL post (covers NEW).
 *   4. POST /umrah/reclassify-revenue — walks OLD invoices and posts
 *      audit-safe compensating entries (covers OLD — operator's
 *      «على القديم والجديد»).
 *   5. /finance/subsidiary-accounts UI — exposes the 4 new entityTypes
 *      + the "revenue" accountType to the operator (closes the loop).
 */

const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/250_subsidiary_accounts_umrah_property_unit.sql"),
  "utf8",
);
const RESOLVER = readFileSync(
  join(import.meta.dirname!, "../../src/lib/revenueAccountResolver.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);
const ROUTE_ENT = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const UI_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/subsidiary-accounts.tsx"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Migration 250
// ─────────────────────────────────────────────────────────────────────────────
describe("migration 250 — subsidiary_accounts dimensional extension", () => {
  it("drops the old check constraint idempotently before re-adding", () => {
    expect(MIGRATION).toMatch(/DO \$\$[\s\S]*?conname = 'subsidiary_accounts_entityType_check'[\s\S]*?DROP CONSTRAINT/);
  });

  it("re-adds the constraint with the 4 new entity types alongside the original 5", () => {
    const expected = [
      "'employee'", "'client'", "'vendor'", "'project'", "'property'",
      "'umrah_agent'", "'umrah_sub_agent'", "'umrah_season'", "'property_unit'",
    ];
    const checkBlock = MIGRATION.match(/ADD CONSTRAINT "subsidiary_accounts_entityType_check"[\s\S]*?\]\)\);/);
    expect(checkBlock).toBeTruthy();
    for (const e of expected) {
      expect(checkBlock![0]).toContain(e);
    }
  });

  it("adds the partial index keyed for the resolver's (companyId, entityType, entityId, accountType) lookup", () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_subsidiary_accounts_entity_lookup/);
    expect(MIGRATION).toMatch(/\("companyId", "entityType", "entityId", "accountType"\)/);
    expect(MIGRATION).toMatch(/WHERE "deletedAt" IS NULL AND "isActive" = true/);
  });

  it("has a @rollback annotation matching the canonical pattern", () => {
    expect(MIGRATION).toContain("@rollback:");
    expect(MIGRATION).toContain("DROP CONSTRAINT IF EXISTS subsidiary_accounts_entityType_check");
    expect(MIGRATION).toContain("DROP INDEX IF EXISTS idx_subsidiary_accounts_entity_lookup");
  });

  it("schema_pre.sql mirrors the extended check constraint", () => {
    const ext = SCHEMA.match(/subsidiary_accounts_entityType_check[\s\S]{0,800}/);
    expect(ext).toBeTruthy();
    for (const e of ["umrah_agent", "umrah_sub_agent", "umrah_season", "property_unit"]) {
      expect(ext![0]).toContain(e);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Resolver — priority chain
// ─────────────────────────────────────────────────────────────────────────────
describe("revenueAccountResolver — priority chain", () => {
  it("walks 5 dimensions in the documented order: sub-agent → agent → season → unit → property", () => {
    const chainBlock = RESOLVER.match(/const chain[\s\S]{0,500}\];/);
    expect(chainBlock).toBeTruthy();
    const orderedTypes = ["umrah_sub_agent", "umrah_agent", "umrah_season", "property_unit", "property"];
    let lastIdx = -1;
    for (const t of orderedTypes) {
      const i = chainBlock![0].indexOf(`"${t}"`);
      expect(i).toBeGreaterThan(lastIdx);
      lastIdx = i;
    }
  });

  it("ranks results SQL-side via CASE entityType (most-specific = lowest rank)", () => {
    expect(RESOLVER).toMatch(/CASE sa\."entityType"\s+WHEN 'umrah_sub_agent' THEN 1\s+WHEN 'umrah_agent'\s+THEN 2\s+WHEN 'umrah_season'\s+THEN 3\s+WHEN 'property_unit'\s+THEN 4\s+WHEN 'property'\s+THEN 5/);
    expect(RESOLVER).toMatch(/ORDER BY _rank ASC\s+LIMIT 1/);
  });

  it("filters by companyId + accountType + isActive=true + deletedAt IS NULL (defence in depth)", () => {
    expect(RESOLVER).toMatch(/WHERE sa\."companyId" = \$1/);
    expect(RESOLVER).toMatch(/AND sa\."accountType" = \$2/);
    expect(RESOLVER).toMatch(/AND sa\."isActive" = true/);
    expect(RESOLVER).toMatch(/AND sa\."deletedAt" IS NULL/);
  });

  it("returns null when the hint has no positive ids (cheap no-op for invoices without dimensions)", () => {
    expect(RESOLVER).toMatch(/if \(tuples\.length === 0\) return null;/);
  });

  it("JOINs chart_of_accounts with companyId guard (no cross-tenant code leak)", () => {
    expect(RESOLVER).toMatch(/JOIN chart_of_accounts coa\s+ON coa\.id = sa\."accountId"\s+AND coa\."companyId" = sa\."companyId"/);
  });

  it("only fills positive numeric ids — filters out null/undefined/0", () => {
    expect(RESOLVER).toMatch(/\.filter\(\(\[, id\]\) => typeof id === "number" && id != null && id > 0\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Engine wire-in — covers NEW invoices
// ─────────────────────────────────────────────────────────────────────────────
describe("umrahInvoicingEngine — dimensional override wired into line generation", () => {
  it("imports the resolver from the dedicated module", () => {
    expect(ENGINE).toMatch(/import \{ resolveRevenueAccount \} from "\.\/revenueAccountResolver\.js"/);
  });

  it("resolves the override ONCE per invoice (one resolver call, not per-line)", () => {
    const calls = ENGINE.match(/await resolveRevenueAccount\(/g);
    expect(calls?.length ?? 0).toBe(1);
  });

  it("passes the full dimensional hint: subAgentId + agentId + seasonId", () => {
    expect(ENGINE).toMatch(/await resolveRevenueAccount\(\s*scope\.companyId,\s*\{\s*subAgentId,\s*agentId: \(subAgent\.agentId as number \| null\) \?\? null,\s*seasonId,\s*\}/);
  });

  it("treats the resolved override as most-specific — it ?? overrides the product default on every line-emission site", () => {
    // §6 of #1870 collapsed the legacy 3-line split (visa + transport
    // + services) into 2 lines (visa + ground-service). So the
    // override now applies on 3 sites total: 2 split-path lines
    // (visa + ground-service) + 1 bundled fallback. The fewer line
    // count is the operator's preference, not a regression.
    const overrides = ENGINE.match(/accountCode: overrideAccountCode \?\? /g);
    expect(overrides?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("falls through to product-default accountCode when override is null (additive change, no regression)", () => {
    // The null-coalesce keeps the existing behaviour byte-identical
    // for companies that haven't configured any dimensional override.
    // §6 folded transport into ground-service so the transport-line
    // site is gone; the resolver still covers it via canSplit's
    // transport-mapping gate.
    expect(ENGINE).toMatch(/overrideAccountCode \?\? productMap!\.visaAccountCode/);
    expect(ENGINE).toMatch(/overrideAccountCode \?\? productMap!\.servicesAccountCode/);
    expect(ENGINE).toMatch(/overrideAccountCode \?\? servicesAccountCode/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reclassify reverse — covers OLD invoices.
//
// The route handler is a THIN wrapper that calls
// reclassifyRevenueForInvoices() in the umrahReclassifyEngine. The
// lint-patterns rule "direct-gl-import-in-domain-route" forbids
// GL helpers + accounting-mapping lookups in non-finance routes, so
// the entire scan + posting machinery lives in the engine. We pin
// the route's wrapper shape AND the engine's invariants separately.
// ─────────────────────────────────────────────────────────────────────────────
const RECLASS_ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahReclassifyEngine.ts"),
  "utf8",
);

describe("POST /umrah/reclassify-revenue — thin wrapper around the engine", () => {
  it("registers under feature: umrah, action: update (write permission)", () => {
    expect(ROUTE_ENT).toMatch(/router\.post\("\/reclassify-revenue", authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"update"\s*\}\)/);
  });

  it("accepts narrowing filters: invoiceIds + subAgentId + seasonId + dryRun", () => {
    expect(ROUTE_ENT).toMatch(/const reclassifyRevenueSchema = z\.object\(\{[\s\S]*?invoiceIds: z\.array\(z\.coerce\.number\(\)\.int\(\)\.positive\(\)\)\.optional\(\),[\s\S]*?subAgentId:[\s\S]*?seasonId:[\s\S]*?dryRun: z\.boolean\(\)\.optional\(\),[\s\S]*?\}\);/);
  });

  it("delegates to reclassifyRevenueForInvoices(scope, body) — no inline GL helper calls", () => {
    expect(ROUTE_ENT).toMatch(/import \{ reclassifyRevenueForInvoices \} from "\.\.\/lib\/umrahReclassifyEngine\.js"/);
    expect(ROUTE_ENT).toMatch(/const result = await reclassifyRevenueForInvoices\(scope, body\)/);
  });
});

describe("umrahReclassifyEngine.reclassifyRevenueForInvoices — invariants («على القديم»)", () => {
  it("excludes cancelled invoices from the scan (no reclassification of voided sales)", () => {
    expect(RECLASS_ENGINE).toMatch(/inv\.status != 'cancelled'/);
  });

  it("joins umrah_sub_agents to derive agentId in one round-trip (avoids N+1 lookups)", () => {
    expect(RECLASS_ENGINE).toMatch(/JOIN umrah_sub_agents sa\s+ON sa\.id = inv\."subAgentId"\s+AND sa\."companyId" = inv\."companyId"/);
  });

  it("calls the resolver — single source of truth for the priority chain", () => {
    expect(RECLASS_ENGINE).toMatch(/await resolveRevenueAccount\(/);
    expect(RECLASS_ENGINE).toMatch(/subAgentId: inv\.subAgentId/);
    expect(RECLASS_ENGINE).toMatch(/agentId: inv\.agentId/);
    expect(RECLASS_ENGINE).toMatch(/seasonId: inv\.seasonId/);
  });

  it("reads current accountCode per invoice from umrah_sales_invoice_items (NULL → company default)", () => {
    expect(RECLASS_ENGINE).toMatch(/COALESCE\("accountCode", \$1\) AS code/);
    expect(RECLASS_ENGINE).toMatch(/FROM umrah_sales_invoice_items/);
    expect(RECLASS_ENGINE).toMatch(/WHERE "invoiceId" = \$2 AND "itemType" = 'group'/);
  });

  it("posts a COMPENSATING journal entry (audit-safe, never rewrites historical lines)", () => {
    expect(RECLASS_ENGINE).toMatch(/accountCode: m\.fromCode,\s*debit: m\.amount,\s*credit: 0/);
    expect(RECLASS_ENGINE).toMatch(/accountCode: targetCode,\s*debit: 0,\s*credit: m\.amount/);
  });

  it("carries umrahAgentId + umrahSeasonId dimensions on every GL line (drill-down preserved)", () => {
    expect(RECLASS_ENGINE).toMatch(/umrahAgentId: inv\.agentId \?\? undefined/);
    expect(RECLASS_ENGINE).toMatch(/umrahSeasonId: inv\.seasonId \?\? undefined/);
  });

  it("idempotent via sourceKey: `umrah_reclass_${id}_to_${target}` (re-runs are no-ops)", () => {
    expect(RECLASS_ENGINE).toMatch(/sourceKey: `umrah_reclass_\$\{inv\.id\}_to_\$\{targetCode\}`/);
  });

  it("uses sourceType 'umrah_revenue_reclass' (distinct from the original posting)", () => {
    expect(RECLASS_ENGINE).toMatch(/sourceType: "umrah_revenue_reclass"/);
    expect(RECLASS_ENGINE).toMatch(/type: "reclassification"/);
  });

  it("persists the new accountCode on items so the next run sees 'already aligned'", () => {
    expect(RECLASS_ENGINE).toMatch(/UPDATE umrah_sales_invoice_items\s+SET "accountCode" = \$1\s+WHERE "invoiceId" = \$2 AND "itemType" = 'group'/);
  });

  it("dryRun mode skips JE posting + items update (preview-safe)", () => {
    expect(RECLASS_ENGINE).toMatch(/if \(dryRun\) \{[\s\S]{1,400}continue;\s*\}/);
  });

  it("summary buckets: scanned + reclassified + alreadyAligned + noOverride + failed", () => {
    expect(RECLASS_ENGINE).toMatch(/const summary = \{\s*scanned: invoices\.length,\s*reclassified: 0,\s*alreadyAligned: 0,\s*noOverride: 0,\s*failed: 0,\s*\};/);
  });

  it("emits umrah.invoice.revenue_reclassified event per reclassified invoice (audit trail signal)", () => {
    expect(RECLASS_ENGINE).toMatch(/action: "umrah\.invoice\.revenue_reclassified"/);
  });

  it("logs the bulk operation as an audit log (action=reclassify or preview for dryRun)", () => {
    expect(RECLASS_ENGINE).toMatch(/action: dryRun \? "preview" : "reclassify"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UI — operator surfaces the new dimensions + accountType
// ─────────────────────────────────────────────────────────────────────────────
describe("subsidiary-accounts UI — operator picker extended", () => {
  it("ENTITY_TYPES surfaces the 4 new dimensions for selection", () => {
    for (const id of ["property_unit", "umrah_agent", "umrah_sub_agent", "umrah_season"]) {
      expect(UI_PAGE).toMatch(new RegExp(`{\\s*value:\\s*"${id}"`));
    }
  });

  it("ACCOUNT_TYPES surfaces 'revenue' (the slot the resolver reads from)", () => {
    expect(UI_PAGE).toMatch(/\{\s*value:\s*"revenue",\s*label:\s*"إيراد"\s*\}/);
  });

  it("zod formSchema z.enum is widened to accept all 10 entity values", () => {
    const enumBlock = UI_PAGE.match(/entityType: z\.enum\(\[[\s\S]*?\]\)/);
    expect(enumBlock).toBeTruthy();
    for (const id of [
      "employee", "client", "vendor", "vehicle", "driver", "property",
      "property_unit", "umrah_agent", "umrah_sub_agent", "umrah_season",
    ]) {
      expect(enumBlock![0]).toContain(`"${id}"`);
    }
  });

  it("EntityPicker renders a numeric input for each new dimension (placeholder in Arabic)", () => {
    expect(UI_PAGE).toContain(`placeholder="رقم وكيل العمرة"`);
    expect(UI_PAGE).toContain(`placeholder="رقم الوكيل الفرعي"`);
    expect(UI_PAGE).toContain(`placeholder="رقم موسم العمرة"`);
    expect(UI_PAGE).toContain(`placeholder="رقم الوحدة العقارية"`);
  });
});
