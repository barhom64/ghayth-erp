/**
 * V1 (FIN-PROP-OWNER) — توجيه مسؤولية تكلفة صيانة العقار.
 *
 * قبل V1 كان مسار إكمال الصيانة (POST /maintenance-requests/:id/complete)
 * يرحّل التكلفة دائمًا كمصروف شركة (postMaintenanceExpenseGL) — حتى للعقارات
 * المُدارة لطرف ثالث. V1 يضيف توجيهًا صريحًا محروسًا:
 *
 *   costResponsibility = "company" (افتراضي) → postMaintenanceExpenseGL (سلوك قائم)
 *   costResponsibility = "owner"             → postMaintenanceOwnerBillingGL
 *       + حارس: يُرفض ما لم يوجد مالك مسجَّل (unit.ownerId ?? building.ownerId)
 *       + فاتورة المستأجر التلقائية تُتخطّى (المالك يُفوتَر لا المستأجر)
 *       + الضريبة مشروطة بـ ownerVatApplicable
 *
 * سطور القيد لكلا المسارين محروسة سلوكيًا في:
 *   - propertyMaintenanceOwnerBillingGL.test.ts (مدين ذمة المالك / دائن مستحق
 *     صيانة 2150 / دائن ضريبة اختياري)
 * هذا الحارس يقفل قرار التوجيه نفسه في الراوت (static — بلا قاعدة بيانات)،
 * فيلتقط أي ارتداد يعيد المسار لمصروف الشركة أو يسقط الحارس.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PROPERTIES_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/properties.ts"),
  "utf8",
);

// عزل جسم معالِج POST /complete حتى لا تلتقط التأكيدات مسارات أخرى.
const completeStart = PROPERTIES_ROUTE.indexOf('router.post("/maintenance-requests/:id/complete"');
const afterStart = PROPERTIES_ROUTE.slice(completeStart);
// جسم المعالِج كاملًا حتى تعريف الراوت التالي.
const nextRoute = afterStart.indexOf("\nrouter.", 10);
const completeBody = nextRoute > -1 ? afterStart.slice(0, nextRoute) : afterStart;

describe("V1 — توجيه مسؤولية تكلفة الصيانة (POST /complete)", () => {
  it("يوجّه إلى فوترة المالك عند costResponsibility = owner", () => {
    expect(completeStart).toBeGreaterThan(-1);
    expect(completeBody).toMatch(/costResponsibility\s*===\s*"owner"/);
    expect(completeBody).toContain("postMaintenanceOwnerBillingGL");
  });

  it("يحتفظ بمصروف الشركة كمسار افتراضي (لا ارتداد)", () => {
    expect(completeBody).toContain("postMaintenanceExpenseGL");
  });

  it("يحرس: يرفض owner ما لم يوجد مالك مسجَّل على الوحدة أو المبنى", () => {
    // الحارس يحلّ COALESCE(unit.ownerId, building.ownerId) ويرمي إن غاب.
    expect(completeBody).toMatch(/COALESCE\(\s*u\."ownerId",\s*bld\."ownerId"\s*\)/);
    expect(completeBody).toMatch(/لا يوجد مالك مسجَّل/);
  });

  it("يمرّر ownerId والتكلفة لقيد فوترة المالك", () => {
    expect(completeBody).toMatch(/ownerId:\s*maintOwnerId/);
    expect(completeBody).toMatch(/totalCost:\s*cost/);
  });

  it("الضريبة مشروطة باختيار ownerVatApplicable", () => {
    expect(completeBody).toMatch(/ownerVatApplicable\s*\?\s*computeVat\(/);
  });

  it("يتخطّى فاتورة المستأجر التلقائية عند تحميلها على المالك", () => {
    expect(completeBody).toMatch(/!b\.coveredByContract\s*&&\s*!billToOwner/);
  });

  it("schema يقبل القيمتين فقط (company|owner) ويبقى اختياريًا", () => {
    expect(PROPERTIES_ROUTE).toMatch(
      /costResponsibility:\s*z\.enum\(\["company",\s*"owner"\]\)\.optional\(\)/,
    );
  });
});
