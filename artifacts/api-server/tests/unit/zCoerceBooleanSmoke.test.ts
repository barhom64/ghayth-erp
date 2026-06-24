/**
 * zCoerceBoolean — إصلاح فخّ z.coerce.boolean() الذي يحوّل السلسلة "false" إلى true
 * (Boolean("false") === true). الحقول المنطقية في الطلبات كانت تستقبل عكس ما يطلبه
 * العميل عند إرسال منطقي كنصّ. اختبار سلوكي يثبت التصحيح + استبدال كل المواضع.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { zCoerceBoolean } from "../../src/lib/zodCoerce.js";

const parse = (v: unknown) => zCoerceBoolean().parse(v);

describe("zCoerceBoolean — string 'false' is false (footgun fixed)", () => {
  it("the bug case: string 'false' → false (NOT true)", () => {
    expect(parse("false")).toBe(false);
    expect(parse("0")).toBe(false);
    expect(parse("no")).toBe(false);
    expect(parse("off")).toBe(false);
    expect(parse("")).toBe(false);
  });
  it("truthy strings → true", () => {
    expect(parse("true")).toBe(true);
    expect(parse("1")).toBe(true);
    expect(parse("TRUE")).toBe(true);
    expect(parse(" yes ")).toBe(true);
  });
  it("real booleans + numbers pass through correctly", () => {
    expect(parse(true)).toBe(true);
    expect(parse(false)).toBe(false);
    expect(parse(1)).toBe(true);
    expect(parse(0)).toBe(false);
  });
  it("optional()/default() still compose", () => {
    const schema = z.object({ flag: zCoerceBoolean().optional().default(true) });
    expect(schema.parse({}).flag).toBe(true);
    expect(schema.parse({ flag: "false" }).flag).toBe(false);
  });
  it("garbage is rejected (not silently coerced)", () => {
    expect(zCoerceBoolean().safeParse({}).success).toBe(false);
  });
});

describe("z.coerce.boolean() replaced in the operational batch", () => {
  const SRC = join(import.meta.dirname!, "../../src/routes");
  it("NO route file uses the unsafe z.coerce.boolean() (footgun eliminated everywhere)", () => {
    const offenders = readdirSync(SRC)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /z\.coerce\.boolean\(\)/.test(readFileSync(join(SRC, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
