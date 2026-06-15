import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-01 — Passenger booking close → Accounting Candidate.
 *
 * Audit gap: cargo + rental hand off to the accountant queue at close;
 * passenger bookings did not. Closes the asymmetry by adding
 * `createPassengerBillingCandidate` mirroring the existing two, and
 * wiring it into the booking PATCH at the `completed` transition.
 *
 * Pins:
 *   • engine function exists with the right shape
 *   • idempotency anchor: (companyId, 'transport_booking_passenger', sourceId)
 *   • quantity = passengerCount, unitOfMeasure = 'pax'
 *   • skip when passengerCount <= 0 OR tripFamily != 'passenger'
 *   • fires from booking PATCH on transition INTO completed (not on
 *     idempotent re-PATCH while already completed)
 *   • soft-fail: candidate hiccup never rolls back the status change
 *   • no JE inside the new code path
 *
 * Live verification (A-01 / passenger close) intentionally separate
 * under `db:provision-agent` per the user's «لا ترحيل بـtypecheck فقط».
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const ENGINE   = read("lib/engines/fleetEngine.ts");
const BOOKINGS = read("routes/transport-bookings.ts");

describe("#2079 TA-T18-01 — engine: createPassengerBillingCandidate signature", () => {
  it("declares the function with the contract-shaped signature", () => {
    expect(ENGINE).toMatch(/async createPassengerBillingCandidate\(/);
    expect(ENGINE).toMatch(/createPassengerBillingCandidate[\s\S]{0,500}tripFamily: string \| null/);
    expect(ENGINE).toMatch(/createPassengerBillingCandidate[\s\S]{0,500}passengerCount: number \| null/);
    expect(ENGINE).toMatch(/createPassengerBillingCandidate[\s\S]{0,500}bookingNumber: string/);
  });

  it("skips when tripFamily is NOT 'passenger' (guard against cargo accidents)", () => {
    const block = ENGINE.slice(ENGINE.indexOf("createPassengerBillingCandidate"));
    expect(block).toMatch(/if \(booking\.tripFamily !== "passenger"\) return null/);
  });

  it("skips when passengerCount <= 0 (no billable headcount)", () => {
    const block = ENGINE.slice(ENGINE.indexOf("createPassengerBillingCandidate"));
    expect(block).toMatch(/if \(pax <= 0\) return null/);
  });
});

describe("#2079 TA-T18-01 — engine: idempotent INSERT shape mirrors cargo + rental", () => {
  const block = ENGINE.slice(
    ENGINE.indexOf("createPassengerBillingCandidate"),
    ENGINE.indexOf("postCargoDeliveryGL"),
  );

  it("uses ON CONFLICT (companyId, sourceType, sourceId) DO NOTHING + UNION-ALL existed-detection", () => {
    expect(block).toMatch(/ON CONFLICT \("companyId", "sourceType", "sourceId"\) DO NOTHING/);
    expect(block).toMatch(/SELECT id, TRUE AS existed/);
    expect(block).toMatch(/NOT EXISTS \(SELECT 1 FROM ins\)/);
  });

  it("sourceType = 'transport_booking_passenger' (new bucket, not cargo_manifest)", () => {
    expect(block).toMatch(/'transport_booking_passenger'/);
  });

  it("serviceType = 'passenger', operationalStatus = 'completed'", () => {
    expect(block).toMatch(/'passenger'/);
    expect(block).toMatch(/'completed'/);
  });

  it("quantity = passengerCount, unitOfMeasure = 'pax' (head-count billing)", () => {
    expect(block).toMatch(/quantity, "unitOfMeasure"/);
    expect(block).toMatch(/'pax'/);
    expect(block).toMatch(/\$10, 'pax'/);
  });

  it("does NOT set suggestedRevenue — passenger pricing is rule-driven downstream", () => {
    // Confirmed by absence of suggestedRevenue in the INSERT column list
    // (the rental version sets it from totalAmount + overageAmount; the
    // passenger version intentionally leaves pricing to transport_price_rules).
    const insertCols = block.slice(block.indexOf("INSERT INTO"), block.indexOf("VALUES"));
    expect(insertCols).not.toMatch(/suggestedRevenue/);
  });

  it("notes carry بsection-route وعدد الركاب for the accountant's first-pass review", () => {
    expect(block).toMatch(/نقل ركاب — حجز/);
    expect(block).toMatch(/راكب على المسار/);
  });

  it("emits fleet.passenger.billing_candidate.created only on fresh insert", () => {
    expect(block).toMatch(/if \(!row\.existed\)[\s\S]{0,200}fleet\.passenger\.billing_candidate\.created/);
  });
});

describe("#2079 TA-T18-01 — PATCH wiring: fires on transition INTO completed", () => {
  it("guarded on (b.status === 'completed' && existing.status !== 'completed')", () => {
    expect(BOOKINGS).toMatch(
      /if \(b\.status === "completed" && existing\.status !== "completed"\)/,
    );
  });

  it("joins LATERAL the latest non-cancelled dispatch_order to carry vehicle/driver dimensions", () => {
    const block = BOOKINGS.slice(BOOKINGS.indexOf("TA-T18-01"));
    expect(block).toMatch(/LEFT JOIN LATERAL/);
    expect(block).toMatch(/status NOT IN \('declined', 'cancelled'\)/);
    expect(block).toMatch(/ORDER BY id DESC LIMIT 1/);
  });

  it("soft-fails the candidate creation in try/catch (no rollback of the status change)", () => {
    const block = BOOKINGS.slice(BOOKINGS.indexOf("b.status === \"completed\""));
    expect(block).toMatch(/try \{/);
    expect(block).toMatch(/logger\.error\(err, "passenger billing candidate failed"\)/);
  });

  it("response now carries billingCandidateId so the SPA can deep-link", () => {
    expect(BOOKINGS).toMatch(/res\.json\(\{ data: \{ id, billingCandidateId: passengerCandidateId \} \}\)/);
  });

  it("imports fleetEngine from the engines index (single source of truth)", () => {
    expect(BOOKINGS).toMatch(/import \{ fleetEngine \} from "\.\.\/lib\/engines\/index\.js"/);
  });
});

describe("#2079 TA-T18-01 — boundary intact (no JE from transport surface)", () => {
  it("the PATCH block contains no postJournalEntry / journal_entries / writeJournal", () => {
    const start = BOOKINGS.indexOf("transportBookingsRouter.patch");
    const end = BOOKINGS.indexOf("transportBookingsRouter.post(\n  \"/transport/bookings/:id/lines\"");
    const patchBlock = BOOKINGS.slice(start, end);
    expect(patchBlock).not.toMatch(/postJournalEntry|journal_entries|writeJournal/);
  });

  it("engine function body contains no postJournalEntry / journal_entries / writeJournal", () => {
    const block = ENGINE.slice(
      ENGINE.indexOf("createPassengerBillingCandidate"),
      ENGINE.indexOf("postCargoDeliveryGL"),
    );
    expect(block).not.toMatch(/postJournalEntry|journal_entries|writeJournal/);
  });
});

describe("#2079 TA-T18-01 — symmetry with cargo + rental (canon respected)", () => {
  it("all four candidate creators share the same ON CONFLICT key shape", () => {
    // cargo / passenger / rental billing + maintenance expense (#TA-T18 finance-boundary).
    expect(ENGINE.match(/ON CONFLICT \("companyId", "sourceType", "sourceId"\) DO NOTHING/g)?.length).toBe(4);
  });
  it("the three sourceType strings are present and distinct", () => {
    expect(ENGINE).toContain("'cargo_manifest'");
    expect(ENGINE).toContain("'fleet_rental_contract'");
    expect(ENGINE).toContain("'transport_booking_passenger'");
  });
});
