import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 CHECK-PE-06 (owner decision 2026-06-14) — `same_class_only`
 * is LITERAL-STRICT.
 *
 * Before: when the booking carried `vehicleSubstitutionPolicy =
 * "same_class_only"` AND the candidate vehicle's `vehicleType` was
 * EQUIVALENT (not exact) to `requestedVehicleClass`, the engine
 * accepted it with agreementScore=85. That contradicted the
 * customer's literal contract — "نفس الفئة فقط" — by silently
 * downgrading them to an equivalent class.
 *
 * After: `same_class_only` honors the literal contract. Only the
 * exact `vehicleType === requestedVehicleClass` match scores 100.
 * An equivalent-class candidate drops to score=30 + a blocker
 * "سياسة الاستبدال تمنع تغيير الفئة (same_class_only)" — same
 * branch the `exact_only` policy already used.
 *
 * `equivalent_allowed` and `upgrade_allowed` still accept the
 * equivalent class (score 85); their contracts permit substitution.
 *
 * Per the owner's package-locality rule: static, regex-only.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ENGINE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/assignmentSuggestionEngine.ts"),
  "utf8",
);

describe("#2079 CHECK-PE-06 — `same_class_only` is literal-strict", () => {
  it("the agreement-score includes tuple no longer lists `same_class_only` (literal-strict)", () => {
    // The exact line the audit's CHECK-PE-06 calls out: when
    // vehicleType is equivalent (not literal) to requested, the
    // policy whitelist that returns 85 must NOT include
    // `same_class_only` anymore.
    expect(ENGINE).toMatch(
      /agreementScore = \["equivalent_allowed", "upgrade_allowed"\]\.includes\(/,
    );
  });

  it("the literal-strict decision carries an audit-grade comment + dated rationale", () => {
    expect(ENGINE).toMatch(
      /CHECK-PE-06 \(owner decision 2026-06-14\)[\s\S]{0,400}?LITERAL-STRICT/,
    );
  });

  it("`equivalent_allowed` and `upgrade_allowed` are still the only acceptable substitution policies for an equivalent vehicleType", () => {
    // Pin the exact 2-element tuple so a future edit that adds a
    // 3rd policy quietly is caught by this test.
    const block = ENGINE.match(
      /agreementScore = \["equivalent_allowed", "upgrade_allowed"\]\.includes\([\s\S]{0,200}?\? 85 : 30/,
    );
    expect(block, "agreement-score policy tuple not found").toBeTruthy();
    expect(block![0]).not.toMatch(/"same_class_only"/);
    expect(block![0]).not.toMatch(/"exact_only"/);
  });

  it("the exact `vehicleType === requestedVehicleClass` branch still scores 100 (regression pin)", () => {
    expect(ENGINE).toMatch(
      /v\.vehicleType === booking\.requestedVehicleClass[\s\S]{0,200}?agreementScore = 100/,
    );
  });

  it("rejection branch fires the same Arabic blocker the literal-strict policy now triggers", () => {
    // The blocker text already existed for `exact_only`; the fix
    // just routes `same_class_only` into the same branch now.
    expect(ENGINE).toMatch(
      /سياسة الاستبدال تمنع تغيير الفئة \(\$\{booking\.vehicleSubstitutionPolicy\}\)/,
    );
  });
});

describe("#2079 CHECK-PE-06 — boundary intact", () => {
  it("no migration / no DDL change", () => {
    const newRegion = ENGINE.match(
      /CHECK-PE-06[\s\S]{0,800}/,
    );
    expect(newRegion).toBeTruthy();
    expect(newRegion![0]).not.toMatch(/migrations\//);
  });

  it("no finance / GL / VRP / Reputation references introduced", () => {
    const newRegion = ENGINE.match(
      /CHECK-PE-06[\s\S]{0,800}/,
    );
    expect(newRegion).toBeTruthy();
    expect(newRegion![0]).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore/,
    );
  });
});
