import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * توحيد مصطلحات الواجهة (CLAUDE.md): نص حالة التحميل يستعمل الصيغة السائدة
 * «جاري …» (نحو 390 موضعًا) لا الشاذّة «جارٍ …» (مع التنوين). يمسح هذا الحارس
 * كامل واجهة المستخدم (pages + components) ويمنع أي ارتداد. عُمِّم من تدقيق
 * جودة المالية (#2928) إلى كامل الواجهة بعد توحيد كل المواضع المتبقّية.
 */
const SRC = import.meta.dirname!; // …/artifacts/ghayth-erp/src
const ROOTS = [join(SRC, "pages"), join(SRC, "components")];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    // skip test files — the guard itself references «جارٍ» in its matcher.
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

describe("UI loading text uses the unified «جاري …» across the whole frontend", () => {
  it("no page/component uses the «جارٍ» spelling variant", () => {
    const offenders = ROOTS.flatMap(walk).filter((f) => /جارٍ/.test(readFileSync(f, "utf8")));
    expect(
      offenders,
      `استعمل «جاري …» الموحّدة بدل «جارٍ …» في: ${offenders.map((f) => f.replace(SRC, "")).join(", ")}`,
    ).toEqual([]);
  });
});
