import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-13 — small cleanup bundle (FIX-10..13).
 *
 * The audit collected four small UX/governance cleanups that
 * accumulated in the transport surface. This PR closes the
 * mechanically-tractable two:
 *
 *   FIX-10 — Drop the dead `/fleet/trips/create` route registration
 *            AND the deprecation page file itself. The page was a
 *            5-second redirect (#1812 review); after TA-T18-14
 *            (#2285) made manual `POST /fleet/trips` impossible
 *            without a parent dispatch order, no live SPA path
 *            links to the redirect either. The bundle + the file
 *            are removed together so the audit-routes guard stays
 *            honest and the build doesn't ship dead code.
 *
 *   FIX-12 — Surface the rental sub-app from FleetTabsNav.
 *            After TA-T18-09 (#2281) split rentals onto their own
 *            `fleet.rentals` feature, the rental tab was missing
 *            from the in-page navigation. Operators reaching the
 *            third transport leg (equipment rental) had to leave
 *            fleet and re-enter via the sidebar.
 *
 * Two other items from the audit cleanup bundle are not in this
 * PR:
 *
 *   FIX-11 (hide mapbox/here legacy refs) — depends on a feature
 *          flag the platform team hasn't shipped yet.
 *
 *   FIX-13 (mark linked-field edits as a distinct audit event) —
 *          requires a deeper audit-log refactor outside the
 *          cleanup-bundle scope; flagged for a follow-up PR.
 *
 * Per the owner's package-locality rule: this test stays in
 * api-server and reads the SPA files as plain text.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET_ROUTES = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/routes/fleetRoutes.tsx"),
  "utf8",
);
const FLEET_TABS = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

/* ── FIX-10 — /fleet/trips/create route entry dropped ───────── */

describe("#2079 TA-T18-13 — FIX-10 — /fleet/trips/create route entry dropped", () => {
  it("fleetRoutes.tsx no longer registers a path for /fleet/trips/create", () => {
    expect(FLEET_ROUTES).not.toMatch(
      /\{\s*path:\s*"\/fleet\/trips\/create"\s*,\s*component:/,
    );
  });

  it("the lazy import for TripsCreate is dropped from fleetRoutes.tsx", () => {
    // The TripsCreate symbol can stay referenced from the
    // explanatory comment block, but it must no longer be lazy-
    // imported (which would pull the bundle into the build).
    expect(FLEET_ROUTES).not.toMatch(
      /^const TripsCreate = lazy\(/m,
    );
  });

  it("the existing /fleet/trips list route is preserved (regression pin)", () => {
    expect(FLEET_ROUTES).toMatch(
      /\{\s*path:\s*"\/fleet\/trips"\s*,\s*component:\s*Trips\s*\}/,
    );
  });
});

/* ── FIX-12 — rental sub-app surfaces in FleetTabsNav ───────── */

describe("#2079 TA-T18-13 — FIX-12 — rental sub-app surfaces in the fleet nav", () => {
  // FleetTabsNav now derives its tabs from the sidebar registry (ModuleTabsNav),
  // so an entry's presence in the registry IS its presence in the in-page bar —
  // the two can no longer diverge.
  it("the registry exposes /fleet/rental-contracts (mirrored into the fleet bar)", () => {
    expect(FLEET_TABS).toMatch(
      /label:\s*"تأجير المركبات",\s*path:\s*"\/fleet\/rental-contracts"/,
    );
  });

  it("the rental entry carries the FileSignature icon", () => {
    expect(FLEET_TABS).toMatch(
      /path:\s*"\/fleet\/rental-contracts",\s*icon:\s*FileSignature/,
    );
  });

  it("FileSignature icon is imported from lucide-react", () => {
    expect(FLEET_TABS).toMatch(
      /import\s*\{[^}]*FileSignature[^}]*\}\s*from\s*"lucide-react"/,
    );
  });

  it("the existing cargo entry is preserved (regression pin)", () => {
    expect(FLEET_TABS).toMatch(
      /label:\s*"الشحن والبضائع",\s*path:\s*"\/fleet\/cargo"/,
    );
  });
});

/* ── Boundary ────────────────────────────────────────────────── */

describe("#2079 TA-T18-13 — boundary intact", () => {
  it("no new migration file is referenced from the cleanup region", () => {
    expect(FLEET_ROUTES).not.toMatch(/migrations\//);
    expect(FLEET_TABS).not.toMatch(/migrations\//);
  });

  it("no finance / GL / VRP / Reputation / Print Engine references introduced", () => {
    expect(FLEET_TABS).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore|printEngine/,
    );
  });
});
