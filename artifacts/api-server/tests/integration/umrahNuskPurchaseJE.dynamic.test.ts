// §6.2 of #1870 — INTEGRATION TEST for the NUSK purchase-side journal.
//
// Operator directive ("الشراء: مشتريات نسك (المورد = وزارة الحج عبر نسك)،
// مُبعّد بالوكيل الرئيسي في نسك"):
//
//   • Every NUSK invoice posts a balanced AP journal entry:
//       DR  Umrah cost   (5201 fallback)
//       CR  Umrah AP     (2101 fallback)
//
//   • Both lines carry the FULL cycle dimensions:
//       umrahAgentId   — the main NUSK agent (umrah_nusk_invoices.agentId)
//       umrahSeasonId  — resolved via the NUSK row's groupId → group.seasonId
//
//   • The AP credit line additionally carries vendorId = companies.nuskSupplierId
//     so the supplier sub-ledger ("ذمم المورد — وزارة الحج عبر نسك")
//     reconciles end-to-end. The cost debit stays vendor-less (it's the
//     company's own expense, not a vendor obligation).
//
// Skips cleanly when DATABASE_URL has no test marker.
//
//   bash scripts/provision-agent-db.sh
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test \
//     tests/integration/umrahNuskPurchaseJE.dynamic.test.ts

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

