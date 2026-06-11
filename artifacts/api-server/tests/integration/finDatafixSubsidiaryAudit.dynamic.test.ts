// #2090 / FIN-DATAFIX — validates the READ-ONLY subsidiary-parent audit
// (scripts/finance-audit/fin_datafix_subsidiary_parent_audit.sql) detects the
// historical "subsidiary account opened under the wrong control parent" rows
// (the pre-#2070 bug). The agent DB is clean (post-#2070), so to exercise the
// detector we seed synthetic suspects INSIDE a transaction that is ALWAYS
// rolled back — nothing is ever persisted, no real/production data is touched.
// This proves the report flags the wrong rows with the right columns and never
// flags a correctly-parented row. The audit itself is pure SELECT.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2; // SOCPA — control parents 1130 (AR), 1142 (custody) exist
const AUDIT_SQL = readFileSync(
  join(import.meta.dirname!, "../../../../scripts/finance-audit/fin_datafix_subsidiary_parent_audit.sql"),
  "utf8",
);

class Rollback extends Error {}

d("FIN-DATAFIX — read-only subsidiary-parent audit detects wrong-parent rows (live DB)", () => {
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;

  beforeAll(async () => {
    ({ withTransaction } = await import("../../src/lib/rawdb.js"));
  });

  /** Seed synthetic suspects, run the audit, return its rows — all inside a
   *  transaction that is then rolled back. Persists NOTHING. */
  async function auditWithFixture(): Promise<any[]> {
    let rows: any[] = [];
    await withTransaction(async (tx: any) => {
      // entities
      const cl = (await tx.query(`INSERT INTO clients ("companyId",name,type) VALUES ($1,'DATAFIX-client','individual') RETURNING id`, [COMPANY])).rows[0];
      const emp = (await tx.query(`INSERT INTO employees (name,email) VALUES ('DATAFIX-emp','datafix-emp@x.local') RETURNING id`)).rows[0];
      const cl2 = (await tx.query(`INSERT INTO clients ("companyId",name,type) VALUES ($1,'DATAFIX-client-ok','individual') RETURNING id`, [COMPANY])).rows[0];

      // helper: open a subsidiary leaf under a given parent code, link it
      async function openSub(entityType: string, entityId: number, accountType: string, parentCode: string, code: string, balance: number) {
        const parent = (await tx.query(`SELECT id, type FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2`, [COMPANY, parentCode])).rows[0];
        const acc = (await tx.query(
          `INSERT INTO chart_of_accounts ("companyId",code,name,type,"parentId",level,"allowPosting","currentBalance")
           VALUES ($1,$2,$3,(SELECT type FROM chart_of_accounts WHERE id=$4),$4,4,true,$5) RETURNING id`,
          [COMPANY, code, `DATAFIX ${accountType} ${entityId}`, parent.id, balance],
        )).rows[0];
        await tx.query(`INSERT INTO subsidiary_accounts ("companyId","entityType","entityId","accountType","accountId","isActive") VALUES ($1,$2,$3,$4,$5,true)`,
          [COMPANY, entityType, entityId, accountType, acc.id]);
        return acc.id;
      }

      // 1. WRONG: client receivable under cash 1111, WITH a balance + a posted line → high / needs_finance_review
      const badAccId = await openSub("client", cl.id, "receivable", "1111", "1111-9001", 250);
      const je = (await tx.query(
        `INSERT INTO journal_entries ("companyId","branchId",ref,description,"balancesApplied",status) VALUES ($1,2,'DATAFIX-je','x',true,'posted') RETURNING id`, [COMPANY])).rows[0];
      await tx.query(`INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,'1111-9001',250,0)`, [je.id]);

      // 2. WRONG: employee custody under clients 1131, zero balance, no lines → low / auto_fixable
      await openSub("employee", emp.id, "custody", "1131", "1131-9002", 0);

      // 3. CORRECT: client receivable under the real AR control 1130 → must NOT be flagged
      await openSub("client", cl2.id, "receivable", "1130", "1130-9003", 0);

      const res = await tx.query(AUDIT_SQL);
      rows = res.rows;
      throw new Rollback(); // never persist the fixture
    }).catch((e: any) => { if (!(e instanceof Rollback)) throw e; });
    return rows;
  }

  it("flags both wrong-parent rows and NOT the correctly-parented one", async () => {
    const rows = await auditWithFixture();
    const byAcc = new Map(rows.map((r) => [String(r.account).split(" — ")[0], r]));
    expect(byAcc.has("1111-9001"), "client receivable under cash must be flagged").toBe(true);
    expect(byAcc.has("1131-9002"), "employee custody under clients must be flagged").toBe(true);
    expect(byAcc.has("1130-9003"), "a correctly-parented receivable must NOT be flagged").toBe(false);
  });

  it("each suspect carries the proposed correct parent, reason, severity and disposition", async () => {
    const rows = await auditWithFixture();
    const bad = rows.find((r) => String(r.account).startsWith("1111-9001"));
    expect(bad).toBeTruthy();
    // proposed correct parent = the AR control 1130 (not the cash 1111 it sits under)
    expect(String(bad.proposed_correct_parent)).toMatch(/^1130 —/);
    expect(String(bad.current_parent)).toMatch(/^1111 —/);
    expect(String(bad.suspicion_reason)).toContain("receivable");
    // has a balance + posted line → high, needs finance review
    expect(Number(bad.current_balance)).toBe(250);
    expect(Number(bad.posted_lines)).toBe(1);
    expect(bad.severity).toBe("high");
    expect(bad.disposition).toBe("needs_finance_review");

    // the zero-balance custody one → low, auto-fixable
    const cust = rows.find((r) => String(r.account).startsWith("1131-9002"));
    expect(cust.proposed_correct_parent).toMatch(/^1142 —/);
    expect(cust.severity).toBe("low");
    expect(cust.disposition).toBe("auto_fixable");
  });

  it("the audit persists nothing — the synthetic suspects are gone after rollback", async () => {
    await auditWithFixture(); // ran + rolled back above
    const { rawQuery } = await import("../../src/lib/rawdb.js");
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM chart_of_accounts WHERE "companyId"=$1 AND code IN ('1111-9001','1131-9002','1130-9003')`, [COMPANY]);
    expect(n).toBe(0);
    const [{ m }] = await rawQuery<{ m: number }>(`SELECT count(*)::int m FROM clients WHERE name LIKE 'DATAFIX-%'`);
    expect(m).toBe(0);
  });
});
