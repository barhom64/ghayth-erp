import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-11 (TPL-02) — rental delivery/return docket print.
 *
 * The audit gap before this PR: there was no print docket for the
 * rental handover/return flow. Operators had to hand the customer
 * a verbal "تسلَّمت المركبة في حالة كذا"; auditors had no paper trail
 * for the handover odometer/fuel reading or the return delta.
 *
 * This PR wires a single Print Engine preset
 * (`fleet_rental_handover_return_classic`, entityType `fleet_rental_contract`)
 * that renders the handover block when the contract has been
 * handed over (`hasHandover`) and the return block when returned
 * (`hasReturn`). One docket, one preset, one click — the operator's
 * mental model is "the rental docket", not two documents.
 *
 * All template fields come from migration 293 columns the loader
 * already projects: handoverOdometer / handoverFuelLevel /
 * handoverNotes / handoverAt and the return-side counterparts.
 *
 * Per the owner's package-locality rule: this test stays in
 * api-server and reads the SPA file as plain text.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const RESOLVER = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/print/templateResolver.ts"),
  "utf8",
);
const LOADER = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/print/dataLoader.ts"),
  "utf8",
);
const RENTAL_DETAIL = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/rental-detail.tsx"),
  "utf8",
);

/* ── 1. Registry: fleet_rental_contract → builder ─────────────────── */

describe("#2079 TA-T18-11 — rental preset is registered", () => {
  it("fleet_rental_contract entityType resolves to the new builder", () => {
    expect(RESOLVER).toMatch(
      /fleet_rental_contract:\s*\(\)\s*=>\s*buildRentalHandoverReturnPreset\(\)/,
    );
  });

  it("fleet_rental_handover + fleet_rental_return aliases also resolve to the same preset", () => {
    expect(RESOLVER).toMatch(
      /fleet_rental_handover:\s*\(\)\s*=>\s*buildRentalHandoverReturnPreset\(\)/,
    );
    expect(RESOLVER).toMatch(
      /fleet_rental_return:\s*\(\)\s*=>\s*buildRentalHandoverReturnPreset\(\)/,
    );
  });
});

/* ── 2. Preset metadata + the conditional blocks ────────────── */

