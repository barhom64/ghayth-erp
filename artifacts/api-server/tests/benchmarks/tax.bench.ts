// Benchmarks for `splitFromRate` — the pure VAT/tax split called
// from every invoice line, purchase line, and credit/debit memo
// preview. Runs at least N times per posting where N is the line
// count.
//
import { bench, describe } from "vitest";
import { splitFromRate } from "../../src/lib/taxCodes.js";

describe("splitFromRate", () => {
  bench("standard 15% (tax exclusive — invoice line)", () => {
    splitFromRate(1234.56, false, "SR", 15);
  });

  bench("standard 15% (tax inclusive — receipt amount)", () => {
    splitFromRate(1419.74, true, "SR", 15);
  });

  bench("zero-rated (export)", () => {
    splitFromRate(5000, false, "ZR", 0);
  });

  bench("exempt", () => {
    splitFromRate(2500.5, false, "EX", 0);
  });

  bench("reverse-charge 15% (RC)", () => {
    splitFromRate(987.65, false, "RC", 15);
  });

  bench("custom rate 5% (legacy GCC)", () => {
    splitFromRate(10000, false, "STD5", 5);
  });
});
