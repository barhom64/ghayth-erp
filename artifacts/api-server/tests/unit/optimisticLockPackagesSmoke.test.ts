import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2718 — قفل التعارض المتفائل (طيّار: umrah/packages PATCH، بلا هجرة —
 * يستخدم عمود updatedAt القائم الذي يحدّثه المعالج أصلًا). opt-in: لا يكسر
 * النداءات التي لا ترسل updatedAt. اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const UMRAH = readFileSync(join(import.meta.dirname!, "../../src/routes/umrah.ts"), "utf8");

const patchHandler = (() => {
  const m = UMRAH.match(/router\.patch\("\/packages\/:id"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("PATCH /packages/:id not found");
  return m[0];
})();

describe("umrah packages PATCH — opt-in optimistic lock", () => {
  it("accepts an optional client version (updatedAt) in the schema", () => {
    expect(UMRAH).toMatch(/patchPackageSchema = z\.object\(\{[\s\S]*?updatedAt: z\.string\(\)\.optional\(\)/);
  });

  it("still advances the version on every write (sets updatedAt=NOW())", () => {
    expect(patchHandler).toMatch(/sets\.push\(`"updatedAt"=NOW\(\)`\)/);
  });

  it("enforces the client version in the WHERE only when provided (opt-in, non-breaking)", () => {
    expect(patchHandler).toMatch(/if \(b\.updatedAt\) \{ params\.push\(b\.updatedAt\); versionClause = ` AND "updatedAt"=\$\$\{params\.length\}`; \}/);
    expect(patchHandler).toMatch(/WHERE id=\$\$\{idIdx\} AND "companyId"=\$\$\{coIdx\} AND "deletedAt" IS NULL\$\{versionClause\}/);
  });

  it("distinguishes a version conflict (409) from a true not-found (404)", () => {
    // re-check existence without the version clause; row present + version sent → conflict.
    expect(patchHandler).toMatch(/SELECT id FROM umrah_packages WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NULL/);
    expect(patchHandler).toMatch(/if \(stillThere && b\.updatedAt\) \{[\s\S]*?ConflictError\("عُدّلت الباقة من مستخدم آخر/);
    expect(patchHandler).toMatch(/throw new NotFoundError\("الباقة غير موجودة"\)/);
  });
});
