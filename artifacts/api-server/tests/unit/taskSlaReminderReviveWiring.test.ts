import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * إحياء «تذكير SLA للمهام» — فحص النظام كشف أن settings/task-sla-reminder
 * (GET/PUT/DELETE) مبنيّ ويُستهلَك من كرون حيّ (inbox_task_sla_reminder_scan)
 * لكن بلا واجهة ضبط. هذه الدفعة تُحييه: شاشة تربط الإعداد القائم.
 *   • لا endpoint/هجرة/RBAC جديد — إعادة استخدام settings:view/update.
 *   • الكرون يقرأ الإعداد فعلًا (المصدر الحيّ) — الواجهة تضبطه فقط.
 */
const repoRoot = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

const TAB = read("artifacts/ghayth-erp/src/pages/settings/task-sla-reminder-tab.tsx");
const SETTINGS = read("artifacts/ghayth-erp/src/pages/settings.tsx");
const SETTINGS_ROUTE = read("artifacts/api-server/src/routes/settings.ts");
const CRON = read("artifacts/api-server/src/lib/cronScheduler.ts");

describe("إحياء تذكير SLA للمهام — الشاشة تربط الإعداد الحيّ", () => {
  it("التبويب يقرأ/يكتب/يُرجِع الإعداد عبر endpoints القائمة", () => {
    expect(TAB).toContain('"/settings/task-sla-reminder"');
    expect(TAB).toMatch(/method:\s*"PUT"/);
    expect(TAB).toMatch(/method:\s*"DELETE"/);
    // الحقول الثلاثة للإعداد.
    expect(TAB).toContain("leadFraction");
    expect(TAB).toContain("leadHours");
    expect(TAB).toContain("finalReminderHours");
    // الحفظ مُحاط بصلاحية settings المُعاد استخدامها (لا RBAC جديد).
    expect(TAB).toMatch(/perm="settings:update"/);
  });

  it("التبويب مُسجَّل في مركز الإعدادات (استيراد + مُشغِّل + محتوى + مسار عميق)", () => {
    expect(SETTINGS).toContain("TaskSlaReminderTab");
    expect(SETTINGS).toMatch(/TabsTrigger value="task-sla"/);
    expect(SETTINGS).toMatch(/TabsContent value="task-sla"><TaskSlaReminderTab/);
    expect(SETTINGS).toMatch(/"\/settings\/task-sla":\s*"task-sla"/);
  });

  it("قفل الحدود: الـendpoints قائمة ومُحاطة بصلاحية settings (لا شيء جديد)", () => {
    expect(SETTINGS_ROUTE).toMatch(/\.get\("\/task-sla-reminder",\s*authorize\(\{ feature: "settings", action: "view"/);
    expect(SETTINGS_ROUTE).toMatch(/\.put\("\/task-sla-reminder",\s*authorize\(\{ feature: "settings", action: "update"/);
  });

  it("المصدر الحيّ: الكرون ما زال يقرأ نفس الإعداد (الإحياء يضبط ما يعمل فعلًا)", () => {
    expect(CRON).toContain("inbox_task_sla_reminder_scan");
    expect(CRON).toContain("resolveTaskSlaReminderConfig");
    expect(CRON).toContain("TASK_SLA_REMINDER_SETTING_KEY");
  });
});