describe("#2079 TA-T18-11 — preset shape", () => {
  it("declares presetKey=rental_handover_return_classic + entityType=fleet_rental_contract", () => {
    expect(RESOLVER).toMatch(
      /presetKey:\s*"rental_handover_return_classic"[\s\S]{0,80}?entityType:\s*"fleet_rental_contract"/,
    );
  });

  it("has the Arabic name «محضر تسليم/إرجاع التأجير»", () => {
    expect(RESOLVER).toMatch(/name:\s*"محضر تسليم\/إرجاع التأجير"/);
  });

  it("renders the handover block conditionally on entity.hasHandover", () => {
    expect(RESOLVER).toMatch(/\{\{#if entity\.hasHandover\}\}/);
    // The handover block must surface the canonical migration-293 fields.
    expect(RESOLVER).toMatch(/\{\{entity\.handoverAt\}\}/);
    expect(RESOLVER).toMatch(/\{\{entity\.handoverOdometer\}\}/);
  });

  it("renders the return block conditionally on entity.hasReturn", () => {
    expect(RESOLVER).toMatch(/\{\{#if entity\.hasReturn\}\}/);
    expect(RESOLVER).toMatch(/\{\{entity\.returnedAt\}\}/);
    expect(RESOLVER).toMatch(/\{\{entity\.returnOdometer\}\}/);
    expect(RESOLVER).toMatch(/\{\{entity\.overageAmount\}\}/);
  });

  it("two signature lines (المؤجِّر + المستأجِر) — no driver/courier blocks bleeding in from the BoL template", () => {
    expect(RESOLVER).toMatch(/المؤجِّر[\s\S]{0,300}?المستأجِر/);
    // The cargo-side roles (الشاحن / المستلم) must not appear in the
    // rental docket region — those belong to the BoL template.
    const rentalBlock = RESOLVER.match(
      /buildRentalHandoverReturnPreset[\s\S]+?\n\}\n/,
    );
    expect(rentalBlock, "rental preset block not found").toBeTruthy();
    expect(rentalBlock![0]).not.toMatch(/>\s*الشاحن\s*</);
    expect(rentalBlock![0]).not.toMatch(/>\s*المستلم\s*</);
  });
});

/* ── 3. Data loader projects the migration-293 columns + flags ─ */

describe("#2079 TA-T18-11 — loadRentalContract projects the right columns", () => {
  it("the switch routes fleet_rental_contract / fleet_rental_handover / fleet_rental_return to loadRentalContract", () => {
    const block = LOADER.match(
      /case\s+"fleet_rental_contract":[\s\S]{0,300}?return await loadRentalContract/,
    );
    expect(block, "fleet_rental_contract case not found in loader").toBeTruthy();
    expect(LOADER).toMatch(/case\s+"fleet_rental_handover":/);
    expect(LOADER).toMatch(/case\s+"fleet_rental_return":/);
  });

  it("the SELECT pulls the migration-293 columns directly + the canonical JOINs", () => {
    // SELECT rc.* gives us the new columns transparently; the
    // explicit JOIN aliases must surface the vehicle / client /
    // driver names the template references.
    expect(LOADER).toMatch(
      /loadRentalContract[\s\S]+?SELECT rc\.\*,[\s\S]{0,200}?v\."plateNumber"[\s\S]+?LEFT JOIN clients c[\s\S]+?LEFT JOIN fleet_drivers d/,
    );
  });

  it("the loader pre-computes hasHandover / hasReturn flags for the template's conditionals", () => {
    expect(LOADER).toMatch(/hasHandover:\s*!!contract\.handoverAt/);
    expect(LOADER).toMatch(/hasReturn:\s*!!contract\.returnedAt/);
  });

  it("the loader pre-computes a 0..100 fuel-level percentage (Mustache can't multiply)", () => {
    expect(LOADER).toMatch(/fuelLevelPct:[\s\S]{0,200}?Math\.round\(Number\(contract\.handoverFuelLevel\)\s*\*\s*100\)/);
    expect(LOADER).toMatch(/returnFuelLevelPct:[\s\S]{0,200}?Math\.round\(Number\(contract\.returnFuelLevel\)\s*\*\s*100\)/);
  });
});

/* ── 4. SPA: print button on rental-detail ──────────────────── */

describe("#2079 TA-T18-11 — rental-detail surfaces the print button", () => {
  it("imports PrintButton from the canonical path", () => {
    expect(RENTAL_DETAIL).toMatch(
      /import\s*\{\s*PrintButton\s*\}\s*from\s*"@\/components\/shared\/print-button"/,
    );
  });

  it("renders <PrintButton entityType=\"fleet_rental_contract\" entityId={c.id} />", () => {
    expect(RENTAL_DETAIL).toMatch(
      /<PrintButton[\s\S]{0,120}?entityType="fleet_rental_contract"[\s\S]{0,80}?entityId=\{c\.id\}/,
    );
  });
});

/* ── 5. Boundary intact ─────────────────────────────────────── */

describe("#2079 TA-T18-11 — boundary intact", () => {
  it("no new migration file referenced from the new preset / loader region", () => {
    const rentalBlock = RESOLVER.match(
      /buildRentalHandoverReturnPreset[\s\S]+?\n\}\n/,
    );
    expect(rentalBlock).toBeTruthy();
    expect(rentalBlock![0]).not.toMatch(/migrations\//);
    const loaderBlock = LOADER.match(
      /async function loadRentalContract[\s\S]+?\n\}\n/,
    );
    expect(loaderBlock).toBeTruthy();
    expect(loaderBlock![0]).not.toMatch(/migrations\//);
  });

  it("no finance / GL / journal / invoice / VRP / Reputation references introduced", () => {
    const rentalBlock = RESOLVER.match(
      /buildRentalHandoverReturnPreset[\s\S]+?\n\}\n/,
    );
    expect(rentalBlock).toBeTruthy();
    expect(rentalBlock![0]).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore/,
    );
  });

  it("the existing cargo_manifest preset registration is preserved (regression pin)", () => {
    expect(RESOLVER).toMatch(
      /cargo_manifest:\s*\(\)\s*=>\s*buildCargoManifestPreset\(\)/,
    );
  });
});
