import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F5 (فحص النظام 2026-06-20) — برنامج التدريب: PATCH كان يحدّث startDate/endDate
 * بلا إعادة تحقّق من الترتيب، بينما POST يرفض endDate < startDate. نمط متكرّر
 * «POST يتحقق، PATCH الجزئي لا». اختبار ثابت — لا DB.
 */
const SRC = readFileSync(join(import.meta.dirname!, "../../src/routes/training.ts"), "utf8");

describe("training programs — date-ordering validation (F5)", () => {
  it("POST /programs validates endDate >= startDate", () => {
    expect(SRC).toMatch(/new Date\(endDate\) < new Date\(startDate\)/);
  });

  it("PATCH /programs/:id re-validates ordering against the effective (merged) values", () => {
    // loads the stored dates so a partial update can be checked
    expect(SRC).toMatch(/SELECT id, status, "startDate", "endDate" FROM training_programs/);
    expect(SRC).toMatch(/const sd = b\.startDate \?\? existing\.startDate/);
    expect(SRC).toMatch(/const ed = b\.endDate \?\? existing\.endDate/);
    expect(SRC).toMatch(/sd && ed && new Date\(ed\) < new Date\(sd\)/);
  });
});
