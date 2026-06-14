import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-05 — VCM completeness parity (static, regex-only).
 *
 * The SPA module `vcm-completeness.ts` MUST mirror the server's
 * `SAFETY_FIELDS` array in `vehicleCapabilityMatrix.ts`. Both lists
 * are read as plain text and the field SETS compared verbatim — no
 * SPA runtime import on the api-server side (per the owner's rule:
 * tests in api-server stay package-local).
 *
 * The parity guarantees:
 *   • Gate-PE-1's eligibility decision is reproducible client-side.
 *   • Operator's completeness badge never disagrees with the engine.
 *   • Adding a new safety field on either side fails the build
 *     until both sides catch up.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const SERVER_LIB = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/vehicleCapabilityMatrix.ts"),
  "utf8",
);
const SPA_LIB = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/lib/vcm-completeness.ts"),
  "utf8",
);

function parseSafetyFields(src: string, decl: RegExp): string[] {
  const m = src.match(decl);
  if (!m) throw new Error("Cannot locate SAFETY_FIELDS array");
  return [...m[1].matchAll(/["']([a-zA-Z]+)["']/g)].map((mm) => mm[1]);
}

const SERVER_FIELDS = parseSafetyFields(
  SERVER_LIB,
  /SAFETY_FIELDS[\s\S]*?\[([\s\S]+?)\];/,
);
const SPA_FIELDS = parseSafetyFields(
  SPA_LIB,
  /VCM_SAFETY_FIELDS\s*=\s*\[([\s\S]+?)\]/,
);

/* ── Parity ─────────────────────────────────────────────────── */

describe("#2079 TA-T18-05 — VCM completeness static parity", () => {
  it("server SAFETY_FIELDS has 11 entries (sanity)", () => {
    expect(SERVER_FIELDS.length).toBe(11);
  });

  it("SPA VCM_SAFETY_FIELDS has the same length as the server", () => {
    expect(SPA_FIELDS.length).toBe(SERVER_FIELDS.length);
  });

  it("the SETS are identical (no missing, no extra, order-independent)", () => {
    const serverSet = new Set(SERVER_FIELDS);
    const spaSet = new Set(SPA_FIELDS);
    for (const f of serverSet) {
      expect(spaSet.has(f), `SPA missing safety field "${f}"`).toBe(true);
    }
    for (const f of spaSet) {
      expect(serverSet.has(f), `SPA has extra safety field "${f}" not on server`).toBe(true);
    }
  });

  it("the ORDER is identical too (so completeness rounding agrees)", () => {
    // Math.round((populated/11)*100) is order-independent, but a
    // future scorer might use the order — pin it now to avoid drift.
    expect(SPA_FIELDS).toEqual(SERVER_FIELDS);
  });

  it("the threshold constant VCM_MIN_COMPLETENESS = 70 matches both sides", () => {
    expect(SERVER_LIB).toMatch(/VCM_MIN_COMPLETENESS = 70/);
    expect(SPA_LIB).toMatch(/VCM_MIN_COMPLETENESS = 70/);
  });
});

/* ── Form structure ─────────────────────────────────────────── */

describe("#2079 TA-T18-05 — vehicle-detail VCM tab wiring", () => {
  const DETAIL = readFileSync(
    join(repoRoot, "artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx"),
    "utf8",
  );
  const FORM = readFileSync(
    join(repoRoot, "artifacts/ghayth-erp/src/components/shared/vehicle-capability-matrix-form.tsx"),
    "utf8",
  );

  it("vehicle-detail imports the VCM form from the canonical path", () => {
    expect(DETAIL).toMatch(/from "@\/components\/shared\/vehicle-capability-matrix-form"/);
    expect(DETAIL).toMatch(/VehicleCapabilityMatrixForm/);
  });

  it("vehicle-detail declares a 'vcm' tab in TABS and renders the form for it", () => {
    expect(DETAIL).toMatch(/key:\s*"vcm"/);
    expect(DETAIL).toMatch(/activeTab === "vcm"/);
  });

  it("the form's canEdit is gated by the existing fleet.vehicles:update permission", () => {
    expect(DETAIL).toMatch(/usePermission\("fleet\.vehicles:update"\)/);
    expect(DETAIL).toMatch(/canEdit=\{canEditVehicle\}/);
  });

  it("the PATCH uses the existing endpoint, no new route", () => {
    expect(FORM).toMatch(/PATCH\s+\/fleet\/vehicles\/:id|apiFetch\(`\/fleet\/vehicles\/\$\{vehicleId\}`/);
    expect(FORM).not.toMatch(/method:\s*["']POST["']/);
  });

  it("numbers serialize as null when empty (never 0)", () => {
    expect(FORM).toMatch(/function numOrNull\(v: unknown\)/);
    expect(FORM).toMatch(/if \(v === "" \|\| v === null \|\| v === undefined\) return null/);
  });

  it("safetyFeatures + equipmentAttachments validate as JSON string-array before save", () => {
    expect(FORM).toMatch(/safetyValid/);
    expect(FORM).toMatch(/equipmentValid/);
    // Save button disabled when either is invalid.
    expect(FORM).toMatch(/disabled=\{busy \|\| !safetyValid \|\| !equipmentValid\}/);
  });

  it("vehicleServiceTypes sent as array or null (never empty array)", () => {
    expect(FORM).toMatch(/form\.vehicleServiceTypes && form\.vehicleServiceTypes\.length > 0\s*\?\s*form\.vehicleServiceTypes\s*:\s*null/);
  });

  it("the SAFETY_FIELDS subset is named in the UI hint so the operator doesn't misread the %", () => {
    expect(FORM).toMatch(/حقول السلامة\/الاكتمال\s+المعتمدة في محرّك الإسناد/);
  });
});

/* ── Boundary pins ──────────────────────────────────────────── */

describe("#2079 TA-T18-05 — boundary intact (UI-only client change)", () => {
  const FORM = readFileSync(
    join(repoRoot, "artifacts/ghayth-erp/src/components/shared/vehicle-capability-matrix-form.tsx"),
    "utf8",
  );
  const SPA_LIB_2 = SPA_LIB;

  it("form lib does not reference finance / GL / journal / invoice symbols", () => {
    expect(FORM).not.toMatch(/journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger/);
  });

  it("form lib does not reference VRP / Driver Reputation / Print Engine", () => {
    expect(FORM).not.toMatch(/reputationScore|driverReputation|vrp[A-Z]|optimizer[A-Z]|printEngine/);
  });

  it("vcm-completeness.ts is data-only — no fetch / DOM / engine imports", () => {
    expect(SPA_LIB_2).not.toMatch(/fetch\(|apiFetch|window\.|document\.|assignmentSuggestionEngine/);
  });

  it("does not introduce a new migration file in this PR", () => {
    // A defensive structural check: the test file itself runs in
    // api-server, but the PR adds NO migration. Spot-check that the
    // new lib doesn't reach into migrations directory.
    expect(FORM).not.toMatch(/migrations\//);
    expect(SPA_LIB_2).not.toMatch(/migrations\//);
  });
});
