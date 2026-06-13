import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PASSENGER_LADDER,
  CARGO_LADDER,
  EQUIPMENT_LADDER,
  classFamily,
  evaluateLadder,
} from "../../src/lib/fleet/vehicleClassLadder.js";

/**
 * #2079 PE-07 — Per-family ladder (UPG-01).
 *
 * Owner's mandate (2026-06-11):
 *   «افصل ladder حسب العائلة... PE-07 لا يتجاوز VCM... إذا
 *    المركبة غير صالحة للركاب فلا تدخل ركاب مهما كانت الترقية...
 *    أي ladder عام مشترك ممنوع.»
 *
 * Boundary: scoring + reinforcing-blocker only; reads no DB; never
 * substitutes for the eligibility chain (Operating Window → VCM →
 * Vehicle Readiness → Driver Readiness).
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const LIB    = readFileSync(join(apiSrc, "lib/fleet/vehicleClassLadder.ts"), "utf8");

/* ── Ladder definitions ───────────────────────────────────────── */

describe("#2079 PE-07 — separate ladders by family", () => {
  it("PASSENGER_LADDER contains only passenger-family classes", () => {
    for (const c of PASSENGER_LADDER) {
      expect(classFamily(c), `${c} should be passenger family`).toBe("passenger");
    }
  });

  it("CARGO_LADDER contains only cargo-family classes", () => {
    for (const c of CARGO_LADDER) {
      expect(classFamily(c), `${c} should be cargo family`).toBe("cargo");
    }
  });

  it("EQUIPMENT_LADDER contains only equipment-family classes", () => {
    for (const c of EQUIPMENT_LADDER) {
      expect(classFamily(c), `${c} should be equipment family`).toBe("equipment");
    }
  });

  it("ladders do not share any element (no overlap → no mixed ladder)", () => {
    const pax = new Set(PASSENGER_LADDER);
    const car = new Set(CARGO_LADDER);
    const eq  = new Set(EQUIPMENT_LADDER);
    for (const c of pax) expect(car.has(c), `${c} double-classified`).toBe(false);
    for (const c of pax) expect(eq.has(c),  `${c} double-classified`).toBe(false);
    for (const c of car) expect(eq.has(c),  `${c} double-classified`).toBe(false);
  });

  it("unknown class falls through as 'unknown' (no enforcement, no behaviour change)", () => {
    expect(classFamily("space_shuttle")).toBe("unknown");
    expect(classFamily("")).toBe("unknown");
    expect(classFamily(null)).toBe("unknown");
    expect(classFamily(undefined)).toBe("unknown");
  });
});

/* ── Cross-family blockers ────────────────────────────────────── */

describe("#2079 PE-07 — cross-family blockers", () => {
  it("passenger trip with a cargo candidate (truck) is rejected with the exact Arabic message", () => {
    const v = evaluateLadder("sedan", "truck", "passenger");
    expect(v.crossesFamily).toBe(true);
    expect(v.isUpgrade).toBe(false);
    expect(v.reason).toBe("مرفوض: لا يجوز استخدام ladder الحمولة لرحلة ركاب");
  });

  it("cargo trip with a passenger candidate (bus_45) is rejected with the exact Arabic message", () => {
    const v = evaluateLadder("truck", "bus_45", "cargo");
    expect(v.crossesFamily).toBe(true);
    expect(v.reason).toBe("مرفوض: لا يجوز استخدام ladder الركاب لرحلة حمولة");
  });

  it("request vs candidate cross-family is rejected even when tripFamily is null", () => {
    // The booking didn't declare a tripFamily but the requested class
    // is passenger and the candidate is cargo — that's still a
    // structural mismatch we must block.
    const v = evaluateLadder("sedan", "truck", null);
    expect(v.crossesFamily).toBe(true);
    expect(v.reason).toMatch(/مرفوض/);
  });

  it("equipment vs passenger is not silently allowed", () => {
    const v = evaluateLadder("equipment", "sedan", null);
    expect(v.crossesFamily).toBe(true);
  });
});

