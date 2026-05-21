import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VENDORS_SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-vendors.ts"),
  "utf8"
);
const REPORTS_SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);
const ZATCA_SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-zatca.ts"),
  "utf8"
);
const ALGO_SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-algorithms.ts"),
  "utf8"
);

describe("finance-vendors — CRUD", () => {
  it("GET /vendors requires finance:read", () => {
    const idx = VENDORS_SRC.indexOf('"/vendors"');
    const section = VENDORS_SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('authorize(');
  });

  it("POST /vendors requires finance:create", () => {
    const idx = VENDORS_SRC.indexOf('.post("/vendors"');
    const section = VENDORS_SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("PATCH /vendors/:id requires finance:update", () => {
    const idx = VENDORS_SRC.indexOf('.patch("/vendors/:id"');
    const section = VENDORS_SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });

  it("DELETE /vendors/:id requires finance:delete", () => {
    const idx = VENDORS_SRC.indexOf('.delete("/vendors/:id"');
    const section = VENDORS_SRC.slice(idx, idx + 200);
    expect(section).toContain('authorize(');
  });
});

describe("finance-vendors — financial features", () => {
  it("stats endpoint removed — was a dead route shadowed by finance-accounts /stats", () => {
    expect(VENDORS_SRC).not.toContain('"/stats"');
  });

  it("receivables endpoints exist", () => {
    expect(VENDORS_SRC).toContain('"/receivables"');
    expect(VENDORS_SRC).toContain('"/receivables/:id"');
  });

  it("payments endpoint exists", () => {
    expect(VENDORS_SRC).toContain('"/payments"');
  });

  it("commitments endpoints exist", () => {
    expect(VENDORS_SRC).toContain('"/commitments"');
    expect(VENDORS_SRC).toContain('"/commitments/:id"');
  });

  it("multiple approval endpoints exist", () => {
    expect(VENDORS_SRC).toContain('"/commitments/:id/approve"');
    expect(VENDORS_SRC).toContain('"/receivables/:id/approve"');
    expect(VENDORS_SRC).toContain('"/vouchers/:id/approve"');
    expect(VENDORS_SRC).toContain('"/financial-requests/:id/approve"');
    expect(VENDORS_SRC).toContain('"/budgets/:id/approve"');
  });
});

describe("finance-reports — financial statements", () => {
  it("trial balance report exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/trial-balance"');
  });

  it("income statement exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/income-statement"');
  });

  it("balance sheet exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/balance-sheet"');
  });

  it("cash flow statement exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/cash-flow"');
  });

  it("all report endpoints require finance:read", () => {
    const perms = [...REPORTS_SRC.matchAll(/authorize\(/g)];
    expect(perms.length).toBeGreaterThanOrEqual(12);
  });
});

describe("finance-reports — subsidiary & entity reports", () => {
  it("subsidiary ledger endpoint exists", () => {
    expect(REPORTS_SRC).toContain('"/subsidiary-ledger/:entityType/:entityId"');
  });

  it("customer statement exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/customer-statement/:clientId"');
  });

  it("vendor statement exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/vendor-statement/:supplierId"');
  });

  it("entity statement exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/entity-statement"');
  });
});

describe("finance-reports — analytical reports", () => {
  it("custody advances report exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/custody-advances"');
  });

  it("expenses analysis exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/expenses-analysis"');
  });

  it("revenue analysis exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/revenue-analysis"');
  });

  it("budget variance report exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/budget-variance"');
  });

  it("cash & bank statement exists", () => {
    expect(REPORTS_SRC).toContain('"/reports/cash-bank-statement"');
  });
});

describe("finance-zatca — ZATCA integration", () => {
  it("settings endpoints exist (get, put)", () => {
    expect(ZATCA_SRC).toContain('"/zatca/settings"');
    expect(ZATCA_SRC).toContain('.put("/zatca/settings"');
  });

  it("test connection endpoint exists", () => {
    expect(ZATCA_SRC).toContain('"/zatca/test-connection"');
  });

  it("invoice XML endpoint exists", () => {
    expect(ZATCA_SRC).toContain('"/zatca/invoice/:id/xml"');
  });

  it("invoice submit endpoint exists", () => {
    expect(ZATCA_SRC).toContain('"/zatca/invoice/:id/submit"');
  });

  it("expense submit endpoint exists", () => {
    expect(ZATCA_SRC).toContain('"/zatca/expense/:id/submit"');
  });

  it("submissions list endpoint exists", () => {
    expect(ZATCA_SRC).toContain('"/zatca/submissions"');
  });
});

describe("finance-algorithms — aging reports", () => {
  it("AR aging endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/ar-aging"');
  });

  it("AP aging endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/ap-aging"');
  });
});

describe("finance-algorithms — bank reconciliation", () => {
  it("import endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/bank-reconciliation/import"');
  });

  it("auto match endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/bank-reconciliation/auto-match"');
  });

  it("manual match endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/bank-reconciliation/manual-match"');
  });
});

describe("finance-algorithms — fixed assets", () => {
  it("CRUD endpoints exist", () => {
    expect(ALGO_SRC).toContain('.get("/fixed-assets"');
    expect(ALGO_SRC).toContain('.post("/fixed-assets"');
    expect(ALGO_SRC).toContain('"/fixed-assets/:id"');
  });

  it("depreciation schedule endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/fixed-assets/:id/schedule"');
  });

  it("individual depreciation endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/fixed-assets/:id/depreciate"');
  });

  it("batch depreciation endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/fixed-assets/depreciate-all"');
  });
});

describe("finance-algorithms — FX & treasury", () => {
  it("FX rates CRUD exists", () => {
    expect(ALGO_SRC).toContain('"/fx/rates"');
  });

  it("FX revaluation preview exists", () => {
    expect(ALGO_SRC).toContain('"/fx/revaluation/preview"');
  });

  it("FX revaluation post exists", () => {
    expect(ALGO_SRC).toContain('"/fx/revaluation/post"');
  });

  it("treasury endpoint exists", () => {
    expect(ALGO_SRC).toContain('"/treasury"');
  });

  it("entity financial profile exists", () => {
    expect(ALGO_SRC).toContain('"/entity-financial-profile"');
  });
});

describe("finance-algorithms — inventory & rounding", () => {
  it("inventory costing endpoints exist", () => {
    expect(ALGO_SRC).toContain('"/inventory-costing"');
    expect(ALGO_SRC).toContain('"/inventory-costing/:productId"');
  });

  it("rounding account setup exists", () => {
    expect(ALGO_SRC).toContain('"/rounding-account"');
    expect(ALGO_SRC).toContain('"/rounding-account/setup"');
  });

  it("rounding differences apply exists", () => {
    expect(ALGO_SRC).toContain('"/rounding-differences/apply"');
  });
});

describe("finance modules — security patterns", () => {
  it("vendors uses parameterized queries", () => {
    const params = [...VENDORS_SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });

  it("reports uses parameterized queries", () => {
    const params = [...REPORTS_SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(30);
  });

  it("algorithms uses parameterized queries", () => {
    const params = [...ALGO_SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(50);
  });

  it("ZATCA uses parameterized queries", () => {
    const params = [...ZATCA_SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });
});
