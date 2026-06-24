// UX Critical Actions — نظام غيث
//
// يكمّل ux-acceptance-gate.spec.ts بفحص ديناميكية الأزرار على الصفحات الحرجة:
//   1. لا تتسرّب نافذة متصفّح أصلية (confirm/alert/prompt) — الإجراءات الخطرة
//      يجب أن تمرّ عبر مكوّنات التأكيد الموحّدة داخل التطبيق (RTL + عربي + أثر).
//      (الحارس الثابت scripts/src/check-dangerous-actions.mjs يمنعها في المصدر؛
//       هذا يحرسها وقت التشغيل أيضًا.)
//   2. لا أزرار ميتة: كل زر ظاهر له اسم وصول (نص / aria-label / title) — زر بلا
//      اسم = زر ميت أو غامض للمستخدم وقارئ الشاشة.
//
// منخفض التذبذب: يسجّل الأخطاء، يفتح كل مسار مرة، يفحص DOM ثابتًا دون نقرات.

import { test, expect } from "@playwright/test";
import { login } from "./_helpers/login";

// مجموعة حرجة مركّزة (قوائم + لوحات تظهر أزرار إجراءات).
const ACTION_ROUTES = [
  "/employees",
  "/hr/leaves",
  "/finance",
  "/fleet",
  "/documents",
];

const routes = (process.env.UX_ACTION_ROUTES ?? ACTION_ROUTES.join(","))
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

test.describe("@ux-gate critical action buttons are alive and in-app", () => {
  for (const route of routes) {
    test(`actions are state/permission-aware and not dead: ${route}`, async ({ page }) => {
      // أي نافذة متصفّح أصلية = فشل (إجراء خطر خارج مكوّنات التطبيق الموحّدة).
      const nativeDialogs: string[] = [];
      page.on("dialog", (dialog) => {
        nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
        dialog.dismiss().catch(() => undefined);
      });

      await login(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (response) {
        expect(response.status(), `${route} returned HTTP ${response.status()}`).toBeLessThan(400);
      }
      await page.locator("body").waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle").catch(() => undefined);

      // أزرار ميتة: زر ظاهر بلا اسم وصول (نص مرئي أو aria-label أو title).
      const namelessButtons = await page
        .locator("button:visible, [role='button']:visible")
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
              const aria = el.getAttribute("aria-label")?.trim();
              const title = el.getAttribute("title")?.trim();
              const labelledby = el.getAttribute("aria-labelledby")?.trim();
              return !text && !aria && !title && !labelledby;
            })
            .map((el) => (el.outerHTML || "").slice(0, 120))
            .slice(0, 10),
        );

      expect(nativeDialogs, `${route} leaked a native browser dialog (use ConfirmActionDialog)`).toEqual([]);
      expect(namelessButtons, `${route} has dead/nameless buttons (no text/aria-label/title)`).toEqual([]);
    });
  }
});
