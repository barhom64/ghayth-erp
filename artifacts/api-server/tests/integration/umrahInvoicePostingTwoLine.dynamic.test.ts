// §6 of #1870 — INTEGRATION TEST for the two-line umrah invoice posting.
//
// Asserts the engine's GL output against the operator's explicit rules:
//
//   • Invoice has TWO line items per group:
//       1) "رسوم تأشيرة" — exempt + pass-through at NUSK visa cost
//       2) "خدمة أرضية"  — everything else: transport + hotel + electronic
//          + services + insurance + the operator's margin. VAT on margin.
//
//   • VAT is computed on the MARGIN only (subtotal − costBasis × vatRate),
//     not on the full subtotal — KSA travel-agent margin scheme.
//
//   • Customer = the sub-agent's linked client (العميل = الوكيل) — the
//     AR debit lands on the agent dimension, not a phantom retail party.
//
//   • Journal entry is BALANCED (sum debits = sum credits = total) AND
//     contains exactly one VAT-output credit line for the margin VAT.
//
// Skips cleanly when DATABASE_URL has no test marker (matches the C27
// overstay test's gate). To run locally:
//
//   bash scripts/provision-agent-db.sh
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test \
//     tests/integration/umrahInvoicePostingTwoLine.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Use Al-Diyaa company (id=2) — seeded by provision-agent-db.sh with a
// full chart of accounts + open fiscal period + admin. We add only the
// missing pieces (VAT rate setting, three product mappings, CoA hooks
// for visa/services/AR/VAT) on top.
const COMPANY_ID = 2;

