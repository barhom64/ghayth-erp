/**
 * تعزيز عزل المستأجر (دفاع بالعمق، مادة 13) — كتابات كانت تُحدِّث/تحذف بالـ id فقط،
 * رغم تحقّق ملكية مسبق (SELECT بـ companyId + 404). أُضيف companyId (و userId) إلى
 * شرط الكتابة نفسه ليبقى النطاق مضمونًا حتى لو أُزيل الفحص المسبق لاحقًا. لا تغيير
 * وظيفي (الصف مُتحقَّق ملكيته أصلًا). اختبار ثابت يمنع الانحدار.
 *
 * ملاحظة: communications.ts /pbx/status (webhook موقَّع بمفتاح PBX، يعمل بمفتاح
 * callId الفريد) ليس فجوة عزل — لا companyId لديه ولا يحتاجه؛ تُرك عمدًا.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const WH = readFileSync(join(API_SRC, "routes/warehouse-advanced.ts"), "utf8");
const INBOX = readFileSync(join(API_SRC, "routes/inbox.ts"), "utf8");

describe("tenant-scope defense — warehouse lot QC writes", () => {
  it("QC reject UPDATE is scoped by companyId", () => {
    expect(WH).toMatch(/UPDATE warehouse_stock_lots SET "qualityControlStatus"='rejected'[^`]*WHERE id=\$1 AND "companyId"=\$2/);
  });
  it("QC approve UPDATE is scoped by companyId", () => {
    expect(WH).toMatch(/UPDATE warehouse_stock_lots SET "qualityControlStatus"='approved'[^`]*WHERE id=\$1 AND "companyId"=\$2/);
  });
  it("no QC UPDATE keyed by id alone remains", () => {
    expect(/UPDATE warehouse_stock_lots SET "qualityControlStatus"='[a-z]+'[^`]*WHERE id=\$1`/.test(WH)).toBe(false);
  });
});

describe("tenant-scope defense — inbox draft delete", () => {
  it("email_drafts DELETE is scoped by companyId + userId", () => {
    expect(INBOX).toMatch(/DELETE FROM email_drafts WHERE id = \$1 AND "companyId" = \$2 AND "userId" = \$3/);
  });
  it("no email_drafts DELETE keyed by id alone remains", () => {
    expect(/DELETE FROM email_drafts WHERE id = \$1`/.test(INBOX)).toBe(false);
  });
});
