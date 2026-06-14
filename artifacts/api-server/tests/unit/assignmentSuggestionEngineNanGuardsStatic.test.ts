import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 follow-up — defensive guards in assignmentSuggestionEngine
 *
 * Two HIGH-confidence bugs found in a post-audit review:
 *
 *   (1) NaN-swallowing driver-rest guard. If
 *       `fleet_drivers.lastDutyEndedAt` carries a malformed value
 *       (or `start` does), `new Date(...).getTime()` returns NaN,
 *       `hoursSinceLastDuty` is NaN, and the subsequent
 *       comparison `NaN < d.restHoursRequired` is FALSE — so the
 *       driver SILENTLY passes the rest check on a corrupt
 *       timestamp. Safety bug: the audit trail says "rest OK"
 *       when the engine had no idea. Fix: explicit
 *       `Number.isFinite` guard with an Arabic blocker reason.
 *
 *   (2) Divide-by-zero in the cargo capacity branch. The cargo
 *       sweet-spot scorer at line ~928 does `cargoKg / effective`
 *       with no guard when `effective === 0` (only checked for
 *       null earlier). The result NaN propagates through the
 *       ternary as `NaN < 0.2 → false` and `NaN > 0.95 → false`,
 *       picking up the default `100` score. The passenger branch
 *       (line 951) already had this defense; this PR brings the
 *       cargo branch into parity.
 *
 * Bonus: the "well-utilised" capacity reason previously fired
 * only for fillRatio in [0.8, 0.95] but the ternary actually
 * rewards [0.2, 0.95] with the maximum score. Widen the reason
 * window so the operator sees consistent messaging.
 *
 * Per the owner's package-locality rule: static, regex-only.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ENGINE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/assignmentSuggestionEngine.ts"),
  "utf8",
);

describe("#2079 follow-up — NaN guard on driver-rest hours", () => {
  it("the rest scorer explicitly guards against non-finite hoursSinceLastDuty", () => {
    expect(ENGINE).toMatch(
      /if \(!Number\.isFinite\(hoursSinceLastDuty\)\)\s*\{[\s\S]{0,200}?restScore = 0/,
    );
  });

  it("the corrupt-timestamp path emits an Arabic blocker (not a silent pass)", () => {
    expect(ENGINE).toMatch(
      /تاريخ آخر إنهاء قيادة للسائق غير صالح/,
    );
  });

  it("the NaN guard sits BEFORE the rest-threshold comparison (order matters)", () => {
    // The order proves the silent-pass bug is closed: if the new
    // block fires, the original `hoursSinceLastDuty < d.restHoursRequired`
    // branch never runs.
    expect(ENGINE).toMatch(
      /if \(!Number\.isFinite\(hoursSinceLastDuty\)\)[\s\S]{0,300}?else if \(hoursSinceLastDuty < d\.restHoursRequired\)/,
    );
  });
});

describe("#2079 follow-up — cargo capacity divide-by-zero guard", () => {
  it("cargo fillRatio uses the `effective > 0 ? ... : 0` ternary (passenger-parity)", () => {
    expect(ENGINE).toMatch(
      /const fillRatio = effective > 0 \? cargoKg \/ effective : 0;/,
    );
  });

  it("passenger fillRatio still uses the same defense (regression pin)", () => {
    expect(ENGINE).toMatch(
      /const fillRatio = effective > 0 \? passengers \/ effective : 0;/,
    );
  });

  it("no unguarded `cargoKg / effective` lingers in the engine", () => {
    // Only the guarded form should appear. If a sibling helper
    // re-introduced the unguarded division this catches it.
    expect(ENGINE).not.toMatch(
      /=\s*cargoKg \/ effective\s*;[^\n]*$/m,
    );
  });
});

describe("#2079 follow-up — capacity 'well-utilised' reason widened", () => {
  it("the cargo well-utilised reason now fires for fillRatio in [0.2, 0.95]", () => {
    expect(ENGINE).toMatch(
      /if \(fillRatio >= 0\.2 && fillRatio <= 0\.95\)[\s\S]{0,100}?سعة المركبة مناسبة جداً للحمولة/,
    );
  });

  it("the legacy narrow [0.8, 0.95] band is no longer the EXECUTABLE cargo reason gate", () => {
    // The explanatory comment region intentionally still names
    // the old [0.8, 0.95] band so future readers see what was
    // wrong. Skip comments — pin the executable conditional
    // specifically.
    expect(ENGINE).not.toMatch(
      /^\s+if \(fillRatio >= 0\.8 && fillRatio <= 0\.95\)/m,
    );
  });
});

describe("#2079 follow-up — boundary intact", () => {
  it("no migration or schema change introduced", () => {
    expect(ENGINE).not.toMatch(/migrations\//);
  });

  it("no finance / GL / VRP / Reputation references introduced", () => {
    // Read just the touched region by anchoring on the new
    // marker comment (the audit's NaN-guard rationale block).
    const newRegion = ENGINE.match(
      /defensive NaN guard[\s\S]{0,1500}/,
    );
    expect(newRegion).toBeTruthy();
    expect(newRegion![0]).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore/,
    );
  });
});
