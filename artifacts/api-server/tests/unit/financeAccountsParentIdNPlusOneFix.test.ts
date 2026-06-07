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
 * to fill in a column that's available from a simple self-join.
 *
 * The fix uses a single LEFT JOIN on (code, companyId) so the parent
 * resolution happens once per scan, not once per row.
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

  it("uses a LEFT JOIN self-lookup on chart_of_accounts (code + companyId match)", () => {
    expect(handler).toMatch(
      /LEFT JOIN chart_of_accounts p ON p\.code = c\."parentCode"/,
    );
    expect(handler).toMatch(/p\."companyId"\s*=\s*c\."companyId"/);
    expect(handler).toMatch(/p\."deletedAt"\s+IS\s+NULL/);
  });

  it('projects p.id AS "parentId" instead of a subquery', () => {
    expect(handler).toMatch(/p\.id\s+AS\s+"parentId"/);
  });

  it("preserves the LIMIT 5000 cap", () => {
    expect(handler).toMatch(/LIMIT 5000/);
  });

  it("preserves the c.\"deletedAt\" IS NULL filter on the parent table", () => {
    expect(handler).toMatch(/c\."deletedAt" IS NULL/);
  });
});
