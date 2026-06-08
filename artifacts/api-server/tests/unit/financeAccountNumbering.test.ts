import { describe, it, expect } from "vitest";
import {
  inferCodeWidth,
  suggestNextChildCode,
  suggestNextRootCode,
} from "../../src/lib/financeAccountNumbering.js";

// A realistic slice of the 4-digit SOCPA-style tree used by the seed.
const TREE = [
  "1000", "1100", "1110", "1111", "1112", "1113", "1120", "1121", "1122",
  "1130", "1200", "2000", "2100", "5000",
];
const allCodes = (extra: string[] = []) => new Set([...TREE, ...extra]);

describe("financeAccountNumbering", () => {
  it("infers a 4-digit code width", () => {
    expect(inferCodeWidth(TREE)).toBe(4);
    expect(inferCodeWidth([])).toBe(4);
  });

  it("suggests the next child of a level-1 root (step 100)", () => {
    // 1000 has children 1100,1200 → next is 1300
    const r = suggestNextChildCode({
      parentCode: "1000", parentLevel: 1, codeWidth: 4,
      childCodes: ["1100", "1200"], allCodes: allCodes(),
    });
    expect(r.code).toBe("1300");
  });

  it("suggests the next child of a level-2 account (step 10)", () => {
    // 1100 has 1110,1120,1130 → next 1140
    const r = suggestNextChildCode({
      parentCode: "1100", parentLevel: 2, codeWidth: 4,
      childCodes: ["1110", "1120", "1130"], allCodes: allCodes(),
    });
    expect(r.code).toBe("1140");
  });

  it("suggests the next child of a level-3 account (step 1) — the case the old UI got wrong", () => {
    // 1110 has 1111,1112,1113 → next 1114 (NOT "111001")
    const r = suggestNextChildCode({
      parentCode: "1110", parentLevel: 3, codeWidth: 4,
      childCodes: ["1111", "1112", "1113"], allCodes: allCodes(),
    });
    expect(r.code).toBe("1114");
  });

  it("first child when parent has none", () => {
    const r = suggestNextChildCode({
      parentCode: "5000", parentLevel: 1, codeWidth: 4,
      childCodes: [], allCodes: allCodes(),
    });
    expect(r.code).toBe("5100");
  });

  it("skips taken slots (gap-fill is collision-safe)", () => {
    // 1140 already taken elsewhere → jump to 1150
    const r = suggestNextChildCode({
      parentCode: "1100", parentLevel: 2, codeWidth: 4,
      childCodes: ["1110", "1120", "1130"], allCodes: allCodes(["1140"]),
    });
    expect(r.code).toBe("1150");
  });

  it("reports exhaustion when the parent's block is full", () => {
    const full = Array.from({ length: 9 }, (_, i) => `11${i + 1}0`); // 1110..1190
    const r = suggestNextChildCode({
      parentCode: "1100", parentLevel: 2, codeWidth: 4,
      childCodes: full, allCodes: new Set(full),
    });
    expect(r.code).toBeNull();
    expect(r.reason).toContain("نفدت");
  });

  it("refuses a non-numeric parent code", () => {
    const r = suggestNextChildCode({
      parentCode: "CASH", parentLevel: 2, codeWidth: 4,
      childCodes: [], allCodes: allCodes(),
    });
    expect(r.code).toBeNull();
  });

  it("suggests a type-seeded root", () => {
    expect(suggestNextRootCode({ codeWidth: 4, rootCodes: ["1000", "2000"], allCodes: allCodes(), type: "equity" }).code).toBe("3000");
    // existing family → no suggestion
    expect(suggestNextRootCode({ codeWidth: 4, rootCodes: ["1000", "2000"], allCodes: allCodes(), type: "asset" }).code).toBeNull();
  });

  it("suggests the next unused leading digit when no type given", () => {
    expect(suggestNextRootCode({ codeWidth: 4, rootCodes: ["1000", "2000"], allCodes: allCodes() }).code).toBe("3000");
  });
});
