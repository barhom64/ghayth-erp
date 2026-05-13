import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes");
const SRC = readFileSync(join(ROUTES, "finance-vendor-contracts.ts"), "utf8");
const INDEX = readFileSync(join(ROUTES, "index.ts"), "utf8");

describe("finance-vendor-contracts — CRUD smoke", () => {
  it("exports vendorContractsRouter", () => {
    expect(SRC).toContain("export const vendorContractsRouter = Router()");
  });

  it("router is mounted under /finance in routes/index.ts", () => {
    expect(INDEX).toContain('import { vendorContractsRouter } from "./finance-vendor-contracts.js"');
    // single-line match: any router.use("/finance", ..., vendorContractsRouter)
    expect(INDEX).toMatch(/^router\.use\("\/finance",.*\bvendorContractsRouter\b.*\);?$/m);
  });

  it("declares all 5 CRUD endpoints under /contracts", () => {
    expect(SRC).toMatch(/vendorContractsRouter\.get\(\s*"\/contracts"/);
    expect(SRC).toMatch(/vendorContractsRouter\.get\(\s*"\/contracts\/:id"/);
    expect(SRC).toMatch(/vendorContractsRouter\.post\(\s*"\/contracts"/);
    expect(SRC).toMatch(/vendorContractsRouter\.patch\(\s*"\/contracts\/:id"/);
    expect(SRC).toMatch(/vendorContractsRouter\.delete\(\s*"\/contracts\/:id"/);
  });

  it("every endpoint goes through authorize() with feature: finance.contracts", () => {
    const matches = SRC.match(/feature:\s*"finance\.contracts"/g) ?? [];
    expect(matches.length).toBe(5);
  });

  it("uses the correct action per HTTP verb", () => {
    expect(SRC).toMatch(/feature:\s*"finance\.contracts",\s*action:\s*"list"/);
    expect(SRC).toMatch(/feature:\s*"finance\.contracts",\s*action:\s*"view"/);
    expect(SRC).toMatch(/feature:\s*"finance\.contracts",\s*action:\s*"create"/);
    expect(SRC).toMatch(/feature:\s*"finance\.contracts",\s*action:\s*"update"/);
    expect(SRC).toMatch(/feature:\s*"finance\.contracts",\s*action:\s*"delete"/);
  });

  it("create emits vendor_contract.created event + audit log", () => {
    expect(SRC).toContain('action: "vendor_contract.created"');
    expect(SRC).toMatch(/createAuditLog\(\s*\{[\s\S]*?action:\s*"create",\s*entity:\s*"vendor_contracts"/);
  });

  it("update emits vendor_contract.updated event + audit log", () => {
    expect(SRC).toContain('action: "vendor_contract.updated"');
    expect(SRC).toMatch(/createAuditLog\(\s*\{[\s\S]*?action:\s*"update",\s*entity:\s*"vendor_contracts"/);
  });

  it("delete is soft (UPDATE … SET deletedAt), not DROP", () => {
    expect(SRC).toMatch(/UPDATE vendor_contracts SET "deletedAt" = NOW\(\)/);
    expect(SRC).not.toMatch(/^\s*DELETE FROM vendor_contracts/m);
  });

  it("create validates that the vendor exists in the same tenant before insert", () => {
    expect(SRC).toMatch(/SELECT id FROM suppliers WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
    expect(SRC).toContain("المورد غير موجود أو محذوف");
  });

  it("create + update validate startDate <= endDate", () => {
    expect(SRC).toContain('"تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية"');
  });

  it("uses assertInsert to fail-loud on insertId=0", () => {
    expect(SRC).toContain("assertInsert");
    expect(SRC).toContain('assertInsert(insertId, "vendor_contracts")');
  });

  it("LEFT JOIN suppliers to surface vendorName + applies vendor's deletedAt filter", () => {
    expect(SRC).toMatch(/LEFT JOIN suppliers s ON s\.id = vc\."vendorId" AND s\."deletedAt" IS NULL/);
    expect(SRC).toContain('AS "vendorName"');
  });

  it("list endpoint scopes by companyId via buildScopedWhere + filters by status/vendorId", () => {
    expect(SRC).toContain("buildScopedWhere");
    expect(SRC).toMatch(/AND vc\.status = \$/);
    expect(SRC).toMatch(/AND vc\."vendorId" = \$/);
  });

  it("status enum constraint matches the migration's CHECK clause", () => {
    expect(SRC).toMatch(/z\.enum\(\["active",\s*"expired",\s*"terminated",\s*"pending"\]\)/);
  });
});

describe("finance-vendor-contracts — feature catalog wiring", () => {
  it("finance.contracts is registered in featureCatalog.ts", () => {
    const featureCatalog = readFileSync(
      join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/rbac/featureCatalog.ts"),
      "utf8"
    );
    expect(featureCatalog).toMatch(/key:\s*"finance\.contracts"/);
    expect(featureCatalog).toMatch(/parentKey:\s*"finance"/);
  });
});
