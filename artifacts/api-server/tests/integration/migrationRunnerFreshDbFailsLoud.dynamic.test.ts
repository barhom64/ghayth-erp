// محرّك الهجرات عند الإقلاع (runMigrations عبر node-pg) لا يملك تحميل الأساس.
// تحميل dump الأساس مملوك لـ db/bootstrap.sh (psql) — قرار إبراهيم 2026-06-24.
// على قاعدة فارغة تمامًا يجب أن يفشل runMigrations بصوتٍ واضح ويُحيل لـ
// bootstrap.sh، بدل محاولة إعادة تشغيل الـdump عبر node-pg (التي تسقط على
// search_path الفارغ فتُنتج سكيمة ناقصة → «خطأ في هيكل قاعدة البيانات» وقت
// التشغيل). هذا الاختبار يشغّل runMigrations الحقيقي على قاعدة فارغة ويتأكد
// أنه يرمي رسالة الإحالة الواضحة. تفعيل: قاعدة فارغة على المنفذ 54329.

import { describe, it, expect } from "vitest";

const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && dbUrl.includes("54329") && dbUrl.includes("fresh") &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("runMigrations on a fresh empty DB fails loud, delegating baseline to psql/bootstrap.sh", () => {
  it("throws an actionable error instead of silently producing an incomplete schema", async () => {
    const { runMigrations } = await import("../../src/lib/migrate.js");
    await expect(runMigrations()).rejects.toThrow(/bootstrap\.sh/);
  });

  it("the error message is Arabic-first and names the baseline owner", async () => {
    const { runMigrations } = await import("../../src/lib/migrate.js");
    let msg = "";
    try { await runMigrations(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain("قاعدة بيانات فارغة");
    expect(msg).toContain("db/bootstrap.sh");
  });
});
