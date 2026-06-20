/**
 * HR — سقف الوقت الإضافي الشهري القابل للضبط.
 *
 * إضافة سياسة قابلة للتحكم: الإعداد `overtime_monthly_cap_hours` في
 * system_settings. الافتراضي (غائب/0) = بلا حدّ → صفر تغيير للسلوك القائم.
 * عند ضبطه > 0 يرفض معالِج إنشاء الوقت الإضافي ما يتجاوز السقف داخل الشهر
 * (يحسب pending + approved، يستثني المرفوض).
 *
 * حارس static (بلا قاعدة بيانات) يقفل المنطق فيلتقط أي ارتداد يسقط السقف أو
 * يغيّر الافتراض «بلا حدّ».
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const OVERTIME_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-overtime.ts"),
  "utf8",
);

// جسم معالِج POST /overtime.
const start = OVERTIME_ROUTE.indexOf('router.post("/overtime"');
const after = OVERTIME_ROUTE.slice(start);
const nextRoute = after.indexOf("\nrouter.", 10);
const body = nextRoute > -1 ? after.slice(0, nextRoute) : after;

describe("سقف الوقت الإضافي الشهري القابل للضبط", () => {
  it("يقرأ الإعداد overtime_monthly_cap_hours من system_settings", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("overtime_monthly_cap_hours");
    expect(body).toMatch(/FROM system_settings/);
  });

  it("الافتراضي بلا حدّ: لا تطبيق إلا إذا كان السقف > 0", () => {
    // monthlyCap يُشتق من القيمة (افتراضه 0)، والتطبيق محصور بـ > 0.
    expect(body).toMatch(/monthlyCap\s*=\s*Number\(capRow\[0\]\?\.value\s*\?\?\s*0\)/);
    expect(body).toMatch(/monthlyCap\s*>\s*0/);
  });

  it("يجمع ساعات الشهر (pending + approved، يستثني المرفوض) لنفس الموظف", () => {
    expect(body).toMatch(/SUM\(hours\)/);
    expect(body).toMatch(/"payrollPeriod"\s*=\s*\$2/);
    expect(body).toMatch(/status\s*!=\s*'rejected'/);
  });

  it("يرفض ما يتجاوز السقف برسالة تبيّن المتبقي", () => {
    expect(body).toMatch(/already\s*\+\s*hours\s*>\s*monthlyCap/);
    expect(body).toContain("ValidationError");
    expect(body).toMatch(/تجاوز سقف الوقت الإضافي الشهري/);
  });

  it("يبقي السقف اليومي (12 ساعة) كما هو — لا يلغيه", () => {
    expect(OVERTIME_ROUTE).toMatch(/\.max\(12,/);
  });
});
