/**
 * حدّ معماري (#2838) — الاتصالات (خادم) لا تنشئ تذاكر دعم/فرص CRM بقرار ذاتي.
 *
 * الدستور (مواد 4–9): الاتصالات «خادم قيد وتوثيق وتحويل» لا يقرر بدل المسار
 * القائد. كان مُعالج WhatsApp يصنّف الوارد بالذكاء الاصطناعي ثم **يكتب مباشرة**
 * في support_tickets (status='open',priority) وcrm_opportunities (stage='lead')
 * — أي يتّخذ قرار الإنشاء وسياسة الحالة المملوكَين للدعم/CRM.
 *
 * الإصلاح: نقل الإنشاء + سياسة الحالة إلى عقد يملكه المسار القائد:
 *   • support.createTicketFromInboundComm  (status='open' داخل مسار الدعم)
 *   • crm.createOpportunityFromInboundComm (stage='lead' داخل مسار CRM)
 * والاتصالات تستدعيه فقط (تحتفظ بالتصنيف/التحويل وربط message_log).
 *
 * يثبّت هذا الراتشيت:
 *   1. المُعالج التلقائي في communications لم يعد يكتب crm_opportunities مباشرة.
 *   2. يمرّر عبر العقدين القائدين (لا INSERT ذاتي للفرصة).
 *   3. العقدان موجودان في مسارَيهما المالكَين ويملكان سياسة الحالة/المرحلة.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const COMM = read("artifacts/api-server/src/routes/communications.ts");
const SUPPORT = read("artifacts/api-server/src/routes/support.ts");
const CRM = read("artifacts/api-server/src/routes/crm.ts");

describe("#2838 — الاتصالات تمرّ عبر عقد المسار القائد لا الكتابة المباشرة", () => {
  it("لا تنشئ الاتصالات فرصة CRM بكتابة مباشرة (نُقلت لعقد CRM)", () => {
    expect(COMM).not.toMatch(/INSERT\s+INTO\s+crm_opportunities/i);
  });

  it("المُعالج التلقائي يستدعي عقدَي الدعم/CRM القائدين", () => {
    expect(COMM).toMatch(/createTicketFromInboundComm/);
    expect(COMM).toMatch(/createOpportunityFromInboundComm/);
  });

  it("عقد الدعم موجود في مسار الدعم ويملك سياسة الحالة الابتدائية 'open'", () => {
    expect(SUPPORT).toMatch(/export async function createTicketFromInboundComm/);
    expect(SUPPORT).toMatch(/INSERT INTO support_tickets[\s\S]{0,120}'open'/i);
  });

  it("عقد CRM موجود في مسار CRM ويملك المرحلة الابتدائية 'lead' والحالة 'open'", () => {
    expect(CRM).toMatch(/export async function createOpportunityFromInboundComm/);
    expect(CRM).toMatch(/INSERT INTO crm_opportunities[\s\S]{0,300}'lead'/i);
    // الحالة الابتدائية يجب أن تكون 'open' (التصنيف القانوني الذي تحسبه إحصاءات
    // خط الأنابيب/التوقّع status='open') لا 'active' — وإلا اختفت الفرص الواردة.
    expect(CRM).toMatch(/INSERT INTO crm_opportunities[\s\S]{0,300}'lead',\s*'open'/i);
  });
});
