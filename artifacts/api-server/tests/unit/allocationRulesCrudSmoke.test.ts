import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-accounts.ts"),
  "utf8"
);

// ─── Phase 6 — Allocation Rules CRUD endpoints ──────────────────────────────
// REST surface for managing accounting_allocation_rules (migration 203).
// A row written here drives the resolver (Phase 5.2/5.3/5.4/5.5) on the
// next invoice / GRN posting.

describe("CRUD endpoints registered", () => {
  it("GET /allocation-rules (list)", () => {
    expect(ROUTE).toMatch(/accountsRouter\.get\(\s*"\/allocation-rules"/);
  });
  it("GET /allocation-rules/:id (read)", () => {
    expect(ROUTE).toMatch(/accountsRouter\.get\(\s*"\/allocation-rules\/:id"/);
  });
  it("POST /allocation-rules (create)", () => {
    expect(ROUTE).toMatch(/accountsRouter\.post\(\s*"\/allocation-rules"/);
  });
  it("PATCH /allocation-rules/:id (update)", () => {
    expect(ROUTE).toMatch(/accountsRouter\.patch\(\s*"\/allocation-rules\/:id"/);
  });
  it("DELETE /allocation-rules/:id (soft delete)", () => {
    expect(ROUTE).toMatch(/accountsRouter\.delete\(\s*"\/allocation-rules\/:id"/);
  });
  it("GET /allocation-results (drill-down)", () => {
    expect(ROUTE).toMatch(/accountsRouter\.get\(\s*"\/allocation-results"/);
  });
});

describe("authorization", () => {
  it("list / view use action:'list' or 'view'", () => {
    expect(ROUTE).toMatch(/"\/allocation-rules"[\s\S]{0,200}action:\s*"list"/);
  });
  it("create requires action:'create'", () => {
    expect(ROUTE).toMatch(/accountsRouter\.post\(\s*"\/allocation-rules"[\s\S]{0,200}action:\s*"create"/);
  });
  it("update requires action:'update'", () => {
    expect(ROUTE).toMatch(/accountsRouter\.patch\(\s*"\/allocation-rules\/:id"[\s\S]{0,200}action:\s*"update"/);
  });
  it("delete requires action:'delete'", () => {
    expect(ROUTE).toMatch(/accountsRouter\.delete\(\s*"\/allocation-rules\/:id"[\s\S]{0,200}action:\s*"delete"/);
  });
  it("all endpoints scoped to feature:'finance.accounts'", () => {
    const section = ROUTE.slice(ROUTE.indexOf("ACCOUNTING ALLOCATION RULES"));
    const featureMatches = section.match(/feature:\s*"([^"]+)"/g) || [];
    for (const m of featureMatches) {
      expect(m).toContain("finance.accounts");
    }
  });
});

describe("schema validation", () => {
  it("declares upsertRuleSchema with required name + documentType", () => {
    expect(ROUTE).toContain("const upsertRuleSchema");
    expect(ROUTE).toMatch(/name:\s*z\.string\(\)\.min\(1/);
    expect(ROUTE).toMatch(/documentType:\s*z\.enum\(ALLOCATION_DOCUMENT_TYPES/);
  });

  it("documentType enum covers all major flows", () => {
    for (const t of [
      "invoice", "credit_memo", "debit_memo",
      "purchase_order", "purchase_request", "grn", "supplier_invoice",
      "expense", "payment", "receipt", "journal_entry",
    ]) {
      expect(ROUTE).toContain(`"${t}"`);
    }
  });

  it("costCenterStrategy enum matches resolver", () => {
    for (const s of [
      "from_vehicle", "from_property", "from_unit", "from_project",
      "from_employee", "from_contract", "from_umrah_agent", "from_umrah_season",
      "explicit", "none",
    ]) {
      expect(ROUTE).toContain(`"${s}"`);
    }
  });

  it("PATCH uses .partial() so any subset of fields can update", () => {
    expect(ROUTE).toContain("upsertRuleSchema.partial()");
  });
});

describe("scoping & soft-delete", () => {
  it("list filters by companyId + deletedAt IS NULL", () => {
    const idx = ROUTE.indexOf('"/allocation-rules"');
    const section = ROUTE.slice(idx, idx + 2000);
    expect(section).toContain('"deletedAt" IS NULL');
    expect(section).toContain('"companyId" = $1');
  });

  it("DELETE is soft (sets deletedAt + isActive=false)", () => {
    const idx = ROUTE.indexOf("DELETE /finance/allocation-rules/:id");
    const section = ROUTE.slice(idx, idx + 1000);
    expect(section).toContain('"deletedAt" = NOW()');
    expect(section).toContain('"isActive" = false');
  });
});

describe("audit + events", () => {
  it("create writes audit log", () => {
    expect(ROUTE).toMatch(/createAuditLog\([\s\S]{0,200}entity:\s*"accounting_allocation_rules"/);
  });
  it("create emits finance.allocation_rule.created event", () => {
    expect(ROUTE).toContain('"finance.allocation_rule.created"');
  });
});

describe("allocation results drilldown", () => {
  it("supports ?sourceTable filter", () => {
    expect(ROUTE).toMatch(/sourceTable[\s\S]{0,100}"sourceTable" = \$/);
  });
  it("supports ?status filter", () => {
    expect(ROUTE).toMatch(/status[\s\S]{0,100}"resolutionStatus" = \$/);
  });
  it("supports ?ruleId filter", () => {
    expect(ROUTE).toMatch(/ruleId[\s\S]{0,100}"ruleId" = \$/);
  });
});
