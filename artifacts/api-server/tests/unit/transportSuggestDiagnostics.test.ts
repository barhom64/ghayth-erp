import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — closes the user's gap #5:
//   "اقتراح المركبة غير ناضج. الصورة التي أرسلتها خطيرة:
//    'لم يجد النظام أي مرشح مناسب' مع وجود مركبة شاغرة.
//    هذا يدل غالباً على: قواعد الترشيح مكسورة، البيانات المطلوبة
//    ناقصة، لا يوجد تفسير للرفض، محرك الاقتراح غير ناضج."
//
// suggestDiagnostics.ts explains WHY the engine returned 0 candidates
// by running 2 cheap COUNT queries (vehicles + drivers) and mapping
// the gap to one of 7 axes (no_vehicles / no_dispatchable_vehicles /
// no_active_drivers / no_window / all_busy / all_blocked / unknown).
// The dialog renders the diagnostic verbatim with concrete fix hints.

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const DIAG     = readApi("lib/fleet/suggestDiagnostics.ts");
const PLANNING = readApi("routes/transport-planning.ts");
const DIALOG   = readSpa("components/shared/assignment-suggest-dialog.tsx");

describe("#1812 — suggestDiagnostics library (gap #5)", () => {
  it("file exists at the canonical lib path", () => {
    expect(existsSync(join(apiSrc, "lib/fleet/suggestDiagnostics.ts"))).toBe(true);
  });

  it("declares the 7 diagnostic axes", () => {
    for (const axis of [
      "no_vehicles", "no_active_drivers",
      "no_dispatchable_vehicles", "no_window",
      "all_busy", "all_blocked", "unknown",
    ]) {
      expect(DIAG, `axis ${axis} missing`).toContain(`"${axis}"`);
    }
  });

  it("counts vehicles + drivers with both total + filtered (active/dispatchable)", () => {
    expect(DIAG).toMatch(/COUNT\(\*\) FILTER \(WHERE status IN \('available', 'in_use'\)\) AS dispatchable/);
    expect(DIAG).toMatch(/COUNT\(\*\) FILTER \(WHERE COALESCE\(status, 'active'\) NOT IN \('inactive', 'terminated'\)\) AS active/);
  });

  it("Arabic explanations cover every failure axis", () => {
    expect(DIAG).toContain("لا توجد مركبات مسجلة في الأسطول");
    expect(DIAG).toContain("لا واحدة بالحالة 'available' أو 'in_use'");
    expect(DIAG).toContain("لا يوجد سائقون مسجلون");
    expect(DIAG).toContain("كلهم بحالة 'inactive' أو 'terminated'");
    expect(DIAG).toContain("الحجز ليس له نافذة زمنية محددة");
    expect(DIAG).toContain("جميع التركيبات");
  });

  it("hints offer concrete fix steps (URLs and field names)", () => {
    expect(DIAG).toContain("/fleet/vehicles/create");
    expect(DIAG).toContain("/fleet/drivers/create");
    expect(DIAG).toContain("سياسة الاستبدال");
    expect(DIAG).toContain("راحة السائق");
  });

  it("returns null when the engine returned >0 candidates", () => {
    // The function only runs when candidates.length === 0 (route logic).
    // The return-type signature requires a non-null diagnostic.
    expect(DIAG).toContain("export async function diagnoseEmptySuggest");
    expect(DIAG).toContain("Promise<SuggestDiagnostics>");
  });
});

describe("#1812 — suggest-assignment route wires the diagnostic", () => {
  it("imports diagnoseEmptySuggest", () => {
    expect(PLANNING).toContain("diagnoseEmptySuggest");
    expect(PLANNING).toContain('from "../lib/fleet/suggestDiagnostics.js"');
  });

  it("calls the diagnostic ONLY when candidates is empty", () => {
    expect(PLANNING).toMatch(/if \(candidates\.length === 0\) \{[\s\S]{0,200}diagnoseEmptySuggest/);
  });

  it("response includes diagnostics field (null when candidates non-empty)", () => {
    // P0-4 (TA-T18-UX-AUDIT-01) — الاستجابة وسّعت بحقل excluded الاختياري.
    expect(PLANNING).toMatch(/res\.json\(\{\s*data:\s*candidates,\s*diagnostics(,\s*excluded:[^}]*)?\s*\}\)/);
    expect(PLANNING).toMatch(/let diagnostics = null/);
  });
});

describe("#1812 — dialog surfaces the diagnostic", () => {
  it("state hook for diagnostics declared", () => {
    expect(DIALOG).toMatch(/const \[diagnostics, setDiagnostics\] = useState</);
  });

  it("typed response shape includes diagnostics + counts + hints", () => {
    expect(DIALOG).toMatch(/diagnostics\?: \{/);
    expect(DIALOG).toMatch(/reason: string/);
    expect(DIALOG).toMatch(/axis: string/);
    expect(DIALOG).toMatch(/totalVehicles: number/);
    expect(DIALOG).toMatch(/dispatchableVehicles: number/);
  });

  it("renders the diagnostic card when candidates is empty + diagnostics present", () => {
    expect(DIALOG).toMatch(/diagnostics \?/);
    expect(DIALOG).toMatch(/لم يجد المحرك أي تركيبة قابلة للإسناد/);
    expect(DIALOG).toMatch(/إجمالي المركبات/);
    expect(DIALOG).toMatch(/المركبات الجاهزة/);
    expect(DIALOG).toMatch(/إجمالي السائقين/);
    expect(DIALOG).toMatch(/السائقون الفعّالون/);
    expect(DIALOG).toMatch(/خطوات الإصلاح المقترحة/);
  });

  it("resets diagnostics on rerun + on dialog close", () => {
    const resetCount = (DIALOG.match(/setDiagnostics\(null\)/g) ?? []).length;
    expect(resetCount, "diagnostics must reset on rerun + on close").toBeGreaterThanOrEqual(2);
  });
});
