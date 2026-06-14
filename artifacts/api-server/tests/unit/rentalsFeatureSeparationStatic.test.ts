import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-09 — separate `fleet.rentals` RBAC feature
 * (static, regex-only).
 *
 * The gap the audit (PERM-02) flagged: every rental-lifecycle
 * endpoint authorized under `fleet.vehicles`. That meant a clerk
 * who needed `fleet.vehicles:update` to activate a rental ALSO got
 * full vehicle-row CRUD as a side effect — least-privilege break.
 *
 * This test pins the four contract points the fix must hold:
 *
 *   1. The RBAC catalog has a dedicated `fleet.rentals` feature
 *      with `approvableActions: ["approve"]` (mirrors fleet.bookings
 *      after TA-T18-08).
 *
 *   2. Every rental-lifecycle endpoint in fleet.ts authorizes on
 *      `fleet.rentals`, not `fleet.vehicles`. handover + return —
 *      both decision moves — use `action: "approve"`.
 *
 *   3. Vehicle CRUD endpoints (a different feature surface) stay
 *      on `fleet.vehicles` — the split is surgical, not a
 *      blanket rename.
 *
 *   4. The SPA sidebar entry uses `fleet.rentals:list` (no leftover
 *      `fleet.vehicles:list` for the rental link).
 *
 * Per the owner's package-locality rule: this test stays in
 * api-server and reads the SPA file as plain text — never imports
 * SPA runtime.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const CATALOG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/rbac/featureCatalog.ts"),
  "utf8",
);
const FLEET_ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"),
  "utf8",
);
const NAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

/* ── 1. Catalog ──────────────────────────────────────────────── */

describe("#2079 TA-T18-09 — fleet.rentals catalog entry", () => {
  it("fleet.rentals is declared with approvableActions: [\"approve\"]", () => {
    const block = CATALOG.match(
      /key:\s*"fleet\.rentals"[\s\S]{0,500}?\}/,
    );
    expect(block, "fleet.rentals block not found in catalog").toBeTruthy();
    expect(block![0]).toMatch(/parentKey:\s*"fleet"/);
    expect(block![0]).toMatch(/labelAr:\s*"تأجير المركبات"/);
    expect(block![0]).toMatch(/availableActions:\s*ALL_ACTIONS/);
    expect(block![0]).toMatch(/approvableActions:\s*\[\s*"approve"\s*\]/);
  });

  it("fleet.bookings + fleet.dispatch existing approvable declarations stay intact", () => {
    expect(CATALOG).toMatch(
      /key:\s*"fleet\.bookings"[\s\S]{0,400}?approvableActions:\s*\[\s*"approve"\s*\]/,
    );
    expect(CATALOG).toMatch(
      /key:\s*"fleet\.dispatch"[\s\S]{0,400}?approvableActions:\s*\[\s*"approve"\s*\]/,
    );
  });
});

/* ── 2. Rental endpoints authorize on fleet.rentals ─────────── */

