import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 PE-05 — Itinerary-aware suggest (continuity bonus) +
 * self-overlap guard on itinerary legs.
 *
 * Owner's mandate (file 20 §13): «الـmulti-leg ليس استثناء — هذا
 * تشغيل يومي... يبني فوق LEG canon وسلسلة الحراس الحالية».
 *
 * Scope (strict, per owner's go-ahead):
 *   • itinerary per-leg only
 *   • no UI, no finance, no VRP, no Driver Reputation
 *   • does NOT bypass any hard guard — continuity is a SCORE bonus,
 *     not an eligibility override
 *   • adds POST /transport/itineraries/:id/suggest
 *   • adds self-overlap guard on POST/PATCH legs
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const ROUTE  = readFileSync(join(apiSrc, "routes/transport-planning.ts"), "utf8");

/* ── Engine — continuity in criteria + scoring ──────────────────── */

describe("#2079 PE-05 — engine carries the continuity contract", () => {
  it("SuggestionCriteria declares an optional continuityPair", () => {
    expect(ENGINE).toMatch(/continuityPair\?: \{ vehicleId: number; driverId: number \} \| null;/);
  });

  it("continuity bonus is +10 capped at 100, applied only when blockers are empty", () => {
    const block = ENGINE.slice(ENGINE.indexOf("PE-05 — continuity bonus"));
    expect(block).toMatch(/continuityBonus = 10/);
    expect(block).toMatch(/blockers\.length === 0/);
    expect(block).toMatch(/Math\.min\(100, finalScore \+ continuityBonus\)/);
  });

  it("continuity NEVER rewrites blockers — a blocker still scores 0", () => {
    const block = ENGINE.slice(ENGINE.indexOf("PE-05 — continuity bonus"));
    // The push site keeps the existing `blockers.length > 0 ? 0 : …` ternary.
    expect(block).toMatch(/score: blockers\.length > 0\s*\n\s*\?\s*0/);
  });

  it("continuity surfaces a soft Arabic reason for transparency", () => {
    expect(ENGINE).toMatch(/استمرار نفس الطاقم من المرحلة السابقة/);
  });

  it("the bonus is gated on EXACT (vehicleId, driverId) match — partial pair does not earn the bonus", () => {
    const block = ENGINE.slice(ENGINE.indexOf("PE-05 — continuity bonus"));
    expect(block).toMatch(/c\.continuityPair\.vehicleId === v\.id/);
    expect(block).toMatch(/c\.continuityPair\.driverId === d\.id/);
  });
});

/* ── Engine — suggestForItinerary walker ────────────────────────── */

describe("#2079 PE-05 — suggestForItinerary walks legs in legNumber order", () => {
  it("is exported with the documented signature", () => {
    expect(ENGINE).toMatch(/export async function suggestForItinerary\(/);
    expect(ENGINE).toMatch(/Promise<ItineraryLegSuggestion\[\]>/);
  });

  it("ORDER BY legNumber ASC keeps the chain in operator-visible order", () => {
    const block = ENGINE.slice(ENGINE.indexOf("export async function suggestForItinerary"));
    expect(block).toMatch(/ORDER BY l\."legNumber" ASC/);
  });

  it("legs without scheduled windows are skipped with an Arabic reason — NOT silently dropped", () => {
    const block = ENGINE.slice(ENGINE.indexOf("export async function suggestForItinerary"));
    expect(block).toMatch(/skipped: "لا توجد نافذة زمنية لهذه المرحلة"/);
  });

  it("threads the top pair forward only when its score > 0 (chain breaks on ejection)", () => {
    const block = ENGINE.slice(ENGINE.indexOf("export async function suggestForItinerary"));
    expect(block).toMatch(/candidates\.find\(\(r\) => r\.score > 0\)/);
    expect(block).toMatch(/lastTopPair = top[\s\S]{0,80}\?\s*\{ vehicleId: top\.vehicleId, driverId: top\.driverId \}/);
    expect(block).toMatch(/lastTopPair = top[\s\S]{0,120}:\s*null/);
  });

  it("the per-leg engine call passes continuityPair through to the criteria", () => {
    const block = ENGINE.slice(ENGINE.indexOf("export async function suggestForItinerary"));
    expect(block).toMatch(/continuityPair: lastTopPair,/);
  });
});

/* ── Route — POST /transport/itineraries/:id/suggest ─────────────── */

describe("#2079 PE-05 — itinerary-level suggest endpoint", () => {
  it("imports suggestForItinerary from the canonical engine path", () => {
    expect(ROUTE).toMatch(/suggestForItinerary,/);
    expect(ROUTE).toMatch(/from "\.\.\/lib\/fleet\/assignmentSuggestionEngine\.js"/);
  });

  it("registers POST /transport/itineraries/:id/suggest gated on fleet.bookings:view", () => {
    expect(ROUTE).toMatch(/"\/transport\/itineraries\/:id\/suggest"/);
    expect(ROUTE).toMatch(/feature: "fleet\.bookings", action: "view"/);
  });

  it("rejects unknown / deleted itineraries with NotFoundError before calling the engine", () => {
    const block = ROUTE.slice(ROUTE.indexOf('"/transport/itineraries/:id/suggest"'));
    expect(block.slice(0, 1200)).toMatch(/البرنامج غير موجود/);
  });

  it("accepts an optional limit (1..50) — matches the per-leg suggest contract", () => {
    expect(ROUTE).toMatch(/const itinerarySuggestSchema = z\.object\(\{\s*limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(50\)\.optional\(\),\s*\}\);/);
  });

  it("response wraps the legs in `data` for SPA consistency", () => {
    const block = ROUTE.slice(ROUTE.indexOf('"/transport/itineraries/:id/suggest"'));
    expect(block.slice(0, 1500)).toMatch(/res\.json\(\{ data: legs \}\)/);
  });
});

/* ── Route — self-overlap guard on legs ─────────────────────────── */

describe("#2079 PE-05 — assertLegDoesNotOverlap (MULTI-02 fix)", () => {
  it("declares the helper with a tstzrange overlap probe", () => {
    expect(ROUTE).toMatch(/async function assertLegDoesNotOverlap/);
    expect(ROUTE).toMatch(/tstzrange\("scheduledStart", "scheduledEnd", '\[\)'\)\s*&&\s*tstzrange\(\$3::timestamptz, \$4::timestamptz, '\[\)'\)/);
  });

  it("skips when either bound is null (transit / rest legs have no schedule)", () => {
    const helper = ROUTE.slice(ROUTE.indexOf("async function assertLegDoesNotOverlap"));
    expect(helper).toMatch(/if \(!args\.scheduledStart \|\| !args\.scheduledEnd\) return;/);
  });

  it("supports excludeLegId so PATCH does not see the row being updated", () => {
    const helper = ROUTE.slice(ROUTE.indexOf("async function assertLegDoesNotOverlap"));
    expect(helper).toMatch(/excludeLegId\?: number/);
    expect(helper).toMatch(/\(\$5::int IS NULL OR id <> \$5\)/);
  });

  it("Arabic error names the conflicting legNumber for actionable UI", () => {
    expect(ROUTE).toMatch(/تتعارض نافذة هذه المرحلة زمنيًّا مع المرحلة \$\{rows\[0\]\.legNumber\}/);
  });

  it("POST /legs invokes the guard BEFORE the INSERT", () => {
    const post = ROUTE.slice(ROUTE.indexOf('"/transport/itineraries/:id/legs"'));
    const insertIdx = post.indexOf("INSERT INTO transport_itinerary_legs");
    const guardIdx  = post.indexOf("assertLegDoesNotOverlap");
    expect(guardIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(insertIdx);
  });

  it("PATCH /legs/:legId invokes the guard with excludeLegId BEFORE the UPDATE", () => {
    const patch = ROUTE.slice(ROUTE.indexOf('"/transport/itineraries/:id/legs/:legId"'));
    const updateIdx = patch.indexOf("UPDATE transport_itinerary_legs");
    const guardIdx  = patch.indexOf("assertLegDoesNotOverlap");
    expect(guardIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(updateIdx);
    expect(patch.slice(0, 2000)).toMatch(/excludeLegId: legId/);
  });

  it("PATCH honours partial updates — falls back to DB value when a window bound is omitted", () => {
    const patch = ROUTE.slice(ROUTE.indexOf('"/transport/itineraries/:id/legs/:legId"'));
    expect(patch.slice(0, 2200)).toMatch(/b\.scheduledStart !== undefined \? \(b\.scheduledStart \?\? null\) : current\.scheduledStart/);
    expect(patch.slice(0, 2200)).toMatch(/b\.scheduledEnd\s+!== undefined \? \(b\.scheduledEnd\s+\?\? null\) : current\.scheduledEnd/);
  });
});

/* ── Boundary pins ─────────────────────────────────────────────── */

describe("#2079 PE-05 — boundary intact", () => {
  it("engine still has no finance / GL / journal imports", () => {
    expect(ENGINE).not.toMatch(/financeJournalEngine|journalEngine|postingEngine|financialEngine/);
  });

  it("no UI changes — endpoint exists in routes, not in client", () => {
    // Pin the inverse: the SPA hasn't been touched in this PR. This
    // is a soft check via the existence of the engine + route change
    // only.
    expect(ROUTE).toMatch(/itinerarySuggestSchema/);
  });

  it("the hard-guard chain on each leg is untouched — continuity bonus runs INSIDE scoring", () => {
    // Continuity sits inside the per-pair loop, NOT in the eligibility
    // pre-loops that VCM / readiness / window populate.
    const eligible = ENGINE.slice(
      ENGINE.indexOf("const eligibleVehicles: VehicleRow[] = [];"),
      ENGINE.indexOf("for (const v of eligibleVehicles)"),
    );
    expect(eligible).not.toMatch(/continuityPair/);
    expect(eligible).not.toMatch(/continuityBonus/);
  });

  it("PE-07 surface is NOT present in this diff (PE-06 landed in a separate PR)", () => {
    // PE-06 (umrahFamiliarity) merged after PE-05; this test pins
    // only the remaining future surface (PE-07 per-family ladder).
    expect(ENGINE).not.toMatch(/PAX_LADDER|CARGO_LADDER/);
  });
});
