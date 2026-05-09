import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const ACCOUNTS = read("finance-accounts.ts");
const RECURRING = read("finance-recurring.ts");
const COST_CENTERS = read("finance-cost-centers.ts");
const COLLECTION = read("finance-collection.ts");

// ── Finance Accounts ───────────────────────────────────────────────────────

describe("finance-accounts — chart of accounts", () => {
  it("GET /chart-of-accounts requires finance:read", () => {
    const idx = ACCOUNTS.indexOf('"/chart-of-accounts"');
    const section = ACCOUNTS.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("GET /accounts requires finance:read", () => {
    const idx = ACCOUNTS.indexOf('"/accounts"');
    const section = ACCOUNTS.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("POST /accounts requires finance:create", () => {
    const idx = ACCOUNTS.indexOf('.post("/accounts"');
    const section = ACCOUNTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:create")');
  });

  it("PATCH /accounts/:id requires finance:update", () => {
    const idx = ACCOUNTS.indexOf('.patch("/accounts/:id"');
    const section = ACCOUNTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:update")');
  });

  it("DELETE /accounts/:id requires finance:delete", () => {
    const idx = ACCOUNTS.indexOf('.delete("/accounts/:id"');
    const section = ACCOUNTS.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:delete")');
  });
});

describe("finance-accounts — journal & ledger", () => {
  it("journal list and create exist", () => {
    expect(ACCOUNTS).toContain('.get("/journal"');
    expect(ACCOUNTS).toContain('.post("/journal"');
  });

  it("ledger by account code exists", () => {
    expect(ACCOUNTS).toContain('"/ledger/:accountCode"');
  });

  it("summary endpoint exists", () => {
    expect(ACCOUNTS).toContain('"/summary"');
  });
});

describe("finance-accounts — security", () => {
  it("uses parameterized queries", () => {
    const params = [...ACCOUNTS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(15);
  });
});

// ── Finance Recurring ──────────────────────────────────────────────────────

describe("finance-recurring — CRUD", () => {
  it("GET /recurring-journals requires finance:read", () => {
    const idx = RECURRING.indexOf('"/recurring-journals"');
    const section = RECURRING.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("POST requires finance:create", () => {
    const idx = RECURRING.indexOf('.post("/recurring-journals"');
    const section = RECURRING.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:create")');
  });

  it("PATCH requires finance:update", () => {
    const idx = RECURRING.indexOf('.patch("/recurring-journals/:id"');
    const section = RECURRING.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:update")');
  });

  it("DELETE requires finance:delete", () => {
    const idx = RECURRING.indexOf('.delete("/recurring-journals/:id"');
    const section = RECURRING.slice(idx, idx + 200);
    expect(section).toContain('requirePermission("finance:delete")');
  });

  it("run-now endpoint exists", () => {
    expect(RECURRING).toContain('"/recurring-journals/:id/run-now"');
  });

  it("detail endpoint exists", () => {
    expect(RECURRING).toContain('.get("/recurring-journals/:id"');
  });
});

describe("finance-recurring — security", () => {
  it("uses parameterized queries", () => {
    const params = [...RECURRING.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(15);
  });

  it("scopes by companyId", () => {
    const matches = [...RECURRING.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(10);
  });
});

// ── Finance Cost Centers ───────────────────────────────────────────────────

describe("finance-cost-centers — CRUD", () => {
  it("full CRUD with proper permissions", () => {
    expect(COST_CENTERS).toContain('requirePermission("finance:read")');
    expect(COST_CENTERS).toContain('requirePermission("finance:create")');
    expect(COST_CENTERS).toContain('requirePermission("finance:update")');
    expect(COST_CENTERS).toContain('requirePermission("finance:delete")');
  });

  it("list, detail, create, update, delete endpoints exist", () => {
    expect(COST_CENTERS).toContain('.get("/cost-centers"');
    expect(COST_CENTERS).toContain('"/cost-centers/:id"');
    expect(COST_CENTERS).toContain('.post("/cost-centers"');
    expect(COST_CENTERS).toContain('.patch("/cost-centers/:id"');
    expect(COST_CENTERS).toContain('.delete("/cost-centers/:id"');
  });
});

// ── Finance Collection ─────────────────────────────────────────────────────

describe("finance-collection — debt collection", () => {
  it("GET /collection requires finance:read", () => {
    const idx = COLLECTION.indexOf('"/collection"');
    const section = COLLECTION.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:read")');
  });

  it("collection action endpoint requires finance:create", () => {
    const idx = COLLECTION.indexOf('"/collection/:invoiceId/action"');
    const section = COLLECTION.slice(Math.max(0, idx - 80), idx + 200);
    expect(section).toContain('requirePermission("finance:create")');
  });

  it("collection history endpoint exists", () => {
    expect(COLLECTION).toContain('"/collection/:invoiceId/history"');
  });

  it("uses parameterized queries", () => {
    const params = [...COLLECTION.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });
});