d("§6.2 — NUSK purchase JE: balanced + carries agent + season + vendor dimensions", () => {
  let rawQuery: any;
  let rawExecute: any;
  let withTransaction: any;
  let postNuskJournalEntries: any;
  const ids: {
    branchId?: number;
    userId?: number;
    seasonId?: number;
    agentId?: number;
    subAgentId?: number;
    clientId?: number;
    groupId?: number;
    nuskInvoiceId?: number;
    nuskSupplierId?: number;
    priorNuskSupplierId?: number | null;
  } = {};

  async function teardown() {
    if (!ids.nuskInvoiceId && !ids.agentId) return;
    try {
      if (ids.nuskInvoiceId) {
        await rawExecute(
          `DELETE FROM journal_lines WHERE "journalId" IN
             (SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1)`,
          [ids.nuskInvoiceId]
        );
        await rawExecute(
          `DELETE FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1`,
          [ids.nuskInvoiceId]
        );
        await rawExecute(`DELETE FROM umrah_nusk_invoices WHERE id = $1`, [ids.nuskInvoiceId]);
      }
      if (ids.groupId) await rawExecute(`DELETE FROM umrah_groups WHERE id = $1`, [ids.groupId]);
      if (ids.subAgentId) await rawExecute(`DELETE FROM umrah_sub_agents WHERE id = $1`, [ids.subAgentId]);
      if (ids.clientId) await rawExecute(`DELETE FROM clients WHERE id = $1`, [ids.clientId]);
      if (ids.agentId) await rawExecute(`DELETE FROM umrah_agents WHERE id = $1`, [ids.agentId]);
      if (ids.seasonId) await rawExecute(`DELETE FROM umrah_seasons WHERE id = $1`, [ids.seasonId]);
      // Restore the company's prior nuskSupplierId so other tests are unaffected.
      await rawExecute(
        `UPDATE companies SET "nuskSupplierId" = $2 WHERE id = $1`,
        [COMPANY_ID, ids.priorNuskSupplierId ?? null]
      );
      if (ids.nuskSupplierId) await rawExecute(`DELETE FROM suppliers WHERE id = $1`, [ids.nuskSupplierId]);
      // Test CoA codes — leave 5201 / 2101 alone if they pre-existed (they're
      // the fallback codes; could be real prod data). We only drop the
      // *-T suffixed test rows.
      await rawExecute(
        `DELETE FROM chart_of_accounts WHERE "companyId"=$1 AND code IN ('5201-T','2101-T') AND name LIKE '%TEST%'`,
        [COMPANY_ID]
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[nusk-purchase-test] teardown warning:", (e as Error).message);
    }
  }

  beforeAll(async () => {
    const db = await import("../../src/lib/rawdb.js");
    rawQuery = db.rawQuery;
    rawExecute = db.rawExecute;
    withTransaction = db.withTransaction;
    const importEngine = await import("../../src/lib/umrahImportEngine.js");
    postNuskJournalEntries = importEngine.postNuskJournalEntries;

    const [branch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`,
      [COMPANY_ID]
    );
    ids.branchId = branch.id;
    const [user] = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE email = 'owner@local.test' LIMIT 1`
    );
    ids.userId = user.id;

    // 1) CoA hooks the engine resolves: cost (5201 fallback) + AP (2101 fallback).
    //    The provisioned Al-Diyaa CoA uses different code shapes, so we add
    //    suffixed test rows + accounting_mappings so resolveByIntent picks them up.
    const ensureAccount = async (code: string, name: string, type: string) => {
      await rawExecute(
        `INSERT INTO chart_of_accounts ("companyId", code, name, type, "allowPosting", "isActive", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())
           ON CONFLICT ("companyId", code) DO UPDATE SET name = EXCLUDED.name`,
        [COMPANY_ID, code, name, type]
      );
    };
    await ensureAccount("5201-T", "تكلفة خدمات نسك (TEST)", "expense");
    await ensureAccount("2101-T", "ذمم المورد — وزارة الحج عبر نسك (TEST)", "liability");
    await rawExecute(
      `INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive")
         VALUES ($1, 'umrah_nusk_cost', 'Umrah NUSK cost', '5201-T', '2101-T', true)
       ON CONFLICT ("companyId", "operationType") DO UPDATE
         SET "debitAccountCode" = EXCLUDED."debitAccountCode",
             "creditAccountCode" = EXCLUDED."creditAccountCode"`,
      [COMPANY_ID]
    );

    // 2) Vendor — the NUSK supplier ("وزارة الحج عبر نسك"). Link via
    //    companies.nuskSupplierId, remembering the prior value so we can
    //    restore on teardown.
    const [supplier] = await rawQuery<{ id: number }>(
      `INSERT INTO suppliers ("companyId", name, status, category)
          VALUES ($1, 'وزارة الحج عبر نسك (TEST)', 'active', 'umrah')
          RETURNING id`,
      [COMPANY_ID]
    );
    ids.nuskSupplierId = supplier.id;
    const [companyCfg] = await rawQuery<{ nuskSupplierId: number | null }>(
      `SELECT "nuskSupplierId" FROM companies WHERE id = $1`,
      [COMPANY_ID]
    );
    ids.priorNuskSupplierId = companyCfg?.nuskSupplierId ?? null;
    await rawExecute(
      `UPDATE companies SET "nuskSupplierId" = $2 WHERE id = $1`,
      [COMPANY_ID, ids.nuskSupplierId]
    );

    // 3) Domain: season + agent + client + sub-agent + group. NO pilgrim,
    //    NO pricing — the purchase JE doesn't need them.
    const [season] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
          VALUES ($1, 'Season Test §6.2', '2026-01-01', '2026-12-31', 'open')
          RETURNING id`,
      [COMPANY_ID]
    );
    ids.seasonId = season.id;
    const [agent] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_agents ("companyId", name, status, currency, country)
          VALUES ($1, 'Main NUSK Agent Test §6.2', 'active', 'SAR', 'SA') RETURNING id`,
      [COMPANY_ID]
    );
    ids.agentId = agent.id;
    const [client] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name, type) VALUES ($1, 'Client Test §6.2', 'individual') RETURNING id`,
      [COMPANY_ID]
    );
    ids.clientId = client.id;
    const [subAgent] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_sub_agents ("companyId", "branchId", name, "agentId", "clientId", "nuskCode", "isActive")
          VALUES ($1, $2, 'SubAgent Test §6.2', $3, $4, 'TEST-SA-62', true)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.agentId, ids.clientId]
    );
    ids.subAgentId = subAgent.id;
    const [group] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_groups ("companyId", "branchId", "nuskGroupNumber", name, status,
                                  "mutamerCount", "subAgentId", "agentId", "seasonId")
          VALUES ($1, $2, 'TEST-GRP-62', 'Group Test §6.2', 'imported', 1, $3, $4, $5)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.subAgentId, ids.agentId, ids.seasonId]
    );
    ids.groupId = group.id;

    // 4) NUSK invoice row + JE in a single transaction (mirrors the
    //    /nusk-invoices route).
    await withTransaction(async (client: any) => {
      const res = await client.query(
        `INSERT INTO umrah_nusk_invoices ("companyId", "branchId", "nuskInvoiceNumber",
                                          "agentId", "subAgentId", "groupId", "mutamerCount",
                                          "groundServices", "electronicFees", "visaFees", "insuranceFees",
                                          "enrichmentServices", "additionalServices", "transportTotal",
                                          "hotelTotal", "refundAmount", "netCost", "totalAmount",
                                          "nuskStatus", "issueDate")
            VALUES ($1, $2, 'TEST-NUSK-62', $3, $4, $5, 1,
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
          nuskInvoiceNumber: "TEST-NUSK-62",
          totalAmount: 550,
          refundAmount: 0,
          nuskStatus: "issued",
          existingApJeId: null,
          existingRefundJeId: null,
        },
      );
    });
  });

  afterAll(async () => {
    await teardown();
  });

  it("posts a balanced AP journal entry: DR cost (550) = CR AP (550)", async () => {
    const [je] = await rawQuery<{ id: number; type: string }>(
      `SELECT id, type FROM journal_entries
        WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.nuskInvoiceId]
    );
    expect(je?.id).toBeTruthy();
    expect(je.type).toBe("purchase");

    const lines = await rawQuery<{
      "accountCode": string;
      debit: string;
      credit: string;
    }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );
    expect(lines.length).toBe(2);

    const totalDr = lines.reduce((acc, l) => acc + Number(l.debit), 0);
    const totalCr = lines.reduce((acc, l) => acc + Number(l.credit), 0);
    expect(totalDr).toBeCloseTo(550, 2);
    expect(totalCr).toBeCloseTo(550, 2);

    const drLine = lines.find((l) => Number(l.debit) > 0)!;
    const crLine = lines.find((l) => Number(l.credit) > 0)!;
    expect(drLine.accountCode).toBe("5201-T");
    expect(crLine.accountCode).toBe("2101-T");
  });

  it("every JE line carries the main NUSK agent (umrahAgentId) — drill-by-agent works on the purchase side", async () => {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1 ORDER BY id DESC LIMIT 1`,
      [ids.nuskInvoiceId]
    );
    const lines = await rawQuery<{ "umrahAgentId": number | null }>(
      `SELECT "umrahAgentId" FROM journal_lines WHERE "journalId" = $1`,
      [je.id]
    );
    expect(lines.length).toBe(2);
    for (const l of lines) {
      expect(l.umrahAgentId).toBe(ids.agentId);
    }
  });

  it("every JE line carries the season (umrahSeasonId) — resolved via groupId → group.seasonId", async () => {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1 ORDER BY id DESC LIMIT 1`,
      [ids.nuskInvoiceId]
    );
    const lines = await rawQuery<{ "umrahSeasonId": number | null }>(
      `SELECT "umrahSeasonId" FROM journal_lines WHERE "journalId" = $1`,
      [je.id]
    );
    expect(lines.length).toBe(2);
    for (const l of lines) {
      expect(l.umrahSeasonId).toBe(ids.seasonId);
    }
  });

  it("AP credit line carries vendorId = companies.nuskSupplierId — supplier sub-ledger reconciles", async () => {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1 ORDER BY id DESC LIMIT 1`,
      [ids.nuskInvoiceId]
    );
    const lines = await rawQuery<{
      "accountCode": string;
      debit: string;
      credit: string;
      "vendorId": number | null;
    }>(
      `SELECT "accountCode", debit, credit, "vendorId" FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );
    const crLine = lines.find((l) => Number(l.credit) > 0)!;
    const drLine = lines.find((l) => Number(l.debit) > 0)!;
    expect(crLine.vendorId).toBe(ids.nuskSupplierId);
    // Cost line stays vendor-less — it's the company's own expense, not a
    // vendor obligation. (Putting vendorId on the DR cost would double-count
    // the supplier on the trial-balance vendor drill.)
    expect(drLine.vendorId).toBeNull();
  });

  it("idempotency: re-running postNuskJournalEntries with existingApJeId set is a no-op (no duplicate JE)", async () => {
    const [jeBefore] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1 ORDER BY id DESC LIMIT 1`,
      [ids.nuskInvoiceId]
    );
    await withTransaction(async (client: any) => {
      await postNuskJournalEntries(
        client,
        { companyId: COMPANY_ID, branchId: ids.branchId!, userId: ids.userId!, seasonId: 0 },
        {
          nuskId: ids.nuskInvoiceId!,
          nuskInvoiceNumber: "TEST-NUSK-62",
          totalAmount: 550,
          refundAmount: 0,
          nuskStatus: "issued",
          existingApJeId: jeBefore.id, // ← signals "already posted"
          existingRefundJeId: null,
        },
      );
    });
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceType" = 'umrah_nusk_invoices' AND "sourceId" = $1`,
      [ids.nuskInvoiceId]
    );
    expect(jes.length).toBe(1);
  });
});
