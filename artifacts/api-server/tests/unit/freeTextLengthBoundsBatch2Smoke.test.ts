/**
 * حدّ أعلى لطول حقول النصّ الحرّ — دفعة الدعم/المهام (متابعة #2891). نفس الصنف:
 * subject/description/comment/content/title/notes/message تُخزَّن بلا .max(). حدود
 * سخيّة (title 500، subject 1000، description/comment/notes 5000، رسالة الرد 20000،
 * محتوى المقال المعرفي 100000). اختبار ثابت — لا يبقى حقل نصّ حرّ بلا حدّ.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const SUP = readFileSync(join(API_SRC, "routes/support.ts"), "utf8");
const TASKS = readFileSync(join(API_SRC, "routes/tasks.ts"), "utf8");

const noUnbounded = (src: string) =>
  /(title|subject|description|notes|content|comment|message): z\.string\(\)(\.optional\(\))?(\.nullable\(\))?,/.test(src);

describe("free-text length bounds — support", () => {
  it("ticket subject/description + KB content + reply message are capped", () => {
    expect(SUP).toMatch(/subject: z\.string\(\)\.min\(1[^)]*\)\.max\(1000,/);
    expect(SUP).toMatch(/description: z\.string\(\)\.min\(1[^)]*\)\.max\(5000,/);
    expect(SUP).toMatch(/content: z\.string\(\)\.min\(1[^)]*\)\.max\(100000,/);
    expect(SUP).toMatch(/message: z\.string\(\)\.min\(1[^)]*\)\.max\(20000,/);
  });
  it("no unbounded free-text field remains in support", () => {
    expect(noUnbounded(SUP)).toBe(false);
  });
});

describe("free-text length bounds — tasks", () => {
  it("task title/description/notes are capped", () => {
    expect(TASKS).toMatch(/title: z\.string\(\)\.min\(1[^)]*\)\.max\(500,/);
    expect((TASKS.match(/description: z\.string\(\)\.max\(5000,/g) || []).length).toBe(2);
    expect((TASKS.match(/notes: z\.string\(\)\.max\(5000,/g) || []).length).toBe(2);
  });
  it("no unbounded free-text field remains in tasks", () => {
    expect(noUnbounded(TASKS)).toBe(false);
  });
});
