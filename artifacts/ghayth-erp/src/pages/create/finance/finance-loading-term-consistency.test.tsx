import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * توحيد مصطلحات الواجهة (CLAUDE.md): نصوص حالة التحميل تستعمل الصيغة السائدة
 * «جاري …» (379 موضعًا) لا الصيغة الشاذة «جارٍ …». هذا الحارس يمنع الارتداد إلى
 * «جارٍ» في شاشات/مكوّنات المالية بعد التوحيد (تدقيق الجودة).
 */
const ROOTS = [
  join(import.meta.dirname!, "."),                       // pages/create/finance
  join(import.meta.dirname!, "../../finance"),           // pages/finance
];

// Finance-facing files outside the finance dirs that this fix also touched —
// include them explicitly so the guard protects the FULL set it was added for
// (Codex P2 #2928): a shared finance component + the project billing detail.
const EXTRA_FILES = [
  join(import.meta.dirname!, "../../../components/shared/financial-attachment-viewer.tsx"),
  join(import.meta.dirname!, "../../details/project-detail.tsx"),
];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

describe("finance UI loading text uses the unified «جاري …» (not «جارٍ …»)", () => {
  it("no finance page/component reintroduces the «جارٍ» spelling variant", () => {
    const offenders: string[] = [];
    const files = [...ROOTS.flatMap(walk), ...EXTRA_FILES];
    for (const f of files) {
      let src = "";
      try { src = readFileSync(f, "utf8"); } catch { continue; }
      if (/جارٍ/.test(src)) offenders.push(f);
    }
    expect(offenders, `استعمل «جاري …» الموحّدة بدل «جارٍ …» في: ${offenders.join(", ")}`).toEqual([]);
  });
});
