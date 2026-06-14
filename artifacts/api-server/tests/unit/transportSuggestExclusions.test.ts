import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · P0-4 — كشف أسباب الإقصاء الصامت.
//   المحرك (عبر مُجمِّع اختياري non-breaking) يبلّغ لماذا أُسقطت كل مركبة/سائق
//   قبل التقييم (مصفوفة القدرات/الجاهزية/الصيانة/الإجازة/حدود القيادة)؛ مسار
//   الاقتراح يُعيدها في excluded؛ والنافذة تعرضها للمشغّل بدل الإخفاء الصامت.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const ROUTE = readFileSync(join(apiSrc, "routes/transport-planning.ts"), "utf8");
const DIALOG = readFileSync(join(spaSrc, "components/shared/assignment-suggest-dialog.tsx"), "utf8");

describe("P0-4 (محرك) — مُجمِّع إقصاء اختياري non-breaking", () => {
  it("يصدّر النوع ويضيف sink اختياريًا لـ Request و Criteria", () => {
    expect(ENGINE).toMatch(/export interface ExcludedCandidate/);
    expect(ENGINE).toMatch(/export type ExclusionSink/);
    expect(ENGINE).toMatch(/sink\?: ExclusionSink/);
  });

  it("يدفع السبب عند نقاط الإقصاء الخمس قبل التقييم", () => {
    const pushes = ENGINE.match(/c\.sink\?\.push\(/g) ?? [];
    expect(pushes.length).toBeGreaterThanOrEqual(5);
    expect(ENGINE).toMatch(/kind: "vehicle"[\s\S]{0,140}reason:/);
    expect(ENGINE).toMatch(/kind: "driver"[\s\S]{0,140}reason:/);
  });
});

describe("P0-4 (مسار) — suggest-assignment يُعيد excluded", () => {
  it("ينشئ sink ويمرّره للمحرك ويُعيده مقصوصًا في الاستجابة", () => {
    expect(ROUTE).toMatch(/const sink: ExcludedCandidate\[\] = \[\]/);
    expect(ROUTE).toMatch(/excluded: sink\.slice\(0, 40\)/);
  });
});

describe("P0-4 (واجهة) — النافذة تعرض المستبعدين وأسبابهم", () => {
  it("تجلب excluded وتخزّنه وتعرضه مع زرّ الإصلاح اللفظي", () => {
    expect(DIALOG).toMatch(
      /excluded\?: Array<\{ kind: string; id: number; label: string; reason: string \}>/,
    );
    expect(DIALOG).toMatch(/setExcluded\(res\?\.excluded \?\? null\)/);
    expect(DIALOG).toMatch(/مركبات\/سائقون مُستبعَدون قبل الترشيح/);
    expect(DIALOG).toMatch(/excluded\.map\(/);
  });
});
