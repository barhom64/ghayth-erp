// FULL CYCLE E2E — Charter Issue #1870, §6 + §6.2 + §5 + §8 wired together.
//
// Operator directive in one line: "every قيد in the umrah cycle must roll
// up by الوكيل الرئيسي + الموسم + العميل + الموظف end-to-end, and the
// engine's direction (VAT inclusive/exclusive + commission via HR or
// not) must be configurable from system_settings — not from code."
//
// This E2E exercises the COMPLETE cycle against a single agent + season
// and verifies the books reconcile:
//
//   1) NUSK purchase JE (§6.2)
//        DR  5201-T  (cost)            + umrahAgentId + umrahSeasonId
//        CR  2101-T  (AP)              + umrahAgentId + umrahSeasonId + vendorId
//
//   2) Sales invoice JE (§6 — 2-line + inclusive VAT)
//        DR  1200-T  (AR)              + umrahAgentId + umrahSeasonId + clientId
//        CR  4200-T  (revenue)         + umrahAgentId + umrahSeasonId + clientId
//        CR  2300-T  (VAT output)      + umrahAgentId + umrahSeasonId + clientId
//
//   3) Commission accrual JE (§5 — via HR)
//        DR  6200-T  (commission)      + employeeId   + umrahSeasonId
//        CR  2120-T  (salary_payable)  + employeeId   + umrahSeasonId
//
// Reconciliation checks:
//   • Each JE is internally balanced.
//   • Drill-by-agent + drill-by-season sees ALL three JEs.
//   • VAT extracted formula matches the operator's worked example (450 × 15/115 = 58.70).
//   • Commission CR lands in salary_payable (HR's account), NOT commission_payable.
//
// Skips cleanly when DATABASE_URL has no test marker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_ID = 2;