/* ── Within-family upgrades ───────────────────────────────────── */

describe("#2079 PE-07 — within-family upgrades", () => {
  it("sedan → suv within passenger family is an upgrade with the passenger reason", () => {
    const v = evaluateLadder("sedan", "suv", "passenger");
    expect(v.crossesFamily).toBe(false);
    expect(v.isUpgrade).toBe(true);
    expect(v.reason).toBe("تم توسيع الترشيح داخل عائلة الركاب لعدم توفر مطابقة دقيقة");
  });

  it("truck → trailer within cargo family is an upgrade with the cargo reason", () => {
    const v = evaluateLadder("truck", "trailer", "cargo");
    expect(v.crossesFamily).toBe(false);
    expect(v.isUpgrade).toBe(true);
    expect(v.reason).toBe("تم ترشيح مركبة بسعة أعلى داخل عائلة الحمولة");
  });

  it("bus_45 → bus_22 is NOT an upgrade (downgrade direction)", () => {
    const v = evaluateLadder("bus_45", "bus_22", "passenger");
    expect(v.isUpgrade).toBe(false);
    expect(v.crossesFamily).toBe(false);
  });

  it("same class on both sides yields neither upgrade nor cross-family", () => {
    const v = evaluateLadder("sedan", "sedan", "passenger");
    expect(v.isUpgrade).toBe(false);
    expect(v.crossesFamily).toBe(false);
    expect(v.reason).toBeNull();
  });

  it("trip family wins: passenger trip + cargo candidate → blocker even when requestedClass is also cargo", () => {
    // Data-entry: someone asked for "truck" on a passenger booking
    // and the candidate is "trailer". The trip family STILL blocks it.
    const v = evaluateLadder("truck", "trailer", "passenger");
    expect(v.crossesFamily).toBe(true);
    expect(v.reason).toBe("مرفوض: لا يجوز استخدام ladder الحمولة لرحلة ركاب");
  });
});

/* ── Engine wiring ────────────────────────────────────────────── */

