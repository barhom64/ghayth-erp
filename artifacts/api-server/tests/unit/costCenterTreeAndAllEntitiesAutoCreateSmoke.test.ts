import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Round-out pass on the «financial dimensions baked into entity create»
 * philosophy:
 *   1. Driver / vehicle subsidiary accounts (custody) — previously the
 *      auto-create helper accepted these entityTypes but did nothing.
 *   2. Vehicle + legal_contract cost-centre auto-creation, nested under
 *      branch when one is in scope (BR-####-V####, BR-####-CT####).
 *   3. POST /finance/cost-centers/backfill extended to cover vehicles +
 *      contracts (4 entityTypes total).
 *   4. New GET /finance/cost-centers/tree — recursive CTE shaped result
 *      with depth + path + roll-up descendantSpend per node.
 *   5. New PATCH /finance/cost-centers/:id/parent — drag-to-reparent
 *      with self + cycle guards + cross-tenant guard.
 *   6. New /finance/cost-centers/tree visual page consuming both.
 */

const ACCT_ENG = readFileSync(
  join(import.meta.dirname!, "../../src/routes/accounting-engine.ts"),
  "utf8",
);
const CC_HELPER = readFileSync(
  join(import.meta.dirname!, "../../src/lib/costCenterAutoCreate.ts"),
  "utf8",
);
const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const FLEET = readFileSync(
  join(import.meta.dirname!, "../../src/routes/fleet.ts"),
  "utf8",
);
const LEGAL = readFileSync(
  join(import.meta.dirname!, "../../src/routes/legal.ts"),
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. createSubsidiaryAccountsForEntity — driver + vehicle custody
// ─────────────────────────────────────────────────────────────────────────────
describe("createSubsidiaryAccountsForEntity — driver + vehicle no-longer-no-ops", () => {
  // #1945 FIN-003 — parents now resolve by INTENT (the literal parentCode is a
  // last-resort fallback), and the literals were corrected to the real control
  // accounts (client→1130 AR, vendor→2110 AP, employee advance→1140, custody→
  // 1142, driver custody→1113) — the old hardcodes (1111/1121/1131/2102)
  // matched neither chart. These smoke assertions track the corrected source.
  it("driver path pushes a custody account under 1113 (cash custody) with 'عهدة سائق' label", () => {
    expect(ACCT_ENG).toMatch(/entityType === "driver"[\s\S]{1,400}accountType:\s*"custody",\s*parentCode:\s*"1113",\s*suffix:\s*"عهدة سائق"/);
  });

  it("vehicle path pushes custody (1113) + fuel(5510)/maintenance(5520)/depreciation(5710) per-vehicle accounts (#1594)", () => {
    expect(ACCT_ENG).toMatch(/entityType === "vehicle"[\s\S]{1,1500}accountType:\s*"custody",\s*parentCode:\s*"1113",\s*suffix:\s*"عهدة مركبة"/);
    expect(ACCT_ENG).toMatch(/entityType === "vehicle"[\s\S]{1,1500}accountType:\s*"fuel",\s*parentCode:\s*"5510"/);
    expect(ACCT_ENG).toMatch(/entityType === "vehicle"[\s\S]{1,1500}accountType:\s*"depreciation",\s*parentCode:\s*"5710"/);
  });

  it("employee path keeps advance + custody, now under the correct staff parents (1140 / 1142)", () => {
    expect(ACCT_ENG).toMatch(/entityType === "employee"[\s\S]{1,300}accountType:\s*"advance",\s*parentCode:\s*"1140"[\s\S]{1,260}accountType:\s*"custody",\s*parentCode:\s*"1142",\s*suffix:\s*"عهدة"/);
  });

  it("every spec carries a parentIntent so resolution works on any tenant chart (not just the seed)", () => {
    // client receivable → AR control intent, vendor payable → AP control intent
    expect(ACCT_ENG).toMatch(/accountType:\s*"receivable",\s*parentCode:\s*"1130"[\s\S]{1,160}parentIntent:\s*\{\s*type:\s*"asset"/);
    expect(ACCT_ENG).toMatch(/accountType:\s*"payable",\s*parentCode:\s*"2110"[\s\S]{1,160}parentIntent:\s*\{\s*type:\s*"liability"/);
  });
});

describe("POST /fleet/vehicles — subsidiary + cost-centre auto-create", () => {
  it("imports the CC helper alongside the existing subsidiary helper", () => {
    expect(FLEET).toMatch(/import \{ createCostCenterForEntity \} from "\.\.\/lib\/costCenterAutoCreate\.js"/);
  });

  it("calls createSubsidiaryAccountsForEntity(... 'vehicle' ...) — previously absent on vehicle create", () => {
    // #2091 — the call now also threads an optional { branchId, actorUserId }
    // context so a provisioning failure can be recorded against the actor/branch.
    expect(FLEET).toMatch(/createSubsidiaryAccountsForEntity\(scope\.companyId, "vehicle", insertId, vehicleLabel(, \{[^}]*\})?\)/);
  });

  it("vehicle label aggregates make + model + plateNumber for human-readable account names", () => {
    expect(FLEET).toMatch(/const vehicleLabel = `\$\{b\.make\} \$\{b\.model\} — \$\{b\.plateNumber\}`/);
  });

  it("CC auto-create nests under branch when branchId is provided OR inherited from scope", () => {
    expect(FLEET).toMatch(/parentEntityType: \(b\.branchId \|\| scope\.branchId\) \? "branch" : null/);
    expect(FLEET).toMatch(/parentEntityId: b\.branchId \?\? scope\.branchId \?\? null/);
  });

  it("BOTH auto-creates are fire-and-forget (vehicle create succeeds even if either fails)", () => {
    expect(FLEET).toMatch(/createSubsidiaryAccountsForEntity\([\s\S]{1,200}\.catch\(\(e\) => logger\.error\(e, "vehicle subsidiary auto-create failed"\)\)/);
    expect(FLEET).toMatch(/createCostCenterForEntity\([\s\S]{1,400}\.catch\(\(e\) => logger\.error\(e, "vehicle cost-centre auto-create failed"\)\)/);
  });
});

describe("POST /legal/contracts — cost-centre auto-create nested under branch", () => {
  it("imports the CC helper", () => {
    expect(LEGAL).toMatch(/import \{ createCostCenterForEntity \} from "\.\.\/lib\/costCenterAutoCreate\.js"/);
  });

  it("nests the contract CC under scope.branchId when available (BR-####-CT####)", () => {
    expect(LEGAL).toMatch(/createCostCenterForEntity\(\s*scope\.companyId,\s*"contract",\s*insertId,\s*b\.title\.trim\(\),\s*\{\s*parentEntityType: scope\.branchId \? "branch" : null,\s*parentEntityId: scope\.branchId \?\? null,/);
  });

  it("fire-and-forget — contract POST never fails on CC hiccup", () => {
    expect(LEGAL).toMatch(/createCostCenterForEntity\([\s\S]{1,400}\.catch\(\(e\) => logger\.error\(e, "legal contract cost-centre auto-create failed"\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. costCenterAutoCreate — extended entity types
// ─────────────────────────────────────────────────────────────────────────────
describe("costCenterAutoCreate helper — vehicle + contract dimensions", () => {
  it("CostCenterEntityType now lists 5 entity types — branch / project / contract / vehicle / department", () => {
    expect(CC_HELPER).toMatch(/export type CostCenterEntityType =\s*\|\s*"branch"\s*\|\s*"project"\s*\|\s*"contract"\s*\|\s*"vehicle"\s*\|\s*"department"/);
  });

  it("PREFIX_BY_TYPE adds V for vehicles (BR / P / CT / V / D)", () => {
    expect(CC_HELPER).toMatch(/vehicle:\s+"V"/);
  });

  it("REASON_BY_TYPE adds the vehicle reason — audit logs stay informative", () => {
    expect(CC_HELPER).toMatch(/vehicle:\s+"auto-created on vehicle insert"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Backfill — vehicles + contracts covered
// ─────────────────────────────────────────────────────────────────────────────
const BACKFILL = (() => {
  const m = FCC.match(/router\.post\("\/cost-centers\/backfill"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport \{)/);
  if (!m) throw new Error("/cost-centers/backfill handler not found");
  return m[0];
})();

describe("POST /finance/cost-centers/backfill — vehicles + contracts added", () => {
  it("schema accepts the new entityTypes (at minimum branch / project / contract / vehicle)", () => {
    // Pin SHAPE — the enum widens as we add types (e.g. department in
    // the next PR). Use field-presence checks rather than literal match.
    expect(FCC).toMatch(/backfillCostCentersSchema = z\.object\(\{[\s\S]{0,200}entityType: z\.enum\(\[[^\]]*\]\)\.optional/);
    for (const t of ['"branch"', '"project"', '"contract"', '"vehicle"']) {
      expect(FCC).toContain(t);
    }
  });

  it("summary tracks at minimum branches + projects + contracts + vehicles", () => {
    for (const f of ["branches:", "projects:", "contracts:", "vehicles:"]) {
      expect(BACKFILL).toContain(f);
    }
  });

  it("contracts loop reads from legal_contracts + derives branch via earliest JE (no branchId column)", () => {
    expect(BACKFILL).toContain("FROM legal_contracts c");
    expect(BACKFILL).toContain("'legal_contracts'");
  });

  it("vehicles loop uses fleet_vehicles.branchId DIRECTLY (column exists)", () => {
    expect(BACKFILL).toContain("FROM fleet_vehicles");
    expect(BACKFILL).toMatch(/"branchId"/);
    expect(BACKFILL).toMatch(/parentEntityId: v\.branchId/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /finance/cost-centers/tree — recursive CTE + descendantSpend
// ─────────────────────────────────────────────────────────────────────────────
const TREE_HANDLER = (() => {
  const m = FCC.match(/router\.get\("\/cost-centers\/tree"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("/cost-centers/tree handler not found");
  return m[0];
})();

describe("GET /finance/cost-centers/tree — hierarchical projection", () => {
  it("registers under feature: finance.cost_centers, action: list", () => {
    expect(TREE_HANDLER).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"list"\s*\}\)/);
  });

  it("uses WITH RECURSIVE to walk parent/child chain", () => {
    expect(TREE_HANDLER).toMatch(/WITH RECURSIVE tree AS/);
  });

  it("base case selects roots (parentId IS NULL) at depth 0", () => {
    expect(TREE_HANDLER).toMatch(/cc\."parentId" IS NULL/);
    expect(TREE_HANDLER).toMatch(/0 AS depth/);
  });

  it("CYCLE BREAK — recursive case skips ids already in path", () => {
    // Critical defence — data corruption (a CC pointing at one of its
    // own descendants via parentId) would otherwise hang Postgres.
    expect(TREE_HANDLER).toMatch(/cc\.id <> ALL\(t\.path\)/);
  });

  it("path is an array that grows id → child id at each level", () => {
    expect(TREE_HANDLER).toMatch(/ARRAY\[cc\.id\] AS path/);
    expect(TREE_HANDLER).toMatch(/t\.path \|\| cc\.id/);
  });

  it("ORDER BY t.path — siblings stay grouped under their parent in the result", () => {
    expect(TREE_HANDLER).toMatch(/ORDER BY t\.path/);
  });

  it("rolls up descendantSpend per node from journal_lines.costCenterId", () => {
    expect(TREE_HANDLER).toMatch(/SUM\(jl\.debit - jl\.credit\)/);
    expect(TREE_HANDLER).toMatch(/jl\."costCenterId" = t\.id/);
  });

  it("tenant-safe — journal_entries.companyId guarded inside the spend subquery", () => {
    expect(TREE_HANDLER).toMatch(/je\."companyId" = \$1\s+AND je\."deletedAt" IS NULL/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PATCH /finance/cost-centers/:id/parent — drag-to-reparent + cycle guard
// ─────────────────────────────────────────────────────────────────────────────
const REPARENT = (() => {
  const m = FCC.match(/router\.patch\("\/cost-centers\/:id\/parent"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/cost-centers/:id/parent handler not found");
  return m[0];
})();

describe("PATCH /finance/cost-centers/:id/parent — drag-to-reparent guard", () => {
  it("requires update permission", () => {
    expect(REPARENT).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"update"\s*\}\)/);
  });

  it("rejects parenting a node to itself", () => {
    expect(REPARENT).toMatch(/if \(parentId === id\) \{\s*throw new ValidationError\("لا يمكن جعل مركز التكلفة أبًا لنفسه"/);
  });

  it("CROSS-TENANT GUARD — parent must belong to scope.companyId", () => {
    expect(REPARENT).toMatch(/SELECT id FROM cost_centers WHERE id = \$1 AND "companyId" = \$2[\s\S]{1,200}الأب المستهدف غير موجود في نفس الشركة/);
  });

  it("CYCLE GUARD — recursive CTE walks descendants and refuses if target is one", () => {
    expect(REPARENT).toMatch(/WITH RECURSIVE descendants AS[\s\S]{1,500}WHERE id = \$3 LIMIT 1/);
    expect(REPARENT).toMatch(/لا يمكن جعل مركز التكلفة تابعًا لأحد فروعه/);
  });

  it("audit log records before/after parentId for full change history", () => {
    expect(REPARENT).toMatch(/action: "cost_center\.reparented",[\s\S]{1,200}before: \{ parentId: current\.parentId \}, after: \{ parentId \}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. UI tree page
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/cost-centers/tree page", () => {
  it("registered in financeRoutes.tsx", () => {
    expect(ROUTES_TSX).toMatch(/CostCentersTree = lazy\(\(\) => import\("@\/pages\/finance\/cost-centers-tree"\)\)/);
    expect(ROUTES_TSX).toMatch(/path: "\/finance\/cost-centers\/tree", component: CostCentersTree/);
  });

  it("queries the tree endpoint and binds the reparent mutation", () => {
    expect(TREE_PAGE).toMatch(/"\/finance\/cost-centers\/tree"/);
    expect(TREE_PAGE).toMatch(/`\/finance\/cost-centers\/\$\{body\.id\}\/parent`/);
  });

  it("indents rows by depth via paddingInlineStart (RTL-safe)", () => {
    // Math.min cap protects deep trees from running off the card width.
    expect(TREE_PAGE).toMatch(/Math\.min\(node\.depth, 12\) \* 1\.5/);
    expect(TREE_PAGE).toMatch(/paddingInlineStart:/);
  });

  it("collapse/expand state is per-node + auto-overridden by search (matches show in context)", () => {
    expect(TREE_PAGE).toMatch(/const \[collapsed, setCollapsed\] = useState<Set<number>>/);
    expect(TREE_PAGE).toContain("visibleIds");
    expect(TREE_PAGE).toMatch(/visible\.add/);
  });

  it("VALID PARENT dropdown EXCLUDES self + descendants (UX-side cycle prevention)", () => {
    // Mirrors the server's guard so the operator can't even pick an
    // invalid parent. The server enforces anyway (defence in depth).
    expect(TREE_PAGE).toMatch(/validParents=\{rows\.filter\(\(r\) => \{\s*if \(r\.id === node\.id\) return false;\s*return !descendantsByNode\.get\(node\.id\)\?\.has\(r\.id\);/);
  });

  it("backfill button POSTs to /finance/cost-centers/backfill (tenant-wide)", () => {
    expect(TREE_PAGE).toMatch(/"\/finance\/cost-centers\/backfill"/);
  });

  it("'تلقائي' badge surfaces auto-created rows for audit visibility", () => {
    expect(TREE_PAGE).toMatch(/تلقائي/);
    expect(TREE_PAGE).toMatch(/autoCreatedReason/);
  });

  it("stable testids — search + list + per-row + toggle + reparent", () => {
    for (const id of [
      'data-testid="cost-centers-tree-search"',
      'data-testid="cost-centers-tree-list"',
      'data-testid={`cost-centers-tree-row-${node.id}`}',
      'data-testid={`cost-centers-tree-toggle-${node.id}`}',
      'data-testid={`cost-centers-tree-reparent-${node.id}`}',
      'data-testid="cost-centers-tree-backfill"',
    ]) {
      expect(TREE_PAGE).toContain(id);
    }
  });
});
