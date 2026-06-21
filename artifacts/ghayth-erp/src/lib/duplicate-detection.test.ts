/**
 * البند 4 — deep duplicate detection. Pins the two-tier marking: exact
 * (contentHash) takes precedence over likely (name+size); singletons unmarked.
 */
import { describe, it, expect } from "vitest";
import { computeDuplicateMarks } from "./duplicate-detection";

describe("computeDuplicateMarks", () => {
  it("marks same contentHash as «exact» even when names differ", () => {
    const marks = computeDuplicateMarks([
      { id: 1, contentHash: "a".repeat(64), fileName: "id.png", fileSize: 100 },
      { id: 2, contentHash: "a".repeat(64), fileName: "renamed.png", fileSize: 100 },
      { id: 3, contentHash: "b".repeat(64), fileName: "other.png", fileSize: 200 },
    ]);
    expect(marks.get(1)).toBe("exact");
    expect(marks.get(2)).toBe("exact");
    expect(marks.has(3)).toBe(false);
  });

  it("falls back to «likely» on name+size when no hash present", () => {
    const marks = computeDuplicateMarks([
      { id: 1, fileName: "r.pdf", fileSize: 900 },
      { id: 2, fileName: "r.pdf", fileSize: 900 },
      { id: 3, fileName: "u.pdf", fileSize: 5 },
    ]);
    expect(marks.get(1)).toBe("likely");
    expect(marks.get(2)).toBe("likely");
    expect(marks.has(3)).toBe(false);
  });

  it("prefers «exact» over «likely» when both apply", () => {
    const marks = computeDuplicateMarks([
      { id: 1, contentHash: "c".repeat(64), fileName: "x.pdf", fileSize: 10 },
      { id: 2, contentHash: "c".repeat(64), fileName: "x.pdf", fileSize: 10 },
    ]);
    expect(marks.get(1)).toBe("exact");
    expect(marks.get(2)).toBe("exact");
  });

  it("does not mark unique files", () => {
    const marks = computeDuplicateMarks([
      { id: 1, contentHash: "d".repeat(64), fileName: "a", fileSize: 1 },
      { id: 2, contentHash: "e".repeat(64), fileName: "b", fileSize: 2 },
    ]);
    expect(marks.size).toBe(0);
  });
});
