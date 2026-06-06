import { describe, it, expect, beforeAll } from "vitest";
import { delegationCoversFeature, getActiveDelegationsFor } from "../../src/lib/rbac/delegationService.js";
import { rawExecute, rawQuery } from "../../src/lib/rawdb.js";

const HAS_DB = !!process.env.DATABASE_URL;

describe("delegationCoversFeature — granular + wildcard matching", () => {
  it("exact feature match", () => {
    expect(delegationCoversFeature(["hr.leaves"], "hr.leaves", "hr")).toBe(true);
  });
  it("module wildcard (hr.*) and bare module cover any hr feature", () => {
    expect(delegationCoversFeature(["hr.*"], "hr.leaves", "hr")).toBe(true);
    expect(delegationCoversFeature(["hr"], "hr.leaves", "hr")).toBe(true);
  });
  it("global '*' covers everything", () => {
    expect(delegationCoversFeature(["*"], "finance.invoices", "finance")).toBe(true);
  });
  it("does NOT cover a feature outside the delegated list", () => {
    expect(delegationCoversFeature(["hr.leaves"], "finance.invoices", "finance")).toBe(false);
    expect(delegationCoversFeature([], "hr.leaves", "hr")).toBe(false);
  });
});

describe("getActiveDelegationsFor — only honours rows inside the active window", () => {
  const COMPANY = 999777; // isolated test company id
  const DELEGATE = 999001;
  const DELEGATOR = 999002;

  beforeAll(async () => {
    if (!HAS_DB) return;
    await rawExecute(`DELETE FROM delegations WHERE "companyId" = $1`, [COMPANY]).catch(() => undefined);
    // Seed FK parents (companyId→companies, delegator/delegateId→employees).
    await rawExecute(`INSERT INTO companies (id, name) VALUES ($1,'deleg-test') ON CONFLICT (id) DO NOTHING`, [COMPANY]).catch(() => undefined);
    await rawExecute(`INSERT INTO employees (id, name, "companyId") VALUES ($1,'delegate','${COMPANY}'),($2,'delegator','${COMPANY}') ON CONFLICT (id) DO NOTHING`, [DELEGATE, DELEGATOR]).catch(() => undefined);
    // active (no end / today within window)
    await rawExecute(
      `INSERT INTO delegations ("companyId","delegatorId","delegateId",scope,reason,status,"startDate","endDate",features)
       VALUES ($1,$2,$3,'','t','active', CURRENT_DATE - 1, CURRENT_DATE + 5, '["hr.leaves"]'::jsonb)`,
      [COMPANY, DELEGATOR, DELEGATE],
    ).catch(() => undefined);
    // expired (endDate in the past) — must NOT be returned
    await rawExecute(
      `INSERT INTO delegations ("companyId","delegatorId","delegateId",scope,reason,status,"startDate","endDate",features)
       VALUES ($1,$2,$3,'','t','active', CURRENT_DATE - 10, CURRENT_DATE - 2, '["finance.invoices"]'::jsonb)`,
      [COMPANY, DELEGATOR, DELEGATE],
    ).catch(() => undefined);
    // revoked (status) — must NOT be returned
    await rawExecute(
      `INSERT INTO delegations ("companyId","delegatorId","delegateId",scope,reason,status,"startDate","endDate",features)
       VALUES ($1,$2,$3,'','t','revoked', CURRENT_DATE - 1, CURRENT_DATE + 5, '["hr.payroll"]'::jsonb)`,
      [COMPANY, DELEGATOR, DELEGATE],
    ).catch(() => undefined);
  });

  it.skipIf(!HAS_DB)("returns only the active, in-window delegation", async () => {
    const rows = await getActiveDelegationsFor(COMPANY, DELEGATE);
    // only the hr.leaves one is active + in-window
    const allFeatures = rows.flatMap((r) => r.features);
    expect(allFeatures).toContain("hr.leaves");
    expect(allFeatures).not.toContain("finance.invoices"); // expired
    expect(allFeatures).not.toContain("hr.payroll");        // revoked
  });

  it.skipIf(!HAS_DB)("returns nothing for a user with no delegations", async () => {
    const rows = await getActiveDelegationsFor(COMPANY, 424242);
    expect(rows).toEqual([]);
  });
});
