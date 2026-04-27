import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BUDGET_SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-budget.ts"),
  "utf8"
);
const CUSTODY_SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/finance-custodies.ts"),
  "utf8"
);

describe("finance-budget — CRUD", () => {
  it("GET /budget requires finance:read", () => {
    const idx = BUDGET_SRC.indexOf('"/budget"');
    const section = BUDGET_SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("POST /budget requires finance:create", () => {
    const idx = BUDGET_SRC.indexOf('budgetRouter.post("/budget"');
    const section = BUDGET_SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:create")');
  });

  it("PATCH /budget/:id requires finance:update", () => {
    const idx = BUDGET_SRC.indexOf('"/budget/:id"');
    const section = BUDGET_SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:update")');
  });

  it("DELETE /budget/:id requires finance:delete", () => {
    const idx = BUDGET_SRC.indexOf('budgetRouter.delete("/budget/:id"');
    const section = BUDGET_SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:delete")');
  });

  it("GET /budget/:id exists", () => {
    expect(BUDGET_SRC).toContain('budgetRouter.get("/budget/:id"');
  });
});

describe("finance-budget — budget vs actual", () => {
  it("budget-vs-actual endpoint exists", () => {
    expect(BUDGET_SRC).toContain('"/budget-vs-actual"');
  });

  it("budget validate endpoint exists", () => {
    expect(BUDGET_SRC).toContain('"/budget/validate"');
  });

  it("variance report endpoint exists", () => {
    expect(BUDGET_SRC).toContain('"/budget/variance"');
  });
});

describe("finance-budget — approval workflow", () => {
  it("POST /budget/approval-requests exists", () => {
    expect(BUDGET_SRC).toContain('"/budget/approval-requests"');
  });

  it("approval decision endpoint exists", () => {
    expect(BUDGET_SRC).toContain('"/budget/approval-requests/:id/decide"');
  });
});

describe("finance-budget — fiscal periods", () => {
  it("fiscal periods endpoint exists", () => {
    expect(BUDGET_SRC).toContain('"/fiscal-periods"');
  });

  it("close fiscal period endpoint exists", () => {
    expect(BUDGET_SRC).toContain('"/fiscal-periods/:period/close"');
  });
});

describe("finance-budget — security", () => {
  it("uses parameterized queries", () => {
    const params = [...BUDGET_SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });

  it("scopes by companyId", () => {
    const matches = [...BUDGET_SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(15);
  });
});

describe("finance-custodies — CRUD", () => {
  it("GET /custodies requires finance:read", () => {
    const idx = CUSTODY_SRC.indexOf('"/custodies"');
    const section = CUSTODY_SRC.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("POST /custodies requires finance:create", () => {
    const idx = CUSTODY_SRC.indexOf('custodiesRouter.post("/custodies"');
    const section = CUSTODY_SRC.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:create")');
  });

  it("GET /custodies/:id exists", () => {
    expect(CUSTODY_SRC).toContain('"/custodies/:id"');
  });
});

describe("finance-custodies — settlement", () => {
  it("batch settle endpoint exists", () => {
    expect(CUSTODY_SRC).toContain('"/custodies/settle"');
  });

  it("individual settle endpoint exists", () => {
    expect(CUSTODY_SRC).toContain('"/custodies/:id/settle"');
  });

  it("approve endpoint exists", () => {
    expect(CUSTODY_SRC).toContain('"/custodies/:id/approve"');
  });
});

describe("finance-custodies — reporting", () => {
  it("custody report endpoint exists", () => {
    expect(CUSTODY_SRC).toContain('"/custodies/report"');
  });

  it("custody summary endpoint exists", () => {
    expect(CUSTODY_SRC).toContain('"/custodies/summary"');
  });
});

describe("finance-custodies — security", () => {
  it("uses parameterized queries", () => {
    const params = [...CUSTODY_SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });

  it("scopes by companyId", () => {
    const matches = [...CUSTODY_SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(15);
  });
});
