import { describe, it, expect } from "vitest";
import {
  assertWpsTransition,
  deriveHeaderStatus,
  IllegalWpsTransitionError,
  type AckOutcome,
} from "../../src/lib/saudi-compliance/wps/run.js";
import type { WpsRunStatus } from "../../src/lib/saudi-compliance/types.js";

describe("WPS run FSM — allowed transitions", () => {
  it.each([
    ["draft", "submitted"],
    ["draft", "rejected"],
    ["submitted", "acknowledged"],
    ["submitted", "partial"],
    ["submitted", "rejected"],
    ["partial", "acknowledged"],
    ["partial", "rejected"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(() => assertWpsTransition(from as WpsRunStatus, to as WpsRunStatus)).not.toThrow();
  });

  it("treats no-op self-transitions as legal", () => {
    expect(() => assertWpsTransition("draft", "draft")).not.toThrow();
    expect(() => assertWpsTransition("acknowledged", "acknowledged")).not.toThrow();
  });

  it.each([
    ["acknowledged", "submitted"],
    ["acknowledged", "rejected"],
    ["rejected", "submitted"],
    ["draft", "acknowledged"],
    ["draft", "partial"],
    ["submitted", "draft"],
  ] as const)("rejects %s → %s", (from, to) => {
    expect(() =>
      assertWpsTransition(from as WpsRunStatus, to as WpsRunStatus),
    ).toThrow(IllegalWpsTransitionError);
  });

  it("error message identifies both ends of the bad transition", () => {
    try {
      assertWpsTransition("acknowledged", "submitted");
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).toContain("acknowledged");
      expect((err as Error).message).toContain("submitted");
      expect((err as Error).name).toBe("IllegalWpsTransitionError");
    }
  });
});

describe("deriveHeaderStatus — aggregate outcome → header status", () => {
  const zero: AckOutcome = { paid: 0, failed: 0, held: 0, rejected: 0, unmatched: 0 };

  it("keeps prior status when ack resolved zero rows (empty/unmatched ack)", () => {
    expect(deriveHeaderStatus("submitted", zero)).toBe("submitted");
    expect(deriveHeaderStatus("partial", zero)).toBe("partial");
  });

  it("returns acknowledged when every resolved row paid", () => {
    expect(
      deriveHeaderStatus("submitted", { ...zero, paid: 5 }),
    ).toBe("acknowledged");
  });

  it("returns rejected when every resolved row failed (no paid rows)", () => {
    expect(
      deriveHeaderStatus("submitted", { ...zero, failed: 3 }),
    ).toBe("rejected");
    expect(
      deriveHeaderStatus("submitted", { ...zero, rejected: 2 }),
    ).toBe("rejected");
  });

  it("returns partial when paid + failed are both present", () => {
    expect(
      deriveHeaderStatus("submitted", { ...zero, paid: 3, failed: 2 }),
    ).toBe("partial");
  });

  it("returns partial when paid + held are present (operator-actionable mix)", () => {
    expect(
      deriveHeaderStatus("submitted", { ...zero, paid: 3, held: 1 }),
    ).toBe("partial");
  });

  it("returns partial when only held rows are present (bank's holding, operator escalates)", () => {
    // 'held' alone means the bank received the lines but neither paid
    // nor outright rejected them — typically a manual hold for KYC /
    // duplicate check. We classify the header as 'partial' so the
    // operator sees an actionable status; 'rejected' would imply a
    // hard failure they can't recover from without re-submitting.
    expect(
      deriveHeaderStatus("submitted", { ...zero, held: 2 }),
    ).toBe("partial");
  });

  it("ignores unmatched count in the aggregate decision (it's a separate signal)", () => {
    expect(
      deriveHeaderStatus("submitted", { ...zero, paid: 5, unmatched: 99 }),
    ).toBe("acknowledged");
  });
});
