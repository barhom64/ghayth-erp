import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Dormant entities report — CCs + subsidiary accounts with zero JE
 * traffic in the lookback window (default 90 days). Operationally the
 * "what's dead-weight in the dimensional graph?" view; the operator
 * can soft-delete inactive rows with one click.
 */

const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dormant-entities.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/financeRoutes.tsx"),
  "utf8",
);
const HUB = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/dimensional-routing.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Endpoint
// ─────────────────────────────────────────────────────────────────────────────
const DORMANT = (() => {
  const m = FCC.match(/router\.get\("\/dormant-entities"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport)/);
  if (!m) throw new Error("/dormant-entities handler not found");
  return m[0];
})();

describe("GET /finance/dormant-entities — read-only report", () => {
  it("registers under feature: finance.cost_centers, action: list", () => {
    expect(DORMANT).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"list"\s*\}\)/);
  });

  it("clamps lookback to [7, 730] days — operator can't pass 0 or 10000", () => {
    expect(DORMANT).toMatch(/Math\.max\(7, Math\.min\(730,/);
  });

  it("default lookback is 90 days (sensible quarterly cadence)", () => {
    expect(DORMANT).toMatch(/days \?\? 90/);
  });

  it("CCs query — LEFT JOIN LATERAL counts JEs in the lookback only", () => {
    expect(DORMANT).toMatch(/LEFT JOIN LATERAL \([\s\S]{0,800}jl\."costCenterId" = cc\.id[\s\S]{0,300}je\.date >= \(CURRENT_DATE - \$2::int\)/);
  });

  it("CCs query — REQUIRES age ≥ lookback (no false positive on day-old CCs)", () => {
    // A CC created 2 days ago with no JEs is NOT dormant — it's new.
    expect(DORMANT).toMatch(/cc\."createdAt" < \(CURRENT_DATE - \$2::int\)/);
  });

  it("CCs query — keeps only rows with jeCount = 0 in the window", () => {
    expect(DORMANT).toMatch(/COALESCE\(act\."jeCount", 0\) = 0/);
  });

  it("subsidiary accounts — same shape, joined through accountCode", () => {
    expect(DORMANT).toMatch(/jl\."accountCode" = coa\.code/);
    expect(DORMANT).toMatch(/AND sa\."isActive" = true/);
  });

  it("subsidiary accounts — currentBalance = 0 guard (something MIGHT have moved it pre-window)", () => {
    // A subsidiary with a non-zero balance is suspicious — even if no
    // JE in the window, the rolled-up balance proves activity ever
    // happened. Excluding these is safer than aggressively flagging.
    expect(DORMANT).toMatch(/COALESCE\(coa\."currentBalance", 0\) = 0/);
  });

  it("both queries cap at LIMIT 500 (operator UX — paginated cleanup is a follow-up)", () => {
    const limits = DORMANT.match(/LIMIT 500/g);
    expect(limits?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("response shape — lookbackDays + costCenters + subsidiaryAccounts + totals", () => {
    expect(DORMANT).toMatch(/res\.json\(\{[\s\S]{0,400}lookbackDays: days,[\s\S]{0,400}costCenters: dormantCcs,[\s\S]{0,400}subsidiaryAccounts: dormantSubs,[\s\S]{0,400}totals:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. UI page
// ─────────────────────────────────────────────────────────────────────────────
describe("/finance/dormant-entities page", () => {
  it("registered in financeRoutes.tsx", () => {
    expect(ROUTES).toMatch(/DormantEntities = lazy\(\(\) => import\("@\/pages\/finance\/dormant-entities"\)\)/);
    expect(ROUTES).toMatch(/path: "\/finance\/dormant-entities", component: DormantEntities/);
  });

  it("dimensional-routing hub has a link to dormant-entities", () => {
    expect(HUB).toContain(`/finance/dormant-entities`);
    expect(HUB).toContain('data-testid="dim-routing-dormant-link"');
  });

  it("queries the endpoint with the chosen day range", () => {
    expect(PAGE).toMatch(/`\/finance\/dormant-entities\?days=\$\{days\}`/);
  });

  it("days input is clamped [7, 730] on the client too (defence in depth + better UX)", () => {
    expect(PAGE).toMatch(/Math\.max\(7, Math\.min\(730, v\)\)/);
  });

  it("renders TWO sections — CCs + subsidiary accounts — with KPI tiles", () => {
    expect(PAGE).toContain('data-testid="dormant-cc-tile"');
    expect(PAGE).toContain('data-testid="dormant-sub-tile"');
  });

  it("each row has a delete button gated by the appropriate permission", () => {
    expect(PAGE).toMatch(/perm="finance\.cost_centers:delete"/);
    expect(PAGE).toMatch(/perm="finance\.accounting_engine:delete"/);
  });

  it("CC row links to the per-CC P&L page (drill before deleting)", () => {
    expect(PAGE).toMatch(/href=\{`\/finance\/cost-centers\/\$\{cc\.id\}\/pnl`\}/);
  });

  it("'تلقائي' badge surfaces on auto-created dormants (audit transparency)", () => {
    expect(PAGE).toContain("تلقائي");
    expect(PAGE).toContain("autoCreatedReason");
  });

  it("ageDays calculated from createdAt — surfaces 'منذ N يوماً'", () => {
    expect(PAGE).toMatch(/const ageDays = Math\.floor\(/);
    expect(PAGE).toContain("منذ");
  });

  it("DELETE mutations target the right endpoints", () => {
    expect(PAGE).toMatch(/`\/finance\/cost-centers\/\$\{cc\.id\}`/);
    expect(PAGE).toMatch(/`\/finance\/subsidiary-accounts\/\$\{sa\.id\}`/);
  });
});
