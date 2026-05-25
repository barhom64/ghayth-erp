// Benchmarks for `parsePenaltyLabel` — the Arabic-text classifier
// that turns a labour-regulation penalty string ("خصم 50% من أجر يوم",
// "إنذار كتابي", "فصل بدون مكافأة") into a structured outcome. Runs
// per HR violation when the discipline engine resolves the penalty
// for an incident.
//
import { bench, describe } from "vitest";
import { parsePenaltyLabel } from "../../src/lib/disciplineEngine.js";

const DAILY_WAGE = 250;

describe("parsePenaltyLabel", () => {
  bench("warning only (إنذار)", () => {
    parsePenaltyLabel("إنذار كتابي", DAILY_WAGE);
  });

  bench("percentage of daily wage (50%)", () => {
    parsePenaltyLabel("خصم 50% من أجر يوم", DAILY_WAGE);
  });

  bench("multi-day deduction (token lookup)", () => {
    parsePenaltyLabel("خصم خمسة أيام من الأجر", DAILY_WAGE);
  });

  bench("termination with benefits (فصل)", () => {
    parsePenaltyLabel("فصل مع مكافأة", DAILY_WAGE);
  });

  bench("termination without benefits", () => {
    parsePenaltyLabel("فصل بدون مكافأة", DAILY_WAGE);
  });

  bench("promotion denial (non-monetary)", () => {
    parsePenaltyLabel("حرمان من الترقيات لمدة سنة", DAILY_WAGE);
  });

  bench("empty / dash (fast-path)", () => {
    parsePenaltyLabel("-", DAILY_WAGE);
  });

  bench("unknown label (falls through every check)", () => {
    parsePenaltyLabel("لا يوجد عقوبة محددة", DAILY_WAGE);
  });
});
