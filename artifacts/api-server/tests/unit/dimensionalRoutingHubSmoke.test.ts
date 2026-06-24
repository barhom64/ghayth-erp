import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The unified «التأصيل المالي» dashboard + the supporting endpoint +
 * the department auto-CC wiring + the tree-CTE activity enrichment.
 * This is the capstone PR for the «النظام المالي متأصل في اصل النظام»
 * arc — operators get a single-page coverage report with one-click
 * backfills per entity type.
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const SETTINGS = readFileSync(
  join(import.meta.dirname!, "../../src/routes/settings.ts"),
  "utf8",
);
const HUB_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dimensional-routing.tsx"),
  "utf8",
);
const TREE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-centers-tree.tsx"),
  "utf8",
);
const ROUTES_TSX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);
// FinanceTabsNav is now a thin wrapper over <ModuleTabsNav> that derives its
// tabs from navigation.registry — so the dimensional-routing entry lives in the
// registry (the single source the bar mirrors), which is what we assert on.
const TABS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Department auto-CC wiring
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /settings/departments — auto-creates a CC under the branch", () => {
  it("fires createCostCenterForEntity with entityType='department'", () => {
    expect(SETTINGS).toMatch(/createCostCenterForEntity\(\s*scope\.companyId,\s*"department",\s*r\.insertId,\s*name,/);
  });

  it("nests under the current branch when one is in scope (BR-####-D####)", () => {
    expect(SETTINGS).toMatch(/parentEntityType: scope\.branchId \? "branch" : null,\s*parentEntityId: scope\.branchId \?\? null/);
  });

  it("fire-and-forget — non-blocking on the create path", () => {
    expect(SETTINGS).toMatch(/createCostCenterForEntity\([\s\S]{1,400}\.catch\(\(e\) => logger\.error\(e, "department cost-centre auto-create failed"\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Backfill — departments added
// ─────────────────────────────────────────────────────────────────────────────
const BACKFILL = (() => {
  const m = FCC.match(/router\.post\("\/cost-centers\/backfill"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport \{)/);
  if (!m) throw new Error("/cost-centers/backfill handler not found");
  return m[0];
})();

describe("Backfill — departments added (5 entity types now)", () => {
  it("zod enum lists all 5 entityTypes", () => {
    expect(FCC).toMatch(/entityType: z\.enum\(\["branch", "project", "contract", "vehicle", "department"\]\)/);
  });

  it("summary carries the new 'departments' counter", () => {
    expect(BACKFILL).toContain("departments:");
  });

  it("departments loop reads from departments + derives branch from earliest JE w/ departmentId", () => {
    expect(BACKFILL).toContain("FROM departments d");
    // The branch hint subquery joins through journal_lines.departmentId
    // — that's the only signal we have because departments doesn't
    // carry a branchId column.
    expect(BACKFILL).toMatch(/jl\."departmentId" = d\.id/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tree CTE enrichment — jeCount + lastActivityAt
// ─────────────────────────────────────────────────────────────────────────────
const TREE_HANDLER = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/tree"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("/cost-centers/tree handler not found");
  return m[0];
})();

describe("GET /cost-centers/tree — enriched with jeCount + lastActivityAt", () => {
  it("LATERAL subquery rolls up THREE signals — spend + jeCount + lastActivityAt", () => {
    expect(TREE_HANDLER).toMatch(/LEFT JOIN LATERAL \(/);
    expect(TREE_HANDLER).toContain(`AS "descendantSpend"`);
    expect(TREE_HANDLER).toContain(`AS "jeCount"`);
    expect(TREE_HANDLER).toContain(`AS "lastActivityAt"`);
  });

  it("jeCount uses COUNT(DISTINCT je.id) — avoids double-counting multi-line JEs", () => {
    expect(TREE_HANDLER).toMatch(/COUNT\(DISTINCT je\.id\)::int\s+AS "jeCount"/);
  });

  it("lastActivityAt sourced from je.date (not createdAt) — matches ledger semantics", () => {
    expect(TREE_HANDLER).toMatch(/MAX\(je\.date\)\s+AS "lastActivityAt"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. /dimensional-routing/health endpoint
// ─────────────────────────────────────────────────────────────────────────────
const HEALTH = (() => {
  const m = FCC.match(/router\.get\("\/dimensional-routing\/health"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport \{)/);
  if (!m) throw new Error("/dimensional-routing/health handler not found");
  return m[0];
})();

describe("GET /finance/dimensional-routing/health — operator's coverage dashboard", () => {
  it("registers under feature: finance.cost_centers, action: list", () => {
    expect(HEALTH).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"list"\s*\}\)/);
  });

  it("declares the 9 entity types — branch / department / project / contract / vehicle / driver / umrah_agent / umrah_sub_agent / umrah_season", () => {
    for (const t of [
      `entityType: "branch"`, `entityType: "department"`, `entityType: "project"`,
      `entityType: "contract"`, `entityType: "vehicle"`, `entityType: "driver"`,
      `entityType: "umrah_agent"`, `entityType: "umrah_sub_agent"`, `entityType: "umrah_season"`,
    ]) {
      expect(HEALTH).toContain(t);
    }
  });

  it("routes the umrah backfill calls to /umrah/backfill-dimensional-accounts (correct module owner)", () => {
    // The CC backfill endpoint doesn't handle umrah entities — they
    // have their own backfill at the umrah route. The spec table must
    // route them correctly so the UI's one-click button hits the
    // right endpoint.
    const umrahBackfills = HEALTH.match(/subsidiaryBackfill: "\/umrah\/backfill-dimensional-accounts"/g);
    expect(umrahBackfills?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("non-umrah CC entities point at /finance/cost-centers/backfill", () => {
    const ccBackfills = HEALTH.match(/ccBackfill: "\/finance\/cost-centers\/backfill"/g);
    // branches + departments + projects + contracts + vehicles = 5 entries
    expect(ccBackfills?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("subsidiary count uses COUNT(DISTINCT entityId) — handles multi-account entities (e.g. revenue + cost on same agent)", () => {
    expect(HEALTH).toMatch(/COUNT\(DISTINCT "entityId"\)::int AS linked/);
  });

  it("CC count uses COUNT(DISTINCT relatedEntityId) — same correctness reason", () => {
    expect(HEALTH).toMatch(/COUNT\(DISTINCT "relatedEntityId"\)::int AS withcc/);
  });

  it("tenant rollup at the top — entities + missingAccounts + missingCcs", () => {
    expect(HEALTH).toMatch(/const totals = rows\.reduce\([\s\S]{1,400}entities: acc\.entities \+ r\.total[\s\S]{1,400}missingAccounts: acc\.missingAccounts \+ r\.missingAccounts[\s\S]{1,400}missingCcs: acc\.missingCcs \+ r\.missingCcs/);
  });

  it("filters active subsidiary mappings (isActive=true + deletedAt IS NULL)", () => {
    expect(HEALTH).toMatch(/AND "isActive" = true\s+AND "deletedAt" IS NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Visual dashboard page + nav wiring
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/dimensional-routing visual dashboard", () => {
  it("registered in financeRoutes.tsx", () => {
    expect(ROUTES_TSX).toMatch(/DimensionalRouting = lazy\(\(\) => import\("@\/pages\/finance\/dimensional-routing"\)\)/);
    expect(ROUTES_TSX).toMatch(/path: "\/finance\/dimensional-routing", component: DimensionalRouting/);
  });

  it("added to FinanceTabsNav with Network icon — operator can find it from the finance hub", () => {
    expect(TABS).toContain(`path: "/finance/dimensional-routing"`);
    expect(TABS).toContain(`label: "التوجيه البُعدي"`);
    expect(TABS).toContain("Network");
  });

  it("queries /finance/dimensional-routing/health", () => {
    expect(HUB_PAGE).toContain(`"/finance/dimensional-routing/health"`);
  });

  it("3 rollup KPI tiles — total / missing-accounts / missing-ccs", () => {
    for (const id of [
      "dim-routing-total-entities",
      "dim-routing-missing-accounts",
      "dim-routing-missing-ccs",
    ]) {
      expect(HUB_PAGE).toContain(`testid="${id}"`);
    }
  });

  it("per-entity row testids template — predictable for screenshot regression", () => {
    expect(HUB_PAGE).toContain('data-testid={`dim-routing-row-${row.entityType}`}');
  });

  it("backfill buttons hit the path returned by the backend (no hardcoded URLs)", () => {
    expect(HUB_PAGE).toMatch(/path=\{row\.subsidiaryBackfillPath!\}/);
    expect(HUB_PAGE).toMatch(/path=\{row\.ccBackfillPath!\}/);
  });

  it("KPI tone flips warning → success when missing count reaches 0", () => {
    expect(HUB_PAGE).toMatch(/tone=\{totals\.missingAccounts > 0 \? "warning" : "success"\}/);
    expect(HUB_PAGE).toMatch(/tone=\{totals\.missingCcs > 0 \? "warning" : "success"\}/);
  });

  it("CheckCircle on full coverage AND AlertTriangle when entity type has no routing at all", () => {
    expect(HUB_PAGE).toContain("CheckCircle2");
    expect(HUB_PAGE).toContain("AlertTriangle");
    expect(HUB_PAGE).toContain("بلا تأصيل");
  });

  it("per-entity-type permission split — umrah:update for umrah_*, finance.* for others", () => {
    expect(HUB_PAGE).toMatch(/row\.entityType\.startsWith\("umrah_"\) \? "umrah:update" : "finance\.accounting_engine:create"/);
  });

  it("links to /finance/subsidiary-accounts + /finance/cost-centers/tree from the actions bar", () => {
    expect(HUB_PAGE).toContain(`"/finance/subsidiary-accounts"`);
    expect(HUB_PAGE).toContain(`"/finance/cost-centers/tree"`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Tree page enrichment surfaces jeCount + lastActivity
// ─────────────────────────────────────────────────────────────────────────────
describe("Cost-centres tree page — surfaces the activity signals", () => {
  it("jeCount + lastActivityAt typed on TreeNode (consumes the CTE additions)", () => {
    expect(TREE_PAGE).toMatch(/jeCount\?: number/);
    expect(TREE_PAGE).toMatch(/lastActivityAt\?: string \| null/);
  });

  it("renders 'X قيد' badge when jeCount > 0", () => {
    expect(TREE_PAGE).toMatch(/jeCount > 0[\s\S]{1,300}قيد/);
    expect(TREE_PAGE).toContain('data-testid={`cost-centers-tree-jecount-${node.id}`}');
  });

  it("flags manually-created dead CCs (jeCount === 0 && !auto-created) with خامل badge", () => {
    expect(TREE_PAGE).toMatch(/isDead && !isAuto/);
    expect(TREE_PAGE).toContain("خامل");
    expect(TREE_PAGE).toContain('data-testid={`cost-centers-tree-dead-${node.id}`}');
  });

  it("renders 'آخر نشاط' line when lastActivity present (locale-aware date)", () => {
    expect(TREE_PAGE).toContain("آخر نشاط:");
    expect(TREE_PAGE).toMatch(/new Date\(lastActivity\)\.toLocaleDateString\("ar-SA"\)/);
  });
});
