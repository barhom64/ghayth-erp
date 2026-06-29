import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1812 — rental close → Accounting Candidate (الإيراد عند الإغلاق).
 *
 * User's directive: when a rental contract is returned/closed, its
 * revenue must hand off to the accountant queue as a
 * transport_billing_candidate — recognised over the rental DURATION
 * (التأجير على مدى المدة) — with NO journal entry posted from the
 * transport side. GL materialization for rentals is explicitly
 * deferred (لا تلمس دفتر الأستاذ) until the backend/Postgres phase.
 *
 * This test pins:
 *   1. fleetEngine.createRentalBillingCandidate exists and mirrors the
 *      cargo candidate's idempotent INSERT … ON CONFLICT shape.
 *   2. quantity is rental DAYS + unitOfMeasure 'day' (duration-based
 *      revenue recognition).
 *   3. suggestedRevenue = totalAmount + overageAmount.
 *   4. The /return endpoint calls it AFTER the close, soft-fail
 *      (candidate hiccup must not roll back the operational close).
 *   5. No GL call was added anywhere in the new code paths.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/engines/fleetEngine.ts"), "utf8");
const FLEET  = readFileSync(join(apiSrc, "routes/fleet.ts"), "utf8");

describe("#1812 — fleetEngine.createRentalBillingCandidate", () => {
  it("exists with the contract-shaped signature", () => {
    expect(ENGINE).toMatch(/async createRentalBillingCandidate\(/);
    expect(ENGINE).toMatch(/createRentalBillingCandidate[\s\S]{0,600}startDate: string/);
    expect(ENGINE).toMatch(/createRentalBillingCandidate[\s\S]{0,600}actualEndDate: string/);
  });

  it("idempotent on (companyId, fleet_rental_contract, sourceId) — mapper sets sourceType, shared writer owns ON CONFLICT", () => {
    const rentalBody = ENGINE.slice(ENGINE.indexOf("async createRentalBillingCandidate("));
    expect(rentalBody).toMatch(/sourceType: "fleet_rental_contract"/);
    const writer = ENGINE.slice(ENGINE.indexOf("async createBillingCandidate("), ENGINE.indexOf("async createCargoBillingCandidate("));
    expect(writer).toMatch(/ON CONFLICT \("companyId", "sourceType", "sourceId"\) DO NOTHING/);
  });

  it("quantity = rental days, unitOfMeasure = day (duration-based recognition)", () => {
    const block = ENGINE.slice(ENGINE.indexOf("async createRentalBillingCandidate("));
    expect(block).toMatch(/rentalDays/);
    expect(block).toMatch(/Math\.max\(1, Math\.round\(\(end\.getTime\(\) - start\.getTime\(\)\) \/ 86400000\) \+ 1\)/);
    expect(block).toMatch(/unitOfMeasure: "day"/);
  });

  it("suggestedRevenue combines totalAmount + overageAmount; zero-value contracts skip handoff", () => {
    const block = ENGINE.slice(ENGINE.indexOf("createRentalBillingCandidate"));
    expect(block).toMatch(/const revenue = baseRevenue \+ overage/);
    expect(block).toMatch(/if \(revenue <= 0\) return null/);
  });

  it("notes carry the rental period span so the accountant can spread revenue", () => {
    const block = ENGINE.slice(ENGINE.indexOf("createRentalBillingCandidate"));
    expect(block).toMatch(/إيجار مركبة للفترة/);
  });

  it("serviceType = rental, operationalStatus = returned", () => {
    const block = ENGINE.slice(ENGINE.indexOf("async createRentalBillingCandidate("));
    expect(block).toMatch(/serviceType: "rental"/);
    expect(block).toMatch(/operationalStatus: "returned"/);
  });

  it("emits fleet.rental.billing_candidate.created only on a fresh insert", () => {
    const block = ENGINE.slice(ENGINE.indexOf("async createRentalBillingCandidate("));
    expect(block).toMatch(/if \(r\?\.created\)[\s\S]{0,200}fleet\.rental\.billing_candidate\.created/);
  });
});

describe("#1812 — /rental-contracts/:id/return wires the handoff", () => {
  const returnBlock = FLEET.slice(
    FLEET.indexOf("/rental-contracts/:id/return"),
    FLEET.indexOf("/rental-contracts/:id/payments"),
  );

  it("calls fleetEngine.createRentalBillingCandidate after the close", () => {
    expect(returnBlock).toMatch(/fleetEngine\.createRentalBillingCandidate\(/);
  });

  it("soft-fails: candidate error is logged, close is not rolled back", () => {
    expect(returnBlock).toMatch(/\.catch\(\(e\) => \{ logger\.error\(e, "rental billing candidate failed"\); return null; \}\)/);
  });

  it("returns billingCandidateId so the SPA can deep-link the accountant queue", () => {
    expect(returnBlock).toMatch(/billingCandidateId: candidate\?\.id \?\? null/);
  });

  it("fallback close date uses the Riyadh-local helper, not UTC slice", () => {
    expect(returnBlock).toMatch(/currentDateInTz\(\)/);
    expect(returnBlock).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
  });

  it("still posts NO journal entry from the transport side", () => {
    expect(returnBlock).not.toMatch(/postJournalEntry|journal_entries|writeJournal|postCargoDeliveryGL/);
  });
});

describe("#1812 — deferred-GL boundary stays intact", () => {
  it("materialize endpoint gates on the supported source types (rental GL deferred by mandate)", () => {
    const CANDIDATES = readFileSync(
      join(apiSrc, "routes/transport-billing-candidates.ts"),
      "utf8",
    );
    // The materialiser posts GL only for the explicitly-supported fleet
    // source types; rental stays deferred (intentionally NOT in the set).
    expect(CANDIDATES).toMatch(/SUPPORTED_SOURCE_TYPES = \["cargo_manifest", "maintenance", "fuel", "insurance"\]/);
    expect(CANDIDATES).not.toMatch(/SUPPORTED_SOURCE_TYPES = \[[^\]]*rental/);
    expect(CANDIDATES).toMatch(/!SUPPORTED_SOURCE_TYPES\.includes\(candidate\.sourceType\)/);
    expect(CANDIDATES).toMatch(/غير مدعوم بعد للترحيل التلقائي/);
  });
});
