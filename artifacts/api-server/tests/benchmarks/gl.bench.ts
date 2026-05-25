// Benchmarks for the GL journal-entry builder. Every poster
// (FX reval, realised FX, COGS, cycle-count variance, inventory
// write-off) calls `buildEntry` exactly once per posting, and the
// balance check is mandatory — a regression here regresses every
// finance write path.
//
import { bench, describe } from "vitest";
import {
  buildEntry,
  buildSimpleEntry,
} from "../../src/lib/gl/journal-poster.js";

function makeLines(pairs: number) {
  // 2 lines per pair (DR + CR), balanced.
  const lines: Array<{ accountId: number; amount: number; description: string }> = [];
  for (let i = 0; i < pairs; i++) {
    const amt = Math.round((100 + i * 7.31) * 100) / 100;
    lines.push({ accountId: 1000 + i, amount: amt, description: `dr-${i}` });
    lines.push({ accountId: 2000 + i, amount: -amt, description: `cr-${i}` });
  }
  return lines;
}

const twoLines = makeLines(1);
const tenLines = makeLines(5);
const hundredLines = makeLines(50);

describe("buildEntry", () => {
  bench("2-line entry (simplest balanced posting)", () => {
    buildEntry({ description: "simple", lines: twoLines });
  });

  bench("10-line entry (typical invoice with tax + per-line GL)", () => {
    buildEntry({ description: "invoice", lines: tenLines });
  });

  bench("100-line entry (large period-end revaluation)", () => {
    buildEntry({ description: "revaluation", lines: hundredLines });
  });

  bench("10-line entry with zero-amount filler (must skip silently)", () => {
    const padded = [
      ...tenLines,
      { accountId: 9999, amount: 0, description: "zero" },
      { accountId: 9998, amount: 0, description: "zero2" },
    ];
    buildEntry({ description: "padded", lines: padded });
  });
});

describe("buildSimpleEntry", () => {
  bench("typical 2-line shape (FX revaluation pair)", () => {
    buildSimpleEntry({
      description: "fx reval",
      amount: 1234.56,
      debitAccountId: 1100,
      creditAccountId: 4900,
      referenceType: "fx_revaluation_log",
      referenceId: 42,
    });
  });
});
