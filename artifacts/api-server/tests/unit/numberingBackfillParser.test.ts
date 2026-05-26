import { describe, it, expect } from "vitest";
import { extractSequenceFromRef } from "../../src/lib/numberingBackfill.js";

// Pure-function parser test for the legacy-ref extractor used by the
// #1141 phase-5 backfill. Locks the behaviour for every ref shape the
// system has ever emitted so a future tweak doesn't silently regress
// the counter ratchet logic.

describe("extractSequenceFromRef", () => {
  it("extracts the LAST run of digits as the sequence value", () => {
    expect(extractSequenceFromRef("REQ-MK-2026-0042")).toBe(42);
    expect(extractSequenceFromRef("INV-202605-00123")).toBe(123);
    expect(extractSequenceFromRef("CTR-1000")).toBe(1000);
    expect(extractSequenceFromRef("EMP-2026-007")).toBe(7);
  });
  it("returns 0 for refs that have no usable suffix", () => {
    expect(extractSequenceFromRef("PAY-PORTAL-LRGZK4J3")).toBe(0);
    expect(extractSequenceFromRef("BATCH-XYZ")).toBe(0);
    expect(extractSequenceFromRef("")).toBe(0);
    expect(extractSequenceFromRef(null as unknown as string)).toBe(0);
    expect(extractSequenceFromRef(undefined as unknown as string)).toBe(0);
  });
  it("handles refs that are only digits", () => {
    expect(extractSequenceFromRef("1042")).toBe(1042);
  });
  it("clamps absurdly large numbers (likely encoded timestamps) to 0", () => {
    // A Date.now() base36 ref like `LRGZK4J3` decodes back to a giant
    // number that would poison the counter. The parser caps anything
    // above 1B at 0 so the backfill ratchet doesn't get derailed.
    expect(extractSequenceFromRef("SIG-1748232847123")).toBe(0);
  });
  it("picks the trailing seq even when the year is also numeric", () => {
    // "{PREFIX}-{BRANCH}-{YYYY}-{SEQ}" → take the LAST group.
    expect(extractSequenceFromRef("OUT-JED-2026-0500")).toBe(500);
  });
});
