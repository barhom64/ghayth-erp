import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — owner report: "أضفت عميلًا فلا يظهر / يختفي".
 *
 * The cache invalidation (prefix ["clients"]) and the company-wide list
 * scope (disableBranchScope) were already correct, so the real root causes
 * were visibility-shaped:
 *   1. the list sorted by name ASC → a just-added client could be paginated
 *      away on page 2+. Now ordered newest-first.
 *   2. the create page returned to the LIST → if paginated away, the client
 *      looked "missing". Now it lands on the new client's detail record.
 */

const CLIENTS_ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/clients.ts"),
  "utf8",
);
const CREATE_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/clients-create.tsx"),
  "utf8",
);

describe("clients list — newest-first ordering", () => {
  it("orders by createdAt DESC so a just-added client surfaces on page 1", () => {
    expect(CLIENTS_ROUTE).toMatch(/ORDER BY "createdAt" DESC, name ASC/);
  });
});

describe("clients create — lands on the new record", () => {
  it("navigates to /clients/:id after create (not back to the paginated list)", () => {
    expect(CREATE_PAGE).toMatch(/setLocation\(c\?\.id \? `\/clients\/\$\{c\.id\}`/);
  });
});