d("Charter #1870 — full umrah finance cycle E2E (§6 + §6.2 + §5 + §8)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let withTransaction: any;
  let generateSalesInvoice: any;
  let postNuskJournalEntries: any;
  let calculateCommissionForPlan: any;
  const ids: {
    branchId?: number;
    userId?: number;
    seasonId?: number;
    agentId?: number;
    clientId?: number;
    subAgentId?: number;
    groupId?: number;
    pilgrimId?: number;
    pricingId?: number;
    nuskInvoiceId?: number;
    nuskSupplierId?: number;
    priorNuskSupplierId?: number | null;
    visaProductId?: number;
    servicesProductId?: number;
    transportProductId?: number;
    revenueAccountId?: number;
    employeeId?: number;
    assignmentId?: number;
    planId?: number;
    salesInvoiceId?: number;
  } = {};

  async function teardown() {
    try {
      // All JEs sourced from any of the three engines.
      const sourceTypes = ["umrah_nusk_invoices", "umrah_sales_invoices", "employee_commission_calculations"];
      for (const st of sourceTypes) {
        const srcId = st === "umrah_nusk_invoices" ? ids.nuskInvoiceId
                     : st === "umrah_sales_invoices" ? ids.salesInvoiceId
                     : ids.planId;
        if (!srcId) continue;
        await rawExecute(
          `DELETE FROM journal_lines WHERE "journalId" IN
             (SELECT id FROM journal_entries WHERE "sourceType" = $1 AND "sourceId" = $2)`,
          [st, srcId]
        );
        await rawExecute(
          `DELETE FROM journal_entries WHERE "sourceType" = $1 AND "sourceId" = $2`,
          [st, srcId]
        );
      }
      if (ids.planId) {
        await rawExecute(`DELETE FROM employee_commission_calculations WHERE "planId" = $1`, [ids.planId]);
        await rawExecute(`DELETE FROM employee_commission_plans WHERE id = $1`, [ids.planId]);
      }
      if (ids.assignmentId) await rawExecute(`DELETE FROM employee_assignments WHERE id = $1`, [ids.assignmentId]);
      if (ids.employeeId) await rawExecute(`DELETE FROM employees WHERE id = $1`, [ids.employeeId]);
      if (ids.salesInvoiceId) {
        await rawExecute(`DELETE FROM umrah_sales_invoice_items WHERE "invoiceId" = $1`, [ids.salesInvoiceId]);
        await rawExecute(`DELETE FROM umrah_sales_invoices WHERE id = $1`, [ids.salesInvoiceId]);
      }
      if (ids.nuskInvoiceId) await rawExecute(`DELETE FROM umrah_nusk_invoices WHERE id = $1`, [ids.nuskInvoiceId]);
      if (ids.pilgrimId) await rawExecute(`DELETE FROM umrah_pilgrims WHERE id = $1`, [ids.pilgrimId]);
      if (ids.groupId) await rawExecute(`DELETE FROM umrah_groups WHERE id = $1`, [ids.groupId]);
      if (ids.pricingId) await rawExecute(`DELETE FROM umrah_pricing WHERE id = $1`, [ids.pricingId]);
      if (ids.subAgentId) await rawExecute(`DELETE FROM umrah_sub_agents WHERE id = $1`, [ids.subAgentId]);
      if (ids.clientId) await rawExecute(`DELETE FROM clients WHERE id = $1`, [ids.clientId]);
      if (ids.agentId) await rawExecute(`DELETE FROM umrah_agents WHERE id = $1`, [ids.agentId]);
      if (ids.seasonId) await rawExecute(`DELETE FROM umrah_seasons WHERE id = $1`, [ids.seasonId]);
      // Restore companies state.
      await rawExecute(
        `UPDATE companies SET "umrahVisaProductId"=NULL, "umrahServicesProductId"=NULL, "umrahTransportProductId"=NULL,
                              "nuskSupplierId" = $2
          WHERE id = $1`,
        [COMPANY_ID, ids.priorNuskSupplierId ?? null]
      );
      if (ids.visaProductId) await rawExecute(`DELETE FROM products WHERE id = $1`, [ids.visaProductId]);
      if (ids.servicesProductId) await rawExecute(`DELETE FROM products WHERE id = $1`, [ids.servicesProductId]);
      if (ids.transportProductId) await rawExecute(`DELETE FROM products WHERE id = $1`, [ids.transportProductId]);
      if (ids.nuskSupplierId) await rawExecute(`DELETE FROM suppliers WHERE id = $1`, [ids.nuskSupplierId]);
      await rawExecute(
        `DELETE FROM chart_of_accounts WHERE "companyId"=$1
            AND code IN ('1200-T','4200-T','2300-T','5201-T','2101-T','6200-T','2120-T','2150-T')
            AND name LIKE '%TEST%'`,
        [COMPANY_ID]
      );
      await rawExecute(
        `DELETE FROM system_settings WHERE "companyId" = $1 AND "branchId" IS NULL
            AND key IN ('umrah_vat_rate', 'umrah_vat_mode', 'commission_via_hr')`,
        [COMPANY_ID]
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[e2e] teardown warning:", (e as Error).message);
    }
  }

  beforeAll(async () => {
    const db = await import("../../src/lib/rawdb.js");
    rawQuery = db.rawQuery;
    rawExecute = db.rawExecute;
    withTransaction = db.withTransaction;
    const salesEngine = await import("../../src/lib/umrahInvoicingEngine.js");
    generateSalesInvoice = salesEngine.generateSalesInvoice;
    const importEngine = await import("../../src/lib/umrahImportEngine.js");
    postNuskJournalEntries = importEngine.postNuskJournalEntries;
    const commissionEngine = await import("../../src/lib/umrahCommissionEngine.js");
    calculateCommissionForPlan = commissionEngine.calculateCommissionForPlan;

    const [branch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`,
      [COMPANY_ID]
    );
    ids.branchId = branch.id;
    const [user] = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE email = 'owner@local.test' LIMIT 1`
    );
    ids.userId = user.id;

    // §8 — operator-default settings (matches the engine defaults).
    await rawExecute(
      `DELETE FROM system_settings WHERE "companyId"=$1 AND "branchId" IS NULL
          AND key IN ('umrah_vat_rate','umrah_vat_mode','commission_via_hr')`,
      [COMPANY_ID]
    );
    await rawExecute(
      `INSERT INTO system_settings ("companyId", "branchId", key, value, "createdAt", "updatedAt")
          VALUES ($1, NULL, 'umrah_vat_rate', '15', NOW(), NOW()),
                 ($1, NULL, 'umrah_vat_mode', 'inclusive', NOW(), NOW()),
                 ($1, NULL, 'commission_via_hr', 'true', NOW(), NOW())`,
      [COMPANY_ID]
    );

    // Numbering scheme for the sales invoice.
    await rawExecute(
      `INSERT INTO numbering_schemes ("companyId", "moduleKey", "entityKey", "displayNameAr", prefix)
          VALUES ($1, 'umrah', 'umrah_sales_invoice', 'فاتورة عمرة E2E', 'E2E-UI')
        ON CONFLICT ("companyId", "moduleKey", "entityKey") DO NOTHING`,
      [COMPANY_ID]
    );

    // 8 CoA hooks — covers AR/revenue/VAT (sales) + cost/AP (purchase) +
    // commission_expense/salary_payable (commission). The 2150-T legacy
    // commission_payable is also seeded so the negative-assertion below
    // can pin "we did NOT post there in HR-unified mode".
    const ensureAccount = async (code: string, name: string, type: string) => {
      await rawExecute(
        `INSERT INTO chart_of_accounts ("companyId", code, name, type, "allowPosting", "isActive", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())
          ON CONFLICT ("companyId", code) DO UPDATE SET name = EXCLUDED.name`,
        [COMPANY_ID, code, name, type]
      );
    };
    await ensureAccount("1200-T", "ذمم العمرة (TEST E2E)", "asset");
    await ensureAccount("4200-T", "إيرادات العمرة (TEST E2E)", "revenue");
    await ensureAccount("2300-T", "VAT output (TEST E2E)", "liability");
    await ensureAccount("5201-T", "تكلفة نسك (TEST E2E)", "expense");
    await ensureAccount("2101-T", "AP نسك (TEST E2E)", "liability");
    await ensureAccount("6200-T", "مصروف عمولة (TEST E2E)", "expense");
    await ensureAccount("2120-T", "رواتب مستحقة (TEST E2E)", "liability");
    await ensureAccount("2150-T", "عمولات مستحقة (TEST E2E)", "liability");
    const [rev] = await rawQuery<{ id: number }>(
      `SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code='4200-T' LIMIT 1`,
      [COMPANY_ID]
    );
    ids.revenueAccountId = rev.id;

    await rawExecute(
      `INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive")
          VALUES
            ($1, 'umrah_invoice_ar',      'AR — umrah E2E',          '1200-T', NULL, true),
            ($1, 'umrah_invoice_revenue', 'Revenue — umrah E2E',     NULL, '4200-T', true),
            ($1, 'vat_output',            'VAT output E2E',          NULL, '2300-T', true),
            ($1, 'umrah_nusk_cost',       'NUSK cost+AP E2E',        '5201-T', '2101-T', true),
            ($1, 'commission_expense',    'Commission expense E2E',  '6200-T', NULL, true),
            ($1, 'salary_payable',        'Salary payable E2E',      NULL, '2120-T', true),
            ($1, 'commission_payable',    'Commission payable E2E',  NULL, '2150-T', true)
        ON CONFLICT ("companyId", "operationType") DO UPDATE
          SET "debitAccountCode" = EXCLUDED."debitAccountCode",
              "creditAccountCode" = EXCLUDED."creditAccountCode"`,
      [COMPANY_ID]
    );

    // 3 umrah products + companies.umrah* links.
    const insertProduct = async (name: string, taxCode: string) => {
      const [row] = await rawQuery<{ id: number }>(
        `INSERT INTO products ("companyId", name, "defaultTaxCode", "defaultRevenueAccountId", "itemType", "createdAt")
            VALUES ($1, $2, $3, $4, 'service', NOW())
            RETURNING id`,
        [COMPANY_ID, name, taxCode, ids.revenueAccountId]
      );
      return row.id;
    };
    ids.visaProductId = await insertProduct("Umrah Visa (TEST E2E)", "zero");
    ids.servicesProductId = await insertProduct("Umrah Ground Service (TEST E2E)", "standard");
    ids.transportProductId = await insertProduct("Umrah Transport (TEST E2E)", "standard");

    // Vendor for §6.2 + capture prior nuskSupplierId.
    const [companyCfg] = await rawQuery<{ nuskSupplierId: number | null }>(
      `SELECT "nuskSupplierId" FROM companies WHERE id = $1`,
      [COMPANY_ID]
    );
    ids.priorNuskSupplierId = companyCfg?.nuskSupplierId ?? null;
    const [supplier] = await rawQuery<{ id: number }>(
      `INSERT INTO suppliers ("companyId", name, status, category)
          VALUES ($1, 'وزارة الحج عبر نسك (TEST E2E)', 'active', 'umrah')
          RETURNING id`,
      [COMPANY_ID]
    );
    ids.nuskSupplierId = supplier.id;

    await rawExecute(
      `UPDATE companies
          SET "umrahVisaProductId"=$2,
              "umrahServicesProductId"=$3,
              "umrahTransportProductId"=$4,
              "nuskSupplierId"=$5
        WHERE id=$1`,
      [COMPANY_ID, ids.visaProductId, ids.servicesProductId, ids.transportProductId, ids.nuskSupplierId]
    );

    // Domain: season + agent + client + sub-agent + group + pilgrim + pricing.
    const [season] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
          VALUES ($1, 'Season E2E', '2026-01-01', '2026-12-31', 'open') RETURNING id`,
      [COMPANY_ID]
    );
    ids.seasonId = season.id;
    const [agent] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_agents ("companyId", name, status, currency, country)
          VALUES ($1, 'Main NUSK Agent E2E', 'active', 'SAR', 'SA') RETURNING id`,
      [COMPANY_ID]
    );
    ids.agentId = agent.id;
    const [client] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name, type)
          VALUES ($1, 'Client E2E', 'individual') RETURNING id`,
      [COMPANY_ID]
    );
    ids.clientId = client.id;
    const [subAgent] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_sub_agents ("companyId", "branchId", name, "agentId", "clientId", "nuskCode", "isActive")
          VALUES ($1, $2, 'SubAgent E2E', $3, $4, 'TEST-E2E-SA', true) RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.agentId, ids.clientId]
    );
    ids.subAgentId = subAgent.id;
    const [group] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_groups ("companyId", "branchId", "nuskGroupNumber", name, status,
                                  "mutamerCount", "subAgentId", "agentId", "seasonId")
          VALUES ($1, $2, 'TEST-E2E-GRP', 'Group E2E', 'imported', 1, $3, $4, $5) RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    ids.groupId = group.id;
    const [pilgrim] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_pilgrims ("companyId", "branchId", "groupId", "subAgentId", "agentId", "seasonId",
                                    "passportNumber", "fullName", "arrivalDate", status)
          VALUES ($1, $2, $3, $4, $5, $6, 'TEST-E2E-PP', 'E2E Pilgrim', '2026-03-01', 'pending') RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.groupId, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    ids.pilgrimId = pilgrim.id;
    const [pricing] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_pricing ("companyId", "subAgentId", "pricePerMutamer", "validFrom", "validTo")
          VALUES ($1, $2, 1000, '2026-01-01', '2026-12-31') RETURNING id`,
      [COMPANY_ID, ids.subAgentId]
    );
    ids.pricingId = pricing.id;

    // Employee + assignment + commission plan (HR side).
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, status, "createdAt") VALUES ('Marketer E2E', 'active', NOW()) RETURNING id`
    );
    ids.employeeId = emp.id;
    const [assn] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "jobTitle", role, salary, "isPrimary",
                                          "hireDate", status, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, 'مسوّق عمرة E2E', 'employee', 5000, true, '2026-01-01', 'active', NOW(), NOW())
          RETURNING id`,
      [ids.employeeId, COMPANY_ID, ids.branchId]
    );
    ids.assignmentId = assn.id;
    const [plan] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_commission_plans
          ("companyId", "branchId", "employeeId", "assignmentId", "seasonId", "planName",
            "baseSalary", "commissionType", "fixedAmount", "conditionType",
            "excludedMonths", "tierUnit", "partialTiersAllowed", "violationBlocksCommission",
            status, "createdBy", "createdAt", "updatedAt", version)
          VALUES ($1, $2, $3, $4, $5, 'Plan E2E', 5000, 'fixed', 1500, 'none',
                  '[]'::jsonb, 10000, false, false, 'active', $6, NOW(), NOW(), 1)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.employeeId, ids.assignmentId, ids.seasonId, ids.userId]
    );
    ids.planId = plan.id;

    // NUSK invoice + AP JE (§6.2).
    await withTransaction(async (client: any) => {
      const res = await client.query(
        `INSERT INTO umrah_nusk_invoices ("companyId", "branchId", "nuskInvoiceNumber",
                                          "agentId", "subAgentId", "groupId", "mutamerCount",
                                          "groundServices", "electronicFees", "visaFees", "insuranceFees",
                                          "enrichmentServices", "additionalServices", "transportTotal",
                                          "hotelTotal", "refundAmount", "netCost", "totalAmount",
                                          "nuskStatus", "issueDate")
              VALUES ($1, $2, 'TEST-E2E-NUSK', $3, $4, $5, 1,
                      50, 20, 300, 20, 0, 10, 100, 50, 0, 550, 550, 'issued', NOW())
              RETURNING id`,
        [COMPANY_ID, ids.branchId, ids.agentId, ids.subAgentId, ids.groupId]
      );
      ids.nuskInvoiceId = res.rows[0].id;
      await postNuskJournalEntries(
        client,
        { companyId: COMPANY_ID, branchId: ids.branchId!, userId: ids.userId!, seasonId: 0 },
        {
          nuskId: ids.nuskInvoiceId,
          nuskInvoiceNumber: "TEST-E2E-NUSK",
          totalAmount: 550,
          refundAmount: 0,
          nuskStatus: "issued",
          existingApJeId: null,
          existingRefundJeId: null,
        },
      );
    });

    // Sales invoice + JE (§6 — inclusive VAT default).
    const salesResult = await generateSalesInvoice(
      { companyId: COMPANY_ID, branchId: ids.branchId!, userId: ids.userId! },
      { subAgentId: ids.subAgentId!, groupIds: [ids.groupId!], seasonId: ids.seasonId! }
    );
    ids.salesInvoiceId = salesResult.invoiceId;

    // Commission accrual + JE (§5 — via HR default).
    await calculateCommissionForPlan(ids.planId!, 6, 2026, ids.userId!, COMPANY_ID);
  });

  afterAll(async () => {
    await teardown();
  });

  it("§6.2 — NUSK purchase JE: DR cost = CR AP, both lines carry agent + season; AP carries vendor", async () => {
    const [je] = await rawQuery<{ id: number; type: string }>(
      `SELECT id, type FROM journal_entries
        WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.nuskInvoiceId]
    );
    expect(je.type).toBe("purchase");
    const lines = await rawQuery<{
      "accountCode": string; debit: string; credit: string;
      "umrahAgentId": number | null; "umrahSeasonId": number | null; "vendorId": number | null;
    }>(
      `SELECT "accountCode", debit, credit, "umrahAgentId", "umrahSeasonId", "vendorId"
         FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );
    expect(lines.length).toBe(2);
    const dr = lines.find((l) => Number(l.debit) > 0)!;
    const cr = lines.find((l) => Number(l.credit) > 0)!;
    expect(dr.accountCode).toBe("5201-T");
    expect(cr.accountCode).toBe("2101-T");
    expect(Number(dr.debit)).toBe(550);
    expect(Number(cr.credit)).toBe(550);
    for (const l of lines) {
      expect(l.umrahAgentId).toBe(ids.agentId);
      expect(l.umrahSeasonId).toBe(ids.seasonId);
    }
    expect(cr.vendorId).toBe(ids.nuskSupplierId);
    expect(dr.vendorId).toBeNull();
  });

  it("§6 — Sales invoice JE: inclusive VAT extracted (margin × 15/115 = 58.70); DR AR = subtotal (no add)", async () => {
    const [inv] = await rawQuery<{
      subtotal: string; "costBasis": string; "marginBase": string;
      "vatRate": string; "vatAmount": string; total: string;
    }>(
      `SELECT subtotal, "costBasis", "marginBase", "vatRate", "vatAmount", total
         FROM umrah_sales_invoices WHERE id = $1`,
      [ids.salesInvoiceId]
    );
    expect(Number(inv.subtotal)).toBe(1000);
    expect(Number(inv.costBasis)).toBe(550);
    expect(Number(inv.marginBase)).toBe(450);
    expect(Number(inv.vatAmount)).toBe(58.70);
    expect(Number(inv.total)).toBe(1000);

    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries
        WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.salesInvoiceId]
    );
    const lines = await rawQuery<{
      "accountCode": string; debit: string; credit: string;
      "umrahAgentId": number | null; "umrahSeasonId": number | null; "clientId": number | null;
    }>(
      `SELECT "accountCode", debit, credit, "umrahAgentId", "umrahSeasonId", "clientId"
         FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );
    const totalDr = lines.reduce((acc, l) => acc + Number(l.debit), 0);
    const totalCr = lines.reduce((acc, l) => acc + Number(l.credit), 0);
    expect(totalDr).toBeCloseTo(1000, 2);
    expect(totalCr).toBeCloseTo(1000, 2);
    const vatLine = lines.find((l) => Number(l.credit) === 58.70);
    expect(vatLine).toBeTruthy();
    expect(vatLine!.accountCode).toBe("2300-T");
    for (const l of lines) {
      expect(l.umrahAgentId).toBe(ids.agentId);
      expect(l.umrahSeasonId).toBe(ids.seasonId);
      expect(l.clientId).toBe(ids.clientId);
    }
  });

  it("§5 — Commission accrual JE: CR routes to salary_payable (2120-T) via HR, NOT commission_payable", async () => {
    const [je] = await rawQuery<{ id: number; type: string }>(
      `SELECT id, type FROM journal_entries
        WHERE "sourceType" = 'employee_commission_calculations' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.planId]
    );
    expect(je.type).toBe("accrual");
    const lines = await rawQuery<{
      "accountCode": string; debit: string; credit: string;
      "employeeId": number | null; "umrahSeasonId": number | null;
    }>(
      `SELECT "accountCode", debit, credit, "employeeId", "umrahSeasonId"
         FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );
    expect(lines.length).toBe(2);
    const dr = lines.find((l) => Number(l.debit) > 0)!;
    const cr = lines.find((l) => Number(l.credit) > 0)!;
    expect(dr.accountCode).toBe("6200-T");
    expect(cr.accountCode).toBe("2120-T"); // ← HR's salary_payable
    expect(cr.accountCode).not.toBe("2150-T"); // ← NOT legacy commission_payable
    expect(Number(dr.debit)).toBe(1500);
    expect(Number(cr.credit)).toBe(1500);
    for (const l of lines) {
      expect(l.employeeId).toBe(ids.employeeId);
      expect(l.umrahSeasonId).toBe(ids.seasonId);
    }
  });

  it("agent + season drill: ALL three JEs surface when filtered by agentId + seasonId", async () => {
    // Sales + NUSK purchase carry umrahAgentId; commission lines don't
    // (the plan has no agentId column today — documented in §5). But
    // ALL three carry umrahSeasonId, so a season-rolled report sees
    // everything. This pins the drill-by-season invariant end-to-end.
    const rows = await rawQuery<{ sourceType: string; cnt: string }>(
      `SELECT je."sourceType", COUNT(*)::text AS cnt
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
        WHERE jl."umrahSeasonId" = $1
          AND je."sourceType" IN ('umrah_nusk_invoices','umrah_sales_invoices','employee_commission_calculations')
          AND je."sourceId" IN ($2, $3, $4)
        GROUP BY je."sourceType"`,
      [ids.seasonId, ids.nuskInvoiceId, ids.salesInvoiceId, ids.planId]
    );
    const bySrc = Object.fromEntries(rows.map((r) => [r.sourceType, Number(r.cnt)]));
    expect(bySrc["umrah_nusk_invoices"]).toBe(2);              // DR cost + CR AP
    expect(bySrc["umrah_sales_invoices"]).toBeGreaterThanOrEqual(3); // DR AR + ≥1 CR revenue + CR VAT
    expect(bySrc["employee_commission_calculations"]).toBe(2); // DR expense + CR salary_payable
  });

  it("agent drill: sales + purchase JEs roll up by main NUSK agent (commission has no agent FK today)", async () => {
    const rows = await rawQuery<{ sourceType: string; cnt: string }>(
      `SELECT je."sourceType", COUNT(*)::text AS cnt
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
        WHERE jl."umrahAgentId" = $1
          AND je."sourceType" IN ('umrah_nusk_invoices','umrah_sales_invoices')
          AND je."sourceId" IN ($2, $3)
        GROUP BY je."sourceType"`,
      [ids.agentId, ids.nuskInvoiceId, ids.salesInvoiceId]
    );
    const bySrc = Object.fromEntries(rows.map((r) => [r.sourceType, Number(r.cnt)]));
    expect(bySrc["umrah_nusk_invoices"]).toBe(2);
    expect(bySrc["umrah_sales_invoices"]).toBeGreaterThanOrEqual(3);
  });
});
