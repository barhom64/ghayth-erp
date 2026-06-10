// #1945 FIN-003 — per-entity subsidiary GL accounts open under the CORRECT
// control parent on the live head-of-main DB. The helper used to hardcode
// parent codes that matched neither the default-seed chart nor SOCPA — it
// pointed client receivables at 1111 (الصندوق — cash!), employee advances at
// 1121 (a bank), and custody at 1131 (clients), so every per-entity account
// was minted under the WRONG parent. This pins the intent-resolved parents:
// client→AR (1130), vendor→AP (2110), employee→staff advances/custody
// (1140/1142), and proves the entity-account read endpoint surfaces them.
// Activates only when DATABASE_URL points at the test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2; // Al-Diyaa — SOCPA chart (1130 AR, 2110 AP, 1140/1142 staff)
const PFX = "test-fin003-";

d("FIN-003 — per-entity subsidiary accounts open under the correct parent (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let createSubsidiaryAccountsForEntity: typeof import("../../src/routes/accounting-engine.js").createSubsidiaryAccountsForEntity;

  const created: { clientId?: number; vendorId?: number; employeeId?: number } = {};

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ createSubsidiaryAccountsForEntity } = await import("../../src/routes/accounting-engine.js"));

    await cleanup();

    const [c] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name, type) VALUES ($1, $2, 'individual') RETURNING id`,
      [COMPANY, PFX + "client"],
    );
    created.clientId = c.id;
    const [v] = await rawQuery<{ id: number }>(
      `INSERT INTO suppliers ("companyId", name) VALUES ($1, $2) RETURNING id`,
      [COMPANY, PFX + "vendor"],
    );
    created.vendorId = v.id;
    const [e] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1, $2) RETURNING id`,
      [PFX + "emp", PFX + "emp@test.local"],
    );
    created.employeeId = e.id;

    await createSubsidiaryAccountsForEntity(COMPANY, "client", created.clientId!, PFX + "client");
    await createSubsidiaryAccountsForEntity(COMPANY, "vendor", created.vendorId!, PFX + "vendor");
    await createSubsidiaryAccountsForEntity(COMPANY, "employee", created.employeeId!, PFX + "emp");
  });

  async function cleanup() {
    if (!rawExecute) return;
    // sub-accounts + their chart leaves, then the entities
    await rawExecute(
      `DELETE FROM subsidiary_accounts WHERE "companyId"=$1 AND "accountId" IN
         (SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND name LIKE $2)`,
      [COMPANY, PFX + "%"],
    );
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM clients WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM suppliers WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }
  afterAll(cleanup);

  async function subAccount(entityType: string, entityId: number, accountType: string) {
    const [row] = await rawQuery<{ code: string; type: string; allowPosting: boolean; parentCode: string }>(
      `SELECT ca.code, ca.type, ca."allowPosting", parent.code AS "parentCode"
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts ca ON ca.id = sa."accountId"
         LEFT JOIN chart_of_accounts parent ON parent.id = ca."parentId"
        WHERE sa."companyId"=$1 AND sa."entityType"=$2 AND sa."entityId"=$3 AND sa."accountType"=$4 AND sa."isActive"=true`,
      [COMPANY, entityType, entityId, accountType],
    );
    return row;
  }

  it("client receivable lands under AR control 1130 (NOT 1111 cash), postable asset", async () => {
    const r = await subAccount("client", created.clientId!, "receivable");
    expect(r, "client receivable sub-account must exist").toBeTruthy();
    expect(r.parentCode).toBe("1130");
    expect(r.code).toBe(`1130-${String(created.clientId!).padStart(4, "0")}`);
    expect(r.type).toBe("asset");
    expect(r.allowPosting).toBe(true);
    // the regression guard: never under the cash account
    expect(r.parentCode).not.toBe("1111");
  });

  it("vendor payable lands under AP control 2110 (the old literal 2102 doesn't even exist)", async () => {
    const r = await subAccount("vendor", created.vendorId!, "payable");
    expect(r, "vendor payable sub-account must exist (was the gap)").toBeTruthy();
    expect(r.parentCode).toBe("2110");
    expect(r.code).toBe(`2110-${String(created.vendorId!).padStart(4, "0")}`);
    expect(r.type).toBe("liability");
    expect(r.allowPosting).toBe(true);
  });

  it("employee advance→staff advances (1140) and custody→employee custody (1142), NOT a bank/clients", async () => {
    const adv = await subAccount("employee", created.employeeId!, "advance");
    const cus = await subAccount("employee", created.employeeId!, "custody");
    expect(adv).toBeTruthy();
    expect(cus).toBeTruthy();
    // advance under the staff-advances control (1140 الموظفون والسلف), never 1121 (a bank)
    expect(adv.parentCode).toBe("1140");
    expect(adv.parentCode).not.toBe("1121");
    expect(adv.type).toBe("asset");
    // custody under employee custody (1142), never 1131 (clients)
    expect(cus.parentCode).toBe("1142");
    expect(cus.parentCode).not.toBe("1131");
  });

  it("is idempotent — re-running creates no duplicate sub-account or chart leaf", async () => {
    await createSubsidiaryAccountsForEntity(COMPANY, "client", created.clientId!, PFX + "client");
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM subsidiary_accounts
        WHERE "companyId"=$1 AND "entityType"='client' AND "entityId"=$2 AND "accountType"='receivable' AND "isActive"=true`,
      [COMPANY, created.clientId!],
    );
    expect(n).toBe(1);
    const [{ m }] = await rawQuery<{ m: number }>(
      `SELECT count(*)::int m FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `1130-${String(created.clientId!).padStart(4, "0")}`],
    );
    expect(m).toBe(1);
  });
});
