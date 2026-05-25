// Benchmarks for the Riyadh-aware date/period and rounding helpers
// from `businessHelpers.ts`. `currentDateInTz` and
// `combineDateAndShiftTime` allocate an `Intl.DateTimeFormat` per
// call — these benches are the safety net if anyone refactors them
// into something heavier.
//
import { bench, describe } from "vitest";
import {
  todayISO,
  currentYear,
  currentPeriod,
  currentDateInTz,
  combineDateAndShiftTime,
  computeVat,
  extractBaseFromGross,
  roundTo2,
  roundTo4,
  generateRef,
  generateTimeRef,
} from "../../src/lib/businessHelpers.js";

const REFERENCE_DATE = new Date("2026-05-25T08:00:00Z");

describe("Riyadh-aware 'now' helpers", () => {
  bench("todayISO()", () => {
    todayISO();
  });

  bench("currentYear()", () => {
    currentYear();
  });

  bench("currentPeriod()", () => {
    currentPeriod();
  });

  bench("currentDateInTz('Asia/Riyadh')", () => {
    currentDateInTz();
  });

  bench("currentDateInTz('UTC')", () => {
    currentDateInTz("UTC");
  });

  bench("currentDateInTz with explicit Date (no `new Date()` allocation)", () => {
    currentDateInTz("Asia/Riyadh", REFERENCE_DATE);
  });
});

describe("combineDateAndShiftTime", () => {
  bench("Riyadh 08:00 shift start", () => {
    combineDateAndShiftTime("2026-05-25", "08:00");
  });

  bench("Riyadh 23:30 shift start (close to TZ rollover)", () => {
    combineDateAndShiftTime("2026-05-25", "23:30");
  });

  bench("UTC tz override", () => {
    combineDateAndShiftTime("2026-05-25", "08:00", "UTC");
  });
});

describe("VAT and rounding", () => {
  bench("computeVat(1234.56, 15)", () => {
    computeVat(1234.56, 15);
  });

  bench("extractBaseFromGross(1419.68, 15)", () => {
    extractBaseFromGross(1419.68, 15);
  });

  bench("roundTo2 — typical money value", () => {
    roundTo2(1234.5678);
  });

  bench("roundTo4 — precision FX value", () => {
    roundTo4(0.123456789);
  });
});

describe("reference generators", () => {
  bench("generateRef('INV', 42)", () => {
    generateRef("INV", 42);
  });

  bench("generateRef('INV', 42, 8) — wider pad", () => {
    generateRef("INV", 42, 8);
  });

  bench("generateTimeRef('INV')", () => {
    generateTimeRef("INV");
  });
});
