import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * النقد في الطريق (#2714) — اختبار ثابت — لا DB. يمسّ الدفتر لكن يعيد استخدام
 * postJournalEntry القائم. يؤكّد بنية القيدين (طور الإرسال/الوصول) + التوازن +
 * idempotency + حُرّاس الحالة + تحقق الحسابات + هجرة 396.
 */
const API_SRC = join(import.meta.dirname!, "../../src");
const ROUTE = readFileSync(join(API_SRC, "routes/finance-cash-in-transit.ts"), "utf8");
const INDEX = readFileSync(join(API_SRC, "routes/index.ts"), "utf8");

const sendHandler = (() => {
  const m = ROUTE.match(/\.post\("\/cash-in-transit",[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /cash-in-transit not found");
  return m[0];
})();
const confirmHandler = (() => {
  const m = ROUTE.match(/\.post\("\/cash-in-transit\/:id\/confirm"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /cash-in-transit/:id/confirm not found");
  return m[0];
})();

describe("cash-in-transit — migration 396", () => {
  it("creates the tracking table (scoped, soft-delete, status, rollback)", () => {
    const p = join(API_SRC, "migrations/396_cash_in_transit.sql");
    expect(existsSync(p)).toBe(true);
    const sql = readFileSync(p, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS cash_in_transit_transfers/);
    expect(sql).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/status\s+TEXT NOT NULL DEFAULT 'in_transit'/);
    expect(sql).toMatch(/@rollback: DROP TABLE IF EXISTS cash_in_transit_transfers;/);
  });
});

describe("cash-in-transit — phase 1 (send): DR clearing / CR source, balanced", () => {
  it("validates all three accounts are postable money accounts", () => {
    expect(sendHandler).toMatch(/assertPostableMoneyAccount\(scope\.companyId, b\.sourceAccountCode/);
    expect(sendHandler).toMatch(/assertPostableMoneyAccount\(scope\.companyId, b\.destinationAccountCode/);
    expect(sendHandler).toMatch(/assertPostableMoneyAccount\(scope\.companyId, b\.clearingAccountCode/);
    expect(sendHandler).toMatch(/sourceAccountCode === b\.destinationAccountCode/); // no self-transfer
    // F2: clearing must differ from BOTH source and destination, else one leg is a wash.
    expect(sendHandler).toMatch(/b\.clearingAccountCode === b\.sourceAccountCode \|\| b\.clearingAccountCode === b\.destinationAccountCode/);
  });
  it("posts a balanced JE via the existing engine (clearing debit = source credit)", () => {
    expect(sendHandler).toMatch(/financialEngine\.postJournalEntry\(/);
    expect(sendHandler).toMatch(/accountCode: b\.clearingAccountCode, debit: amount, credit: 0/);
    expect(sendHandler).toMatch(/accountCode: b\.sourceAccountCode, debit: 0, credit: amount/);
    expect(sendHandler).toMatch(/sourceType: "cash_in_transit_send"/);
  });
  it("is idempotent on a stable transferKey", () => {
    expect(sendHandler).toMatch(/sourceKey = `finance:cash_in_transit:send:\$\{scope\.companyId\}:\$\{transferKey\}`/);
  });
});

describe("cash-in-transit — phase 2 (confirm): DR destination / CR clearing, balanced", () => {
  it("only an in_transit transfer can be confirmed (state guard, both at read and write)", () => {
    expect(confirmHandler).toMatch(/if \(t\.status !== "in_transit"\) throw new ConflictError/);
    expect(confirmHandler).toMatch(/UPDATE cash_in_transit_transfers SET status='arrived'[\s\S]*AND status='in_transit'/);
    expect(confirmHandler).toMatch(/if \(!affectedRows\) throw new ConflictError/);
  });
  it("posts the mirror balanced JE (destination debit = clearing credit)", () => {
    expect(confirmHandler).toMatch(/accountCode: t\.destinationAccountCode, debit: amount, credit: 0/);
    expect(confirmHandler).toMatch(/accountCode: t\.clearingAccountCode, debit: 0, credit: amount/);
    expect(confirmHandler).toMatch(/sourceType: "cash_in_transit_arrive"/);
    expect(confirmHandler).toMatch(/sourceKey = `finance:cash_in_transit:arrive:\$\{scope\.companyId\}:\$\{id\}`/);
  });
  it("carries Audit/Event on both phases", () => {
    expect(sendHandler).toMatch(/action: "cash_in_transit\.sent"/);
    expect(confirmHandler).toMatch(/action: "cash_in_transit\.arrived"/);
  });
});

describe("cash-in-transit — wired into the finance router", () => {
  it("registered under /finance with finance module + financial guards", () => {
    expect(INDEX).toMatch(/import \{ cashInTransitRouter \} from "\.\/finance-cash-in-transit\.js";/);
    expect(INDEX).toMatch(/router\.use\("\/finance", requireModule\("finance"\), requireGuards\("financial"\), cashInTransitRouter\)/);
  });
});
