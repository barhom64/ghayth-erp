import { describe, it, expect } from "vitest";
import { computeDiff } from "../../src/lib/auditDiff.js";

describe("computeDiff", () => {
  it("returns empty for two nulls", () => {
    expect(computeDiff(null, null)).toEqual([]);
  });

  it("treats null before as a pure create — every after field is new", () => {
    const diffs = computeDiff(null, { name: "Ali", age: 30 });
    expect(diffs).toHaveLength(2);
    expect(diffs).toContainEqual({ field: "name", oldValue: null, newValue: "Ali" });
    expect(diffs).toContainEqual({ field: "age", oldValue: null, newValue: 30 });
  });

  it("treats null after as a pure delete — every before field is removed", () => {
    const diffs = computeDiff({ name: "Ali", age: 30 }, null);
    expect(diffs).toHaveLength(2);
    expect(diffs).toContainEqual({ field: "name", oldValue: "Ali", newValue: null });
    expect(diffs).toContainEqual({ field: "age", oldValue: 30, newValue: null });
  });

  it("emits one entry per changed field", () => {
    const diffs = computeDiff(
      { name: "Ali", age: 30, status: "active" },
      { name: "Ali", age: 31, status: "active" },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ field: "age", oldValue: 30, newValue: 31 });
  });

  it("skips framework timestamp + secret fields", () => {
    const diffs = computeDiff(
      {
        name: "Ali",
        updatedAt: new Date("2025-01-01"),
        createdAt: new Date("2024-01-01"),
        passwordHash: "old-hash",
        password: "old-plaintext",
      },
      {
        name: "Ali",
        updatedAt: new Date("2025-06-01"),
        createdAt: new Date("2024-01-01"),
        passwordHash: "new-hash",
        password: "new-plaintext",
      },
    );
    // Only `name` is compared and it is unchanged → no diffs.
    expect(diffs).toEqual([]);
  });

  it("detects added fields between two non-null objects", () => {
    const diffs = computeDiff({ name: "Ali" }, { name: "Ali", email: "ali@example.com" });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ field: "email", oldValue: null, newValue: "ali@example.com" });
  });

  it("detects removed fields between two non-null objects", () => {
    const diffs = computeDiff({ name: "Ali", email: "ali@example.com" }, { name: "Ali" });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      field: "email",
      oldValue: "ali@example.com",
      newValue: null,
    });
  });

  it("handles nested object equality via JSON.stringify", () => {
    const diffs = computeDiff(
      { meta: { tags: ["a", "b"] } },
      { meta: { tags: ["a", "b"] } },
    );
    expect(diffs).toEqual([]);
  });

  it("detects nested object changes", () => {
    const diffs = computeDiff(
      { meta: { tags: ["a"] } },
      { meta: { tags: ["a", "b"] } },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("meta");
  });
});