describe("#2079 PE-07 — engine wires the per-family ladder", () => {
  it("imports evaluateLadder from the canonical module path", () => {
    expect(ENGINE).toMatch(/from "\.\/vehicleClassLadder\.js"/);
    expect(ENGINE).toMatch(/evaluateLadder/);
  });

  it("threads tripFamily into evaluateLadder so the trip context drives the decision", () => {
    expect(ENGINE).toMatch(/evaluateLadder\(\s*booking\.requestedVehicleClass,\s*v\.vehicleType,\s*tripFamily,?\s*\)/);
  });

  it("crossesFamily turns into a HARD blocker (agreementScore = 0)", () => {
    const block = ENGINE.slice(ENGINE.indexOf("PE-07 — ladder evaluation"));
    expect(block).toMatch(/if \(ladder\.crossesFamily\) \{\s*\n\s*agreementScore = 0;/);
    expect(block).toMatch(/blockers\.push\(ladder\.reason!\)/);
  });

  it("within-family upgrade rewards 70 when policy allows, else 20 + blocker", () => {
    const block = ENGINE.slice(ENGINE.indexOf("PE-07 — ladder evaluation"));
    expect(block).toMatch(/booking\.allowUpgrade \|\| booking\.vehicleSubstitutionPolicy === "upgrade_allowed"/);
    expect(block).toMatch(/agreementScore = 70;/);
    expect(block).toMatch(/agreementScore = 20;[\s\S]{0,200}اتفاق العميل لا يسمح بترقية فئة المركبة/);
  });

  it("legacy mixed UPGRADE_LADDER + isUpgrade are removed (no shared ladder remains)", () => {
    expect(ENGINE).not.toMatch(/const UPGRADE_LADDER = \[/);
    expect(ENGINE).not.toMatch(/function isUpgrade\(/);
  });

  it("equivalence path (existing CLASS_EQUIVALENCES) is preserved verbatim", () => {
    expect(ENGINE).toMatch(/classesAreEquivalent\(booking\.requestedVehicleClass, v\.vehicleType\)/);
  });
});

/* ── Boundary: PE-07 does not bypass higher-priority guards ────── */

describe("#2079 PE-07 — does NOT bypass eligibility chain", () => {
  it("VCM eligibility pre-loop runs BEFORE the agreement scorer in the engine", () => {
    const vcmIdx       = ENGINE.indexOf("isEligibleForTripFamily(vcm, tripFamily");
    const ladderIdx    = ENGINE.indexOf("evaluateLadder(");
    expect(vcmIdx).toBeGreaterThan(0);
    expect(vcmIdx).toBeLessThan(ladderIdx);
  });

  it("vehicle readiness ejection precedes the agreement scorer too", () => {
    const readyIdx  = ENGINE.indexOf("checkVehicleDocumentReadiness(v, end)");
    const ladderIdx = ENGINE.indexOf("evaluateLadder(");
    expect(readyIdx).toBeGreaterThan(0);
    expect(readyIdx).toBeLessThan(ladderIdx);
  });

  it("driver readiness ejection precedes the agreement scorer too", () => {
    const driverIdx = ENGINE.indexOf("checkDriverLeave(d.employeeId");
    const ladderIdx = ENGINE.indexOf("evaluateLadder(");
    expect(driverIdx).toBeGreaterThan(0);
    expect(driverIdx).toBeLessThan(ladderIdx);
  });

  it("operating window guard fires BEFORE the candidate loop (and so before ladder)", () => {
    const windowIdx = ENGINE.indexOf("const windowVerdict = checkOperatingWindow");
    const ladderIdx = ENGINE.indexOf("evaluateLadder(");
    expect(windowIdx).toBeGreaterThan(0);
    expect(windowIdx).toBeLessThan(ladderIdx);
  });

  it("ladder cross-family blocker still flows through the existing blockers ternary (no score override)", () => {
    // `score: blockers.length > 0 ? 0 : finalScore` — a ladder blocker
    // forces score=0 like any other hard blocker; continuity bonus
    // cannot revive a cross-family candidate.
    expect(ENGINE).toMatch(/score: blockers\.length > 0/);
  });
});

/* ── Boundary: explicitly prohibited side effects ──────────────── */

describe("#2079 PE-07 — strict scope (owner-mandated negatives)", () => {
  it("ladder lib is finance-blackout (no price/cost/invoice/amount/journal)", () => {
    expect(LIB).not.toMatch(/price|cost|revenue|invoice|amount|journal|ledger/i);
  });

  it("engine still has no GL / journal helper imports", () => {
    expect(ENGINE).not.toMatch(/financeJournalEngine|journalEngine|postingEngine|financialEngine/);
  });

  it("ladder lib does not touch reputation / VRP / Optimizer / TSP code surfaces", () => {
    // Allow the words in the boundary-comment manifesto; refuse any
    // actual identifier that would tie this module to those systems.
    expect(LIB).not.toMatch(/reputationScore|driverReputation|reputation:|fromReputation/);
    expect(LIB).not.toMatch(/vrp[A-Z]|optimizer[A-Z]|tspSolver|fromTsp/i);
  });

  it("umrahFamiliarity (PE-06) is unchanged in logic — still scoring only, no ladder/blocker entanglement", () => {
    expect(LIB).not.toMatch(/umrahFamiliarity|umrahGroupId/);
    const block = ENGINE.slice(ENGINE.indexOf("─ umrahFamiliarity"));
    expect(block.slice(0, 1500)).not.toMatch(/evaluateLadder|crossesFamily/);
  });

  it("continuity bonus (PE-05) does NOT survive a ladder cross-family blocker", () => {
    // Conceptually: a blocker forces score=0 and the continuity bonus
    // is added only when blockers.length === 0. The structural pin
    // (PE-05 file already tests it). Sanity recheck here:
    expect(ENGINE).toMatch(/continuityBonus = 0;[\s\S]{0,400}blockers\.length === 0/);
  });
});
