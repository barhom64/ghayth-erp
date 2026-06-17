import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 finance fix — per-PROPERTY subsidiary GL accounts.
 *
 * createSubsidiaryAccountsForEntity() opened per-entity postable leaves for
 * employee / client / vendor / driver / vehicle / umrah_agent but had NO
 * "property" branch — so adding a property created ZERO subsidiary accounts
 * (owner-reported bug: "أضفت عقار ولم تُفتح حسابات فرعية"). The substitution
 * enricher ALREADY routes propertyId → "property" (see
 * subsidiaryCodeSubstitutionSmoke), so the only missing pieces were:
 *   1. creating the per-property leaves under the real COA parents, and
 *   2. stamping parentCode on every subsidiary leaf so the enricher's
 *      `child."parentCode" = line.accountCode` JOIN can actually match
 *      (the INSERT previously set parentId only → dead structure).
 */

const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/accounting-engine.ts"),
  "utf8",
);

describe("createSubsidiaryAccountsForEntity — property branch", () => {
  const propBlock = (() => {
    const m = ENGINE.match(/entityType === "property"\)[\s\S]*?accountsToCreate\.push\(([\s\S]*?)\);/);
    return m ? m[0] : "";
  })();

  it("declares 'property' on the entityType union", () => {
    expect(ENGINE).toMatch(/entityType:\s*"employee"[\s\S]*?\|\s*"property"[\s\S]*?,/);
  });

  it("has a property branch (was missing → properties got zero subsidiary accounts)", () => {
    expect(propBlock).toBeTruthy();
  });

  it("opens the 4 per-property leaves under the real COA control parents", () => {
    // tenant receivable 1132 · rental revenue 4120 · maintenance 5610 · depreciation 5740
    expect(propBlock).toMatch(/accountType:\s*"receivable",\s*parentCode:\s*"1132"/);
    expect(propBlock).toMatch(/accountType:\s*"revenue",\s*parentCode:\s*"4120"/);
    expect(propBlock).toMatch(/accountType:\s*"maintenance",\s*parentCode:\s*"5610"/);
    expect(propBlock).toMatch(/accountType:\s*"depreciation",\s*parentCode:\s*"5740"/);
  });
});

describe("subsidiary leaf INSERT — stamps parentCode so dimensional substitution can route", () => {
  it("the per-entity chart_of_accounts INSERT carries parentCode (not just parentId)", () => {
    // Without parentCode the substituteSubsidiaryAccountCodes JOIN
    // (child."parentCode" = line.accountCode) never matches → the leaves
    // are dead structure for every entity type, not just property.
    const subInsert = ENGINE.match(/const \{ rows: \[newAcc\] \} = await client\.query\([\s\S]*?\);/);
    expect(subInsert).toBeTruthy();
    expect(subInsert![0]).toMatch(/INSERT INTO chart_of_accounts/);
    expect(subInsert![0]).toMatch(/"parentCode"/);
    expect(subInsert![0]).toMatch(/parentAccount\.code/);
    expect(subInsert![0]).toMatch(/"accountUsage"/);
  });
});

describe("subsidiary leaf accountUsage — auto-created leaves are classified (payment-method filter)", () => {
  it("maps money/ledger accountTypes to a valid accountUsage bucket", () => {
    const map = ENGINE.match(/SUBSIDIARY_ACCOUNT_USAGE[\s\S]*?\};/);
    expect(map).toBeTruthy();
    expect(map![0]).toMatch(/custody:\s*"custody"/);
    expect(map![0]).toMatch(/receivable:\s*"receivable"/);
    expect(map![0]).toMatch(/payable:\s*"payable"/);
  });
  it("the INSERT stamps accountUsage from the map (so custody leaves filter under cash payments)", () => {
    const subInsert = ENGINE.match(/const \{ rows: \[newAcc\] \} = await client\.query\([\s\S]*?\);/);
    expect(subInsert![0]).toMatch(/SUBSIDIARY_ACCOUNT_USAGE\[acc\.accountType\]/);
  });
});
