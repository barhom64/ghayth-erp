// E2E verification — runs the Phase 1-6 allocation flow against a real
// Postgres + the real resolver. Tagged so vitest only runs it on demand:
//   E2E=1 npx vitest run tests/e2e-allocation.test.ts
//
// Requires DATABASE_URL pointing at a seeded DB.
import { describe, it, expect } from "vitest";
import { resolveDocumentAllocations, writeAllocationResult } from "../src/lib/accountingAllocation.js";
import { rawQuery, rawExecute } from "../src/lib/rawdb.js";

const SKIP = !process.env.E2E;

describe.skipIf(SKIP)("E2E — Finance Line-Level Allocation full scenario", () => {
  const companyId = 1;

  it("walks the user's verification scenario end-to-end", async () => {
    const log = (t: string) => console.log("\n━━ " + t + " ━━");

    log("STEP 0 — seed sanity");
    const rules = await rawQuery<any>(
      `SELECT id, name, "documentType", "lineType", "entityType",
              "revenueAccountId", "expenseAccountId", "costCenterStrategy"
         FROM accounting_allocation_rules
        WHERE "companyId"=$1 AND "isActive"=true
        ORDER BY id`, [companyId]
    );
    console.log("rules:", JSON.stringify(rules, null, 2));
    expect(rules.length).toBe(4);

    log("STEP 1 — invoice with 3 lines → resolver");
    const lineInputs = [
      { documentType:"invoice", lineType:"transport", activityType:"transport", entityType:"vehicle",
        dimensions:{vehicleId:1, clientId:1}, sourceTable:"invoice_lines_demo", sourceLineId:1001, companyId },
      { documentType:"invoice", lineType:"rent", activityType:"rent", entityType:"property",
        dimensions:{propertyId:1, clientId:1}, sourceTable:"invoice_lines_demo", sourceLineId:1002, companyId },
      { documentType:"invoice", lineType:"consulting", entityType:"client",
        dimensions:{clientId:1}, sourceTable:"invoice_lines_demo", sourceLineId:1003, companyId },
    ];
    const results = await resolveDocumentAllocations(lineInputs as any);
    console.log("invoice resolver output:", JSON.stringify(results, null, 2));
    expect(results[0].status).toBe("resolved");
    expect(results[0].resolvedAccountCode).toBe("4101");
    expect(results[0].costCenterId).toBe(1001);
    expect(results[0].ruleId).toBe(1);
    expect(results[1].status).toBe("resolved");
    expect(results[1].resolvedAccountCode).toBe("4201");
    expect(results[1].costCenterId).toBe(1002);
    expect(results[2].status).toBe("unmapped");

    log("STEP 2 — persist allocation_results");
    for (let i = 0; i < results.length; i++) await writeAllocationResult(lineInputs[i] as any, results[i], 1);
    const persistedInv = await rawQuery<any>(
      `SELECT "sourceLineId", "resolvedAccountCode", "costCenterId", "ruleId",
              "resolutionStatus", "dimensionsJson"
         FROM accounting_allocation_results
        WHERE "companyId"=$1 AND "sourceTable"='invoice_lines_demo'
        ORDER BY "sourceLineId"`, [companyId]);
    console.log("allocation_results:", JSON.stringify(persistedInv, null, 2));
    expect(persistedInv.length).toBe(3);

    log("STEP 3 — GRN 3 treatments → resolver");
    const grnLines = [
      { documentType:"grn", lineType:"inventory", entityType:"vendor",
        dimensions:{vendorId:1, productId:1}, sourceTable:"goods_receipt_items_demo", sourceLineId:2001, companyId },
      { documentType:"grn", lineType:"vehicle_cost", activityType:"fuel", entityType:"vehicle",
        dimensions:{vendorId:1, vehicleId:1}, sourceTable:"goods_receipt_items_demo", sourceLineId:2002, companyId },
      { documentType:"grn", lineType:"property_maintenance", activityType:"maintenance", entityType:"property",
        dimensions:{vendorId:1, propertyId:1}, sourceTable:"goods_receipt_items_demo", sourceLineId:2003, companyId },
    ];
    const grnResults = await resolveDocumentAllocations(grnLines as any);
    console.log("GRN resolver output:", JSON.stringify(grnResults, null, 2));
    expect(grnResults[0].status).toBe("unmapped");
    expect(grnResults[1].resolvedAccountCode).toBe("6501");
    expect(grnResults[1].costCenterId).toBe(1001);
    expect(grnResults[2].resolvedAccountCode).toBe("6601");
    expect(grnResults[2].costCenterId).toBe(1002);

    for (let i = 0; i < grnResults.length; i++) await writeAllocationResult(grnLines[i] as any, grnResults[i], 1);

    log("STEP 4 — simulate JE posting");
    await rawExecute(
      `INSERT INTO journal_entries (id, "companyId", "branchId", ref, description, type,
                                    "sourceType", "sourceId", status, "balancesApplied", "createdAt", "createdBy")
       VALUES (9001, 1, 1, 'JE-INV-DEMO', 'فاتورة تجريبية', 'invoice', 'invoice', 100,
               'posted', true, NOW(), 1)
       ON CONFLICT (id) DO NOTHING`);
    await rawExecute(`DELETE FROM journal_lines WHERE "journalId" IN (9001, 9002)`);
    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,"accountId",
         "costCenterId","vehicleId","propertyId","clientId",
         "sourceLineTable","sourceLineId","dimensionJson")
       VALUES
         (9001, '1200', 1000, 0, 1200, NULL, NULL, NULL, 1, NULL, NULL, NULL),
         (9001, $1, 0, 600, $2, $3, 1,    NULL, 1, 'invoice_lines_demo', 1001, '{"resolvedBy":"rule:1"}'::jsonb),
         (9001, $4, 0, 300, $5, $6, NULL, 1,    1, 'invoice_lines_demo', 1002, '{"resolvedBy":"rule:2"}'::jsonb),
         (9001, '4000', 0, 100, 4000, NULL, NULL, NULL, 1, 'invoice_lines_demo', 1003, NULL)`,
      [results[0].resolvedAccountCode, results[0].resolvedAccountId, results[0].costCenterId,
       results[1].resolvedAccountCode, results[1].resolvedAccountId, results[1].costCenterId]);

    await rawExecute(
      `INSERT INTO journal_entries (id, "companyId", "branchId", ref, description, type,
                                    "sourceType", "sourceId", status, "balancesApplied", "createdAt", "createdBy")
       VALUES (9002, 1, 1, 'JE-GRN-DEMO', 'GRN تجريبية', 'grn', 'goods_receipt', 200,
               'posted', true, NOW(), 1)
       ON CONFLICT (id) DO NOTHING`);
    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,"accountId",
         "costCenterId","vehicleId","propertyId","vendorId",
         "sourceLineTable","sourceLineId","dimensionJson")
       VALUES
         (9002, '1250', 500, 0, 1250, NULL, NULL, NULL, 1, 'goods_receipt_items_demo', 2001, NULL),
         (9002, $1, 800, 0, $2, $3, 1,    NULL, 1, 'goods_receipt_items_demo', 2002, '{"resolvedBy":"rule:3"}'::jsonb),
         (9002, $4, 200, 0, $5, $6, NULL, 1,    1, 'goods_receipt_items_demo', 2003, '{"resolvedBy":"rule:4"}'::jsonb),
         (9002, '2115', 0, 1500, 2115, NULL, NULL, NULL, 1, NULL, NULL, NULL)`,
      [grnResults[1].resolvedAccountCode, grnResults[1].resolvedAccountId, grnResults[1].costCenterId,
       grnResults[2].resolvedAccountCode, grnResults[2].resolvedAccountId, grnResults[2].costCenterId]);

    log("STEP 5 — journal_lines dimensional verification");
    const jl = await rawQuery<any>(
      `SELECT je.ref, jl."accountCode", jl.debit, jl.credit,
              jl."costCenterId", jl."vehicleId", jl."propertyId",
              jl."sourceLineTable", jl."sourceLineId", jl."dimensionJson"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
        WHERE je.id IN (9001, 9002)
        ORDER BY je.id, jl.id`);
    console.log("journal_lines:", JSON.stringify(jl, null, 2));
    expect(jl.length).toBe(8);

    log("STEP 6 — Vehicle V-12 profitability");
    const veh = await rawQuery<any>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id=jl."journalId"
          AND je."companyId"=1 AND je."deletedAt" IS NULL
          AND je."balancesApplied"=true AND je."reversedById" IS NULL
         JOIN chart_of_accounts coa ON coa.code=jl."accountCode" AND coa."companyId"=1
        WHERE jl."vehicleId"=1 AND jl."deletedAt" IS NULL
        GROUP BY coa.code, coa.name, coa.type
        ORDER BY coa.type, coa.code`);
    console.log("vehicle V-12 profitability:", JSON.stringify(veh, null, 2));
    const vRev = veh.reduce((s, r) => s + Number(r.revenue), 0);
    const vExp = veh.reduce((s, r) => s + Number(r.expense), 0);
    console.log(`Vehicle V-12: revenue=${vRev} expense=${vExp} net=${vRev - vExp}`);
    expect(vRev).toBe(600);
    expect(vExp).toBe(800);

    log("STEP 7 — Property P-1 profitability");
    const prop = await rawQuery<any>(
      `SELECT coa.code, coa.name, coa.type,
              COALESCE(SUM(CASE WHEN coa.type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue,
              COALESCE(SUM(CASE WHEN coa.type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expense
         FROM journal_lines jl
         JOIN journal_entries je ON je.id=jl."journalId"
          AND je."companyId"=1 AND je."deletedAt" IS NULL
          AND je."balancesApplied"=true AND je."reversedById" IS NULL
         JOIN chart_of_accounts coa ON coa.code=jl."accountCode" AND coa."companyId"=1
        WHERE jl."propertyId"=1 AND jl."deletedAt" IS NULL
        GROUP BY coa.code, coa.name, coa.type
        ORDER BY coa.type, coa.code`);
    console.log("property P-1 profitability:", JSON.stringify(prop, null, 2));
    const pRev = prop.reduce((s, r) => s + Number(r.revenue), 0);
    const pExp = prop.reduce((s, r) => s + Number(r.expense), 0);
    console.log(`Property P-1: revenue=${pRev} expense=${pExp} net=${pRev - pExp}`);
    expect(pRev).toBe(300);
    expect(pExp).toBe(200);

    log("STEP 8 — final allocation_results");
    const final = await rawQuery<any>(
      `SELECT "sourceTable", COUNT(*)::text AS cnt
         FROM accounting_allocation_results
        WHERE "companyId"=1
        GROUP BY "sourceTable" ORDER BY "sourceTable"`);
    console.log("final results count:", JSON.stringify(final, null, 2));
    expect(final.length).toBe(2);

    console.log("\n✅ E2E COMPLETED");
  });
});