describe("#2079 TA-T18-09 — every rental-lifecycle endpoint moves to fleet.rentals", () => {
  it("GET /rental-contracts uses fleet.rentals:list", () => {
    expect(FLEET_ROUTE).toMatch(
      /router\.get\(\s*"\/rental-contracts"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.rentals"\s*,\s*action:\s*"list"\s*\}/,
    );
  });

  it("POST /rental-contracts uses fleet.rentals:create", () => {
    expect(FLEET_ROUTE).toMatch(
      /router\.post\(\s*"\/rental-contracts"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.rentals"\s*,\s*action:\s*"create"\s*\}/,
    );
  });

  it("GET /rental-contracts/:id uses fleet.rentals:view", () => {
    expect(FLEET_ROUTE).toMatch(
      /router\.get\(\s*"\/rental-contracts\/:id"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.rentals"\s*,\s*action:\s*"view"\s*\}/,
    );
  });

  it("POST /rental-contracts/:id/activate uses fleet.rentals:update", () => {
    expect(FLEET_ROUTE).toMatch(
      /\/rental-contracts\/:id\/activate"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.rentals"\s*,\s*action:\s*"update"\s*\}/,
    );
  });

  it("POST /rental-contracts/:id/handover uses fleet.rentals:approve (SoD decision)", () => {
    expect(FLEET_ROUTE).toMatch(
      /\/rental-contracts\/:id\/handover"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.rentals"\s*,\s*action:\s*"approve"\s*\}/,
    );
  });

  it("POST /rental-contracts/:id/return uses fleet.rentals:approve (SoD decision)", () => {
    expect(FLEET_ROUTE).toMatch(
      /\/rental-contracts\/:id\/return"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.rentals"\s*,\s*action:\s*"approve"\s*\}/,
    );
  });

  it("no rental-contracts LIFECYCLE endpoint references fleet.vehicles anymore", () => {
    // Lifecycle = /rental-contracts (root list + create), /:id (view),
    // /:id/activate, /:id/handover, /:id/return. The /:id/payments
    // endpoints are intentionally LEFT on fleet.vehicles since
    // payments are the financial side and follow a different
    // permission model — flagged in the audit but out of scope
    // for T18-09's "feature separation" cut.
    const lifecyclePaths = [
      '/rental-contracts"',
      '/rental-contracts/:id"',
      '/rental-contracts/:id/activate"',
      '/rental-contracts/:id/handover"',
      '/rental-contracts/:id/return"',
    ];
    for (const path of lifecyclePaths) {
      const stale = new RegExp(
        `router\\.(get|post|patch|delete)\\(\\s*"${path.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*,\\s*authorize\\(\\s*\\{\\s*feature:\\s*"fleet\\.vehicles"`,
      );
      expect(FLEET_ROUTE, `lifecycle endpoint ${path} should NOT use fleet.vehicles`).not.toMatch(stale);
    }
  });
});

/* ── 3. Vehicle CRUD stays on fleet.vehicles (not over-rotated) ─ */

describe("#2079 TA-T18-09 — vehicle CRUD stays on fleet.vehicles", () => {
  it("vehicle list / create / update endpoints still authorize on fleet.vehicles", () => {
    // The base vehicle endpoints are mounted under /fleet (no
    // /rental-contracts prefix). At least one route in fleet.ts
    // must still carry `feature: "fleet.vehicles"` for the
    // vehicle-CRUD surface — otherwise the rename was a blanket
    // sweep that broke the rest of the file.
    expect(FLEET_ROUTE).toMatch(/feature:\s*"fleet\.vehicles"/);
  });
});

/* ── 4. SPA sidebar uses fleet.rentals:list ─────────────────── */

describe("#2079 TA-T18-09 — SPA nav gate flips to fleet.rentals:list", () => {
  it("the رابط تأجير المركبات entry carries perm: \"fleet.rentals:list\"", () => {
    expect(NAV).toMatch(
      /path:\s*"\/fleet\/rental-contracts"[\s\S]{0,200}?perm:\s*"fleet\.rentals:list"/,
    );
  });

  it("no stale fleet.vehicles gate left on the rental nav entry", () => {
    // Narrow the regex span so it can't accidentally cross over into
    // a neighbouring sidebar entry. The rental row is a single
    // object literal, so the perm setting is within ~120 chars on
    // the SAME line.
    const rentalLine = NAV.match(/path:\s*"\/fleet\/rental-contracts"[^\n]*/);
    expect(rentalLine, "rental nav row not found").toBeTruthy();
    expect(rentalLine![0]).not.toMatch(/fleet\.vehicles:list/);
    expect(rentalLine![0]).toMatch(/fleet\.rentals:list/);
  });
});

/* ── 5. Boundary ─────────────────────────────────────────────── */

describe("#2079 TA-T18-09 — boundary intact (no migration, no engine drift)", () => {
  it("no new migration file referenced from this change", () => {
    // We added an RBAC catalog entry + flipped route gates — no
    // schema change, so no migration file path should appear in
    // the touched code regions.
    const newRegion = CATALOG.match(/TA-T18-09[\s\S]+?\}\s*,\s*\{\s*key:\s*"fleet\.dispatch"/);
    expect(newRegion).toBeTruthy();
    expect(newRegion![0]).not.toMatch(/migrations\//);
  });

  it("the change does NOT reference finance / GL / VRP / Reputation / Print Engine", () => {
    const newRegion = CATALOG.match(/TA-T18-09[\s\S]+?\}\s*,\s*\{\s*key:\s*"fleet\.dispatch"/);
    if (newRegion) {
      expect(newRegion![0]).not.toMatch(/journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore|printEngine/);
    }
  });
});
