import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FND-013 / #2340 triage — tenant-isolation read-back scoping.
 *
 * Several finance-core handlers read a row back by id right after an
 * INSERT / verified UPDATE and return it in the response. The write
 * itself was always companyId-scoped (INSERT carries the column; the
 * UPDATE has `AND "companyId" = $N` plus an affectedRows===0 throw), so
 * the read-back was protected only *transitively* by the upstream check.
 *
 * If a future refactor drops that upstream check, an unscoped
 * `SELECT * FROM <tenant table> WHERE id = $1` becomes a cross-tenant
 * read (IDOR). Scoping the read-back itself makes each statement
 * self-defending. This pins that the read-backs carry the predicate so
 * the hardening can't silently regress, independent of the static
 * tenant-isolation guard (which runs in a separate CI lane).
 *
 * These four (file, table) pairs were removed from
 * scripts/tenant-isolation-allowlist.txt by the same change.
 */

const ROUTES = join(import.meta.dirname!, "../../src/routes");
const ACCOUNTS = readFileSync(join(ROUTES, "finance-accounts.ts"), "utf8");
const ENGINE = readFileSync(join(ROUTES, "accounting-engine.ts"), "utf8");

// Strip block + line comments so a table name inside a JSDoc doesn't
// register as a live statement.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Assert that EVERY `SELECT ... FROM <table> WHERE id = $1` (the
 * read-back shape) in `src` carries a "companyId" predicate. We match
 * the id-lookup occurrences and require companyId within the same
 * statement (up to the closing backtick).
 */
function everyIdReadbackIsScoped(src: string, table: string): boolean {
  const stripped = stripComments(src);
  // Statement = from `SELECT` ... `FROM <table>` ... up to the closing backtick.
  const re = new RegExp(
    "SELECT[\\s\\S]*?FROM\\s+" + table + "\\b[\\s\\S]*?`",
    "g",
  );
  let m: RegExpExecArray | null;
  let sawIdLookup = false;
  while ((m = re.exec(stripped)) !== null) {
    const stmt = m[0];
    if (!/\bid\s*=\s*\$\d/.test(stmt)) continue; // not an id read-back
    sawIdLookup = true;
    if (!/"companyId"\s*=\s*\$\d/.test(stmt)) return false;
  }
  return sawIdLookup; // must have found at least one to be meaningful
}

describe("FND-013 #2340 — finance-accounts read-backs are companyId-scoped", () => {
  for (const table of ["tax_codes", "wht_categories", "accounting_allocation_rules"]) {
    it(`every "FROM ${table} WHERE id = $1" read-back carries a companyId predicate`, () => {
      expect(everyIdReadbackIsScoped(ACCOUNTS, table)).toBe(true);
    });
  }

  it("no bare unscoped id read-back remains for these tables", () => {
    const stripped = stripComments(ACCOUNTS);
    for (const table of ["tax_codes", "wht_categories", "accounting_allocation_rules"]) {
      // A bare read-back would be `FROM <table> WHERE id = $1` followed by a
      // backtick with no companyId before it.
      const bad = new RegExp("FROM\\s+" + table + "\\s+WHERE\\s+id\\s*=\\s*\\$1`");
      expect(stripped).not.toMatch(bad);
    }
  });
});

describe("FND-013 #2340 — accounting-engine provisioning-failure read-back is scoped", () => {
  it("retry read-back of subsidiary_account_provisioning_failures carries companyId", () => {
    expect(everyIdReadbackIsScoped(ENGINE, "subsidiary_account_provisioning_failures")).toBe(true);
  });
});
