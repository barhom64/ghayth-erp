/**
 * حدّ أعلى لطول حقول النصّ الحرّ (تخزين/حمولة) — دفعة المراسلات/الاتصالات. حقول
 * subject/body/content/notes كانت z.string() بلا .max()، فقيمة بآلاف الكيلوبايتات
 * تُخزَّن وتُعاد ⇒ تضخّم. أُضيفت حدود سخيّة (subject 1000، body/content 20000،
 * notes 5000) — أعلى بكثير من أي نص مشروع، تمنع الإساءة فقط. اختبار ثابت.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const COMM = readFileSync(join(API_SRC, "routes/communications.ts"), "utf8");
const CORR = readFileSync(join(API_SRC, "routes/correspondence.ts"), "utf8");

describe("free-text length bounds — communications", () => {
  it("subject/body/content are capped", () => {
    expect(COMM).toMatch(/subject: z\.string\(\)\.max\(1000,/);
    expect(COMM).toMatch(/body: z\.string[^,]*\.max\(20000,/);
    expect(COMM).toMatch(/content: z\.string\(\)\.max\(20000,/);
  });
  it("no unbounded subject/content optional remains", () => {
    expect(/(subject|content): z\.string\(\)\.optional\(\),/.test(COMM)).toBe(false);
  });
});

describe("free-text length bounds — correspondence", () => {
  it("subject/content/notes are capped across all schemas", () => {
    expect((CORR.match(/subject: z\.string\(\)(?:\.min\(1[^)]*\))?\.max\(1000,/g) || []).length).toBe(3);
    expect((CORR.match(/content: z\.string\(\)\.max\(20000,/g) || []).length).toBe(3);
    expect((CORR.match(/notes: z\.string\(\)\.max\(5000,/g) || []).length).toBe(3);
  });
  it("no unbounded subject/content/notes optional remains", () => {
    expect(/(subject|content|notes): z\.string\(\)\.optional\(\),/.test(CORR)).toBe(false);
  });
});