d("§6 — two-line umrah invoice posts a balanced JE with margin VAT", () => {
  let rawQuery: any;
  let rawExecute: any;
  let withTransaction: any;
  let generateSalesInvoice: any;
  const ids: {
    branchId?: number;
    userId?: number;
    seasonId?: number;
    agentId?: number;
    clientId?: number;
    subAgentId?: number;
    groupId?: number;
    pilgrimId?: number;
    nuskInvoiceId?: number;
    pricingId?: number;
    visaProductId?: number;
    servicesProductId?: number;
    transportProductId?: number;
    revenueAccountId?: number;
    arAccountId?: number;
    vatAccountId?: number;
    salesInvoiceId?: number;
  } = {};

  async function teardown() {
    if (!ids.salesInvoiceId && !ids.subAgentId) return;
    try {
      // Cascade-delete the JE if posted, then the invoice + ancestors.
      if (ids.salesInvoiceId) {
        await rawExecute(
          `DELETE FROM journal_lines WHERE "journalId" IN
             (SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1)`,
          [ids.salesInvoiceId]
        );
        await rawExecute(
          `DELETE FROM journal_entries WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1`,
          [ids.salesInvoiceId]
        );
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
      // Reset companies.umrah*ProductId so other tests / runs aren't affected.
      await rawExecute(
        `UPDATE companies SET "umrahVisaProductId"=NULL, "umrahServicesProductId"=NULL, "umrahTransportProductId"=NULL WHERE id = $1`,
        [COMPANY_ID]
      );
      if (ids.visaProductId) await rawExecute(`DELETE FROM products WHERE id = $1`, [ids.visaProductId]);
      if (ids.servicesProductId) await rawExecute(`DELETE FROM products WHERE id = $1`, [ids.servicesProductId]);
      if (ids.transportProductId) await rawExecute(`DELETE FROM products WHERE id = $1`, [ids.transportProductId]);
      // Remove our injected CoA hooks (idempotent — drop the matching codes).
      await rawExecute(
        `DELETE FROM chart_of_accounts WHERE "companyId"=$1 AND code IN ('1200-T','4200-T','2300-T') AND name LIKE '%TEST%'`,
        [COMPANY_ID]
      );
      // Remove our VAT-rate + VAT-mode settings if we created them.
      await rawExecute(
        `DELETE FROM system_settings
           WHERE "companyId"=$1
             AND "branchId" IS NULL
             AND key IN ('umrah_vat_rate', 'umrah_vat_mode')`,
        [COMPANY_ID]
      );
    } catch (e) {
      // Best-effort cleanup — test should not fail on teardown noise.
      // eslint-disable-next-line no-console
      console.warn("[two-line-test] teardown warning:", (e as Error).message);
    }
  }

  beforeAll(async () => {
    const db = await import("../../src/lib/rawdb.js");
    rawQuery = db.rawQuery;
    rawExecute = db.rawExecute;
    withTransaction = db.withTransaction;
    const engine = await import("../../src/lib/umrahInvoicingEngine.js");
    generateSalesInvoice = engine.generateSalesInvoice;

    // Look up an existing branch + admin user on Al-Diyaa for the scope.
    const [branch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`,
      [COMPANY_ID]
    );
    ids.branchId = branch.id;
    const [user] = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE email = 'owner@local.test' LIMIT 1`
    );
    ids.userId = user.id;

    // 1) VAT settings — 15% standard rate + INCLUSIVE mode (extracted).
    // Operator directive: «الضريبة مستخرَجة من الهامش الشامل (× 15/115)،
    // وقابلة للتعديل من الإعدادات». Unique on (companyId, branchId, key)
    // but NULL branchId breaks ON CONFLICT — delete-then-insert keeps the
    // setup deterministic without an unrelated partial-index hack.
    await rawExecute(
      `DELETE FROM system_settings
         WHERE "companyId"=$1 AND "branchId" IS NULL
           AND key IN ('umrah_vat_rate', 'umrah_vat_mode')`,
      [COMPANY_ID]
    );
    await rawExecute(
      `INSERT INTO system_settings ("companyId", "branchId", key, value, "createdAt", "updatedAt")
         VALUES ($1, NULL, 'umrah_vat_rate', '15', NOW(), NOW()),
                ($1, NULL, 'umrah_vat_mode', 'inclusive', NOW(), NOW())`,
      [COMPANY_ID]
    );

    // 1b) Numbering scheme for umrah_sales_invoice — required by issueNumber().
    await rawExecute(
      `INSERT INTO numbering_schemes ("companyId", "moduleKey", "entityKey", "displayNameAr", prefix)
         VALUES ($1, 'umrah', 'umrah_sales_invoice', 'فاتورة عمرة (TEST)', 'TEST-UI')
       ON CONFLICT ("companyId", "moduleKey", "entityKey") DO NOTHING`,
      [COMPANY_ID]
    );

    // 2) Three CoA hooks the engine resolves: AR (1200 fallback) + revenue
    //    (4200 fallback) + VAT output (2300 fallback). The provisioned
    //    Al-Diyaa CoA uses different code shapes, so we add suffixed
    //    test rows the engine's `resolveByIntent` will pick up via the
    //    fallback search.
    const ensureAccount = async (code: string, name: string, type: string) => {
      await rawExecute(
        `INSERT INTO chart_of_accounts ("companyId", code, name, type, "allowPosting", "isActive", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())
           ON CONFLICT ("companyId", code) DO UPDATE SET name = EXCLUDED.name`,
        [COMPANY_ID, code, name, type]
      );
    };
    await ensureAccount("1200-T", "ذمم العمرة (TEST)", "asset");
    await ensureAccount("4200-T", "إيرادات العمرة (TEST)", "revenue");
    await ensureAccount("2300-T", "ضريبة القيمة المضافة المستحقة (TEST)", "liability");

    const [rev] = await rawQuery<{ id: number }>(
      `SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code='4200-T' LIMIT 1`,
      [COMPANY_ID]
    );
    ids.revenueAccountId = rev.id;
    // Map accountUsage so resolveByIntent picks these up as the canonical
    // umrah_invoice_revenue / umrah_invoice_ar / vat_output targets.
    await rawExecute(
      `INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive")
         VALUES
           ($1, 'umrah_invoice_ar', 'AR — umrah', '1200-T', NULL, true),
           ($1, 'umrah_invoice_revenue', 'Revenue — umrah', NULL, '4200-T', true),
           ($1, 'vat_output', 'VAT output', NULL, '2300-T', true)
         ON CONFLICT ("companyId", "operationType") DO UPDATE
           SET "debitAccountCode" = EXCLUDED."debitAccountCode",
               "creditAccountCode" = EXCLUDED."creditAccountCode"`,
      [COMPANY_ID]
    );

    // 3) Three umrah products + the companies.umrah* hooks so the engine's
    //    canSplit gate fires.
    const insertProduct = async (name: string, taxCode: string) => {
      const [row] = await rawQuery<{ id: number }>(
        `INSERT INTO products ("companyId", name, "defaultTaxCode", "defaultRevenueAccountId", "itemType", "createdAt")
            VALUES ($1, $2, $3, $4, 'service', NOW())
            RETURNING id`,
        [COMPANY_ID, name, taxCode, ids.revenueAccountId]
      );
      return row.id;
    };
    ids.visaProductId = await insertProduct("Umrah Visa (TEST)", "zero");
    ids.servicesProductId = await insertProduct("Umrah Ground Service (TEST)", "standard");
    ids.transportProductId = await insertProduct("Umrah Transport (TEST)", "standard");
    await rawExecute(
      `UPDATE companies
          SET "umrahVisaProductId"=$2,
              "umrahServicesProductId"=$3,
              "umrahTransportProductId"=$4
        WHERE id=$1`,
      [COMPANY_ID, ids.visaProductId, ids.servicesProductId, ids.transportProductId]
    );

    // 4) Domain: season + agent + client + sub-agent + group + pilgrim +
    //    pricing + NUSK invoice.
    const [season] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
          VALUES ($1, 'Season Test §6', '2026-01-01', '2026-12-31', 'open')
          RETURNING id`,
      [COMPANY_ID]
    );
    ids.seasonId = season.id;
    const [agent] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_agents ("companyId", name, status, currency, country)
          VALUES ($1, 'Agent Test §6', 'active', 'SAR', 'SA') RETURNING id`,
      [COMPANY_ID]
    );
    ids.agentId = agent.id;
    const [client] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name, type) VALUES ($1, 'Client Test §6', 'individual') RETURNING id`,
      [COMPANY_ID]
    );
    ids.clientId = client.id;
    const [subAgent] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_sub_agents ("companyId", "branchId", name, "agentId", "clientId", "nuskCode", "isActive")
          VALUES ($1, $2, 'SubAgent Test §6', $3, $4, 'TEST-SA-001', true)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.agentId, ids.clientId]
    );
    ids.subAgentId = subAgent.id;
    const [group] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_groups ("companyId", "branchId", "nuskGroupNumber", name, status,
                                  "mutamerCount", "subAgentId", "agentId", "seasonId")
          VALUES ($1, $2, 'TEST-GRP-001', 'Group Test §6', 'imported', 1, $3, $4, $5)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    ids.groupId = group.id;
    const [pilgrim] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_pilgrims ("companyId", "branchId", "groupId", "subAgentId", "agentId", "seasonId",
                                    "passportNumber", "fullName", "arrivalDate", status)
          VALUES ($1, $2, $3, $4, $5, $6, 'TEST-PP-001', 'Test Pilgrim', '2026-03-01', 'pending')
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.groupId, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    ids.pilgrimId = pilgrim.id;
    const [pricing] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_pricing ("companyId", "subAgentId", "pricePerMutamer", "validFrom", "validTo")
          VALUES ($1, $2, 1000, '2026-01-01', '2026-12-31')
          RETURNING id`,
      [COMPANY_ID, ids.subAgentId]
    );
    ids.pricingId = pricing.id;
    // NUSK costs: visa=300, transport=100, hotel=50, electronic=20, services=50, insurance=20, additional=10, refund=0
    // totalAmount = 550, but cost_basis math uses totalAmount column directly.
    // Cost basis = 550, sale = 1000, margin = 450, vat = 450 × 15% = 67.50
    // Visa line = 300 (pass-through, zero-rated)
    // Ground service line = 1000 − 300 = 700 (standard rate; vat on margin not line)
    const [nuskInv] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_nusk_invoices ("companyId", "branchId", "nuskInvoiceNumber",
                                          "agentId", "subAgentId", "groupId", "mutamerCount",
                                          "groundServices", "electronicFees", "visaFees", "insuranceFees",
                                          "enrichmentServices", "additionalServices", "transportTotal",
                                          "hotelTotal", "refundAmount", "netCost", "totalAmount",
                                          "nuskStatus", "issueDate")
          VALUES ($1, $2, 'TEST-NUSK-001', $3, $4, $5, 1,
                  50, 20, 300, 20, 0, 10, 100, 50, 0, 550, 550, 'issued', NOW())
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.agentId, ids.subAgentId, ids.groupId]
    );
    ids.nuskInvoiceId = nuskInv.id;
  });

  afterAll(async () => {
    await teardown();
  });

  it("emits exactly TWO sales-invoice-items per group: 'رسوم تأشيرة' + 'خدمة أرضية'", async () => {
    expect(ids.subAgentId).toBeTruthy();
    expect(ids.groupId).toBeTruthy();

    // Generate the sales invoice through the real engine.
    const scope = { companyId: COMPANY_ID, branchId: ids.branchId!, userId: ids.userId! };
    const result = await generateSalesInvoice(scope, {
      subAgentId: ids.subAgentId,
      groupIds: [ids.groupId!],
      seasonId: ids.seasonId,
    });
    ids.salesInvoiceId = result.invoiceId;

    // Line items: should be exactly 2.
    const items = await rawQuery<{
      itemType: string;
      description: string;
      quantity: number;
      lineTotal: string;
      vatRate: string | null;
    }>(
      `SELECT "itemType", description, quantity, "lineTotal", "vatRate"
         FROM umrah_sales_invoice_items
        WHERE "invoiceId" = $1
        ORDER BY id`,
      [result.invoiceId]
    );
    expect(items.length).toBe(2);
    expect(items[0].description).toMatch(/رسوم تأشيرة عمرة/);
    expect(items[1].description).toMatch(/خدمة أرضية/);
    expect(Number(items[0].lineTotal)).toBe(300);
    expect(Number(items[1].lineTotal)).toBe(700);
  });

  it("visa line is zero-rated (pass-through); ground-service line carries the standard rate", async () => {
    const items = await rawQuery<{ description: string; vatRate: string | null }>(
      `SELECT description, "vatRate" FROM umrah_sales_invoice_items WHERE "invoiceId"=$1 ORDER BY id`,
      [ids.salesInvoiceId]
    );
    // Visa product was created with defaultTaxCode='zero' → engine maps to vatRate=0.
    expect(Number(items[0].vatRate ?? "0")).toBe(0);
    // Ground-service product is 'standard' → engine resolves to the
    // header default (15), surfaced per-line for ZATCA. NULL also OK
    // when engine falls back to header rate.
    const groundRate = items[1].vatRate == null ? 15 : Number(items[1].vatRate);
    expect(groundRate).toBe(15);
  });

  it("header VAT is EXTRACTED from the margin (inclusive mode): vatAmount = margin × 15/115; total = subtotal (no add)", async () => {
    const [inv] = await rawQuery<{
      subtotal: string;
      "costBasis": string;
      "marginBase": string;
      "vatRate": string;
      "vatAmount": string;
      total: string;
    }>(
      `SELECT subtotal, "costBasis", "marginBase", "vatRate", "vatAmount", total
         FROM umrah_sales_invoices WHERE id = $1`,
      [ids.salesInvoiceId]
    );
    // Operator-confirmed rule («الفرق شامل الضريبة»):
    //   subtotal  = 1000  (visa 300 + ground service 700)
    //   costBasis = 550   (NUSK total — visa 300 + transport 100 + hotel 50
    //                       + electronic 20 + services 50 + insurance 20
    //                       + additional 10)
    //   marginBase = 450  (sale − cost)
    //   vatAmount = 450 × 15/115 = 58.6957 → roundTo2 = 58.70  (EXTRACTED)
    //   total      = subtotal = 1000  (VAT is inside; nothing added)
    expect(Number(inv.subtotal)).toBe(1000);
    expect(Number(inv.costBasis)).toBe(550);
    expect(Number(inv.marginBase)).toBe(450);
    expect(Number(inv.vatRate)).toBe(15);
    expect(Number(inv.vatAmount)).toBe(58.70);
    expect(Number(inv.total)).toBe(1000);
  });

  it("posts a balanced journal entry: DR AR (subtotal) = CR revenue (subtotal − vatAmount) + CR VAT (vatAmount)", async () => {
    // JE linkage is via journal_entries.sourceType/sourceId (the
    // umrah_sales_invoices.journalEntryId back-link isn't part of the
    // generate path — it's the post-cutover linkage we're adding next).
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries
        WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.salesInvoiceId]
    );
    expect(je?.id).toBeTruthy();

    const lines = await rawQuery<{
      "accountCode": string;
      debit: string;
      credit: string;
      description: string;
      "umrahAgentId": number | null;
      "umrahSeasonId": number | null;
      "clientId": number | null;
    }>(
      `SELECT "accountCode", debit, credit, description, "umrahAgentId", "umrahSeasonId", "clientId"
         FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );

    // Totals: balanced + equal to invoice total = subtotal (inclusive mode).
    const totalDr = lines.reduce((acc, l) => acc + Number(l.debit), 0);
    const totalCr = lines.reduce((acc, l) => acc + Number(l.credit), 0);
    expect(totalDr).toBeCloseTo(1000, 2);
    expect(totalCr).toBeCloseTo(1000, 2);

    // Structure: one AR debit line of 1000 + revenue credits summing to
    // 941.30 (1000 − 58.70) + one VAT-output credit of 58.70.
    const drLines = lines.filter((l) => Number(l.debit) > 0);
    const crLines = lines.filter((l) => Number(l.credit) > 0);
    expect(drLines.length).toBe(1);
    expect(Number(drLines[0].debit)).toBeCloseTo(1000, 2);

    const vatLine = lines.find((l) => Number(l.credit) === 58.70);
    expect(vatLine).toBeTruthy();
    expect(vatLine!.accountCode).toBe("2300-T");

    // Revenue credit(s) sum to subtotal − vatAmount = 1000 − 58.70 = 941.30
    // (the standard-rated ground-service bucket absorbed the VAT extraction;
    // visa stays at its pass-through lineTotal of 300).
    const revenueCredit = crLines
      .filter((l) => l.accountCode === "4200-T")
      .reduce((acc, l) => acc + Number(l.credit), 0);
    expect(revenueCredit).toBeCloseTo(941.30, 2);
  });

  it("every JE line carries client + agent + season dimensions (الوكيل العميل + الموسم — drill-by-customer works)", async () => {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries
        WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.salesInvoiceId]
    );
    const lines = await rawQuery<{
      "umrahAgentId": number | null;
      "umrahSeasonId": number | null;
      "clientId": number | null;
    }>(
      `SELECT "umrahAgentId", "umrahSeasonId", "clientId" FROM journal_lines WHERE "journalId" = $1`,
      [je.id]
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.umrahAgentId).toBe(ids.agentId);
      expect(l.umrahSeasonId).toBe(ids.seasonId);
      // Operator directive §6: every sales-side line must carry the
      // sub-agent's linked client (= العميل) so the ledger can be
      // sliced by who owes us.
      expect(l.clientId).toBe(ids.clientId);
    }
  });

  it("VAT mode is operator-configurable: flipping to 'exclusive' adds VAT on top instead of extracting", async () => {
    // Operator directive: «قابلة للتعديل من الإعدادات». Seed a SECOND
    // group + pilgrim + NUSK invoice (the engine refuses to re-invoice
    // a group), flip the mode setting, and confirm the math flips too.
    const [group2] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_groups ("companyId", "branchId", "nuskGroupNumber", name, status,
                                  "mutamerCount", "subAgentId", "agentId", "seasonId")
          VALUES ($1, $2, 'TEST-GRP-002', 'Group Test §6 (mode)', 'imported', 1, $3, $4, $5)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    const [pilgrim2] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_pilgrims ("companyId", "branchId", "groupId", "subAgentId", "agentId", "seasonId",
                                    "passportNumber", "fullName", "arrivalDate", status)
          VALUES ($1, $2, $3, $4, $5, $6, 'TEST-PP-002', 'Test Pilgrim 2', '2026-03-01', 'pending')
          RETURNING id`,
      [COMPANY_ID, ids.branchId, group2.id, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    const [nuskInv2] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_nusk_invoices ("companyId", "branchId", "nuskInvoiceNumber",
                                          "agentId", "subAgentId", "groupId", "mutamerCount",
                                          "groundServices", "electronicFees", "visaFees", "insuranceFees",
                                          "enrichmentServices", "additionalServices", "transportTotal",
                                          "hotelTotal", "refundAmount", "netCost", "totalAmount",
                                          "nuskStatus", "issueDate")
          VALUES ($1, $2, 'TEST-NUSK-002', $3, $4, $5, 1,
                  50, 20, 300, 20, 0, 10, 100, 50, 0, 550, 550, 'issued', NOW())
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.agentId, ids.subAgentId, group2.id]
    );
    await rawExecute(
      `UPDATE system_settings SET value = 'exclusive', "updatedAt" = NOW()
        WHERE "companyId" = $1 AND "branchId" IS NULL AND key = 'umrah_vat_mode'`,
      [COMPANY_ID]
    );

    const scope = { companyId: COMPANY_ID, branchId: ids.branchId!, userId: ids.userId! };
    const result = await generateSalesInvoice(scope, {
      subAgentId: ids.subAgentId,
      groupIds: [group2.id],
      seasonId: ids.seasonId,
    });
    const [inv] = await rawQuery<{ subtotal: string; vatAmount: string; total: string }>(
      `SELECT subtotal, "vatAmount", total FROM umrah_sales_invoices WHERE id = $1`,
      [result.invoiceId]
    );
    // Exclusive math: vatAmount = 450 × 15/100 = 67.50; total = subtotal + vatAmount = 1067.50.
    expect(Number(inv.subtotal)).toBe(1000);
    expect(Number(inv.vatAmount)).toBe(67.5);
    expect(Number(inv.total)).toBe(1067.5);

    // Teardown — clean the extra rows so the main teardown stays simple.
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1)`,
      [result.invoiceId]
    );
    await rawExecute(
      `DELETE FROM journal_entries WHERE "sourceType" = 'umrah_sales_invoices' AND "sourceId" = $1`,
      [result.invoiceId]
    );
    await rawExecute(`DELETE FROM umrah_sales_invoice_items WHERE "invoiceId" = $1`, [result.invoiceId]);
    await rawExecute(`DELETE FROM umrah_sales_invoices WHERE id = $1`, [result.invoiceId]);
    await rawExecute(`DELETE FROM umrah_nusk_invoices WHERE id = $1`, [nuskInv2.id]);
    await rawExecute(`DELETE FROM umrah_pilgrims WHERE id = $1`, [pilgrim2.id]);
    await rawExecute(`DELETE FROM umrah_groups WHERE id = $1`, [group2.id]);
  });
});
