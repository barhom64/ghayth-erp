import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على منتجات المستودع) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (warehouse_products.deletedAt قائم). الحذف يمرّ عبر آلة الحالة
 * (applyTransition)، فالاسترجاع يعكسه عبر الإطار نفسه. اختبار ثابت — لا DB.
 */
const WAREHOUSE = readFileSync(join(import.meta.dirname!, "../../src/routes/warehouse.ts"), "utf8");

const restoreHandler = (() => {
  const m = WAREHOUSE.match(/router\.post\("\/products\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /products/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = WAREHOUSE.match(/router\.get\("\/products"[\s\S]*?ORDER BY p\.name/);
  if (!m) throw new Error("GET /products not found");
  return m[0];
})();

describe("warehouse products list — trash view", () => {
  it("GET /products honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/where \+= showDeleted \? ` AND p\."deletedAt" IS NOT NULL` : ` AND p\."deletedAt" IS NULL`;/);
    // both count + main queries now rely on ${where}, not a hard-coded predicate
    expect(listHandler).not.toMatch(/WHERE \$\{where\} AND p\."deletedAt" IS NULL/);
  });
});

describe("POST /products/:id/restore", () => {
  it("requires delete permission + resource guard", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "warehouse\.inventory", action: "delete", resource: \{ table: "warehouse_products", idParam: "id" \} \}\)/);
  });
  it("reverses the delete via the SAME lifecycle engine (inactive→active, deletedAt=NULL, only deleted rows)", () => {
    expect(restoreHandler).toMatch(/applyTransition\(\{/);
    expect(restoreHandler).toMatch(/action: "warehouse\.product\.restored"/);
    expect(restoreHandler).toMatch(/fromStates: \["inactive"\]/);
    expect(restoreHandler).toMatch(/toState: "active"/);
    expect(restoreHandler).toMatch(/deletedAt: \{ raw: "NULL" \}/);
    expect(restoreHandler).toMatch(/extraWhere: `"deletedAt" IS NOT NULL`/);
  });
  it("maps lifecycle errors (404 when nothing to restore) like the delete handler", () => {
    expect(restoreHandler).toMatch(/lifecycleErrorResponse\(err\)/);
  });
});
