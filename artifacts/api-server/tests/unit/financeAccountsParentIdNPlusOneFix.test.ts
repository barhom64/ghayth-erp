/**
 * Finance accounts list — N+1 fix on parentId self-lookup.
 *
 * GET /api/finance/accounts returned up to 5000 chart-of-accounts
 * rows. Each row carried a correlated scalar subquery to resolve
 * parentId from parentCode against chart_of_accounts ITSELF:
 *
 *   (SELECT p.id FROM chart_of_accounts p
 *     WHERE p.code = c."parentCode"
 *       AND p."companyId" = c."companyId"
 *       AND p."deletedAt" IS NULL LIMIT 1) AS "parentId"
 *
 * That's up to 5000 extra hits against chart_of_accounts per request
 * to fill in a column the row ALREADY HAS — c."parentId" is populated
 * by POST /accounts (see the UPDATE chart_of_accounts SET "parentId"
 * = (SELECT p.id …) call site), so the lookup was just a safety net.
 *
 * The fix drops the lookup entirely and projects c."parentId"
 * directly. Rows where parentId drifted away from the FK now read
 * NULL, which is exactly what the tree-builder on the client treats
 * as "no parent" — same behavior as the legacy fallback when the
 * lookup returned no match.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-accounts.ts"),
  "utf8",
);

describe("Finance accounts list — parentId N+1 fix", () => {
  const handlerIdx = SRC.indexOf('accountsRouter.get("/accounts"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("the /accounts list handler is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated scalar SELECT p.id FROM chart_of_accounts p subquery remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+p\.id\s+FROM\s+chart_of_accounts\s+p\s+WHERE\s+p\.code\s*=\s*c\."parentCode"/,
    );
  });

  it("does NOT re-introduce a self-join on chart_of_accounts — the column already exists on c", () => {
    // Self-join would re-create the ambiguity flagged by
    // check-sql-ambiguity (both c.parentId and p.id AS "parentId"
    // collide). The simpler shape is to trust c."parentId".
    expect(handler).not.toMatch(
      /LEFT JOIN chart_of_accounts p ON p\.code = c\."parentCode"/,
    );
  });

  it("selects directly from chart_of_accounts c with no subquery indirection", () => {
    expect(handler).toMatch(/FROM chart_of_accounts c WHERE/);
  });

  it("preserves the LIMIT 5000 cap", () => {
    expect(handler).toMatch(/LIMIT 5000/);
  });

  it("preserves the c.\"deletedAt\" IS NULL filter", () => {
    expect(handler).toMatch(/c\."deletedAt" IS NULL/);
  });
});
