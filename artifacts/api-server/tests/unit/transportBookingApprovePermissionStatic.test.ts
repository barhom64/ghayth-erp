import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-08 — separate `fleet.bookings:approve` permission
 * (static, regex-only).
 *
 * The SoD gap before this PR: a single `fleet.bookings:update`
 * grant let any editor drive a booking from `pending_approval`
 * to `approved`/`rejected`. That meant a creator with edit rights
 * could self-approve their own booking, defeating any two-person
 * approval control. This test pins the four contract points the
 * fix must hold:
 *
 *   1. RBAC catalog declares `approvableActions: ["approve"]`
 *      on `fleet.bookings` — the role editor surfaces the action
 *      and it is now a managed, auditable grant.
 *
 *   2. Dedicated `POST /transport/bookings/:id/approve` and
 *      `POST /transport/bookings/:id/reject` endpoints exist and
 *      authorize on `action: "approve"` — NOT `update`.
 *
 *   3. The generic PATCH still rejects status→approved|rejected
 *      from callers that hold `update` but not `approve` (SoD
 *      second line of defence — clients that drive PATCH directly
 *      cannot bypass the dedicated buttons).
 *
 *   4. The SPA's booking-detail page renders the dedicated
 *      Approve/Reject buttons only when the user holds the new
 *      permission AND the booking is `pending_approval`; the
 *      generic status dropdown no longer surfaces approved or
 *      rejected as transition targets.
 *
 * Per the package-locality rule: the test reads the SPA file as
 * plain text (no SPA runtime imported into the api-server test).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");

const CATALOG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/rbac/featureCatalog.ts"),
  "utf8",
);
const BOOKINGS_ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-bookings.ts"),
  "utf8",
);
const BOOKING_DETAIL_SPA = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-booking-detail.tsx"),
  "utf8",
);

/* ── 1. RBAC catalog ─────────────────────────────────────────── */

describe("#2079 TA-T18-08 — catalog declares approve as approvable", () => {
  it("fleet.bookings has approvableActions: [\"approve\"]", () => {
    // Match the relevant feature block and look for the approvable
    // declaration. The regex is anchored to the `fleet.bookings`
    // key so a duplicate declaration on another feature can't
    // falsely satisfy it.
    const block = CATALOG.match(
      /key:\s*"fleet\.bookings"[\s\S]{0,800}?\}/,
    );
    expect(block, "fleet.bookings block not found in catalog").toBeTruthy();
    expect(block![0]).toMatch(/approvableActions:\s*\[\s*"approve"\s*\]/);
  });

  it("fleet.dispatch's existing approvable declaration is intact (regression pin)", () => {
    expect(CATALOG).toMatch(/key:\s*"fleet\.dispatch"[\s\S]{0,400}?approvableActions:\s*\[\s*"approve"\s*\]/);
  });
});

/* ── 2. Dedicated server endpoints on `approve` action ───────── */

describe("#2079 TA-T18-08 — dedicated POST /approve + /reject endpoints", () => {
  it("POST /transport/bookings/:id/approve is authorized on action: 'approve'", () => {
    expect(BOOKINGS_ROUTE).toMatch(
      /\/transport\/bookings\/:id\/approve[\s\S]{0,200}?authorize\(\s*\{\s*feature:\s*"fleet\.bookings"\s*,\s*action:\s*"approve"\s*\}/,
    );
  });

  it("POST /transport/bookings/:id/reject is authorized on action: 'approve'", () => {
    expect(BOOKINGS_ROUTE).toMatch(
      /\/transport\/bookings\/:id\/reject[\s\S]{0,200}?authorize\(\s*\{\s*feature:\s*"fleet\.bookings"\s*,\s*action:\s*"approve"\s*\}/,
    );
  });

  it("the approve handler updates status to 'approved' and writes an audit log with action 'approve'", () => {
    expect(BOOKINGS_ROUTE).toMatch(/SET status = 'approved'/);
    expect(BOOKINGS_ROUTE).toMatch(/action:\s*"approve"\s*,\s*entity:\s*"transport_bookings"/);
  });

  it("the reject handler requires a reason (zod min 1)", () => {
    expect(BOOKINGS_ROUTE).toMatch(/rejectBookingSchema[\s\S]{0,200}?reason:\s*z\.string\(\)\.min\(1/);
    expect(BOOKINGS_ROUTE).toMatch(/SET status = 'rejected'/);
  });

  it("each handler validates the transition against BOOKING_TRANSITIONS (no skipping pending_approval)", () => {
    // Both POST handlers should consult BOOKING_TRANSITIONS before
    // mutating — that's how draft/in_progress get blocked from
    // being approved out-of-order.
    const occurrences = BOOKINGS_ROUTE.match(/allowed\.includes\("(approved|rejected)"\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

/* ── 3. SoD second line in the generic PATCH ─────────────────── */

describe("#2079 TA-T18-08 — PATCH refuses approve/reject without approve permission", () => {
  it("PATCH handler calls checkAccess for approve when status goes to approved or rejected", () => {
    expect(BOOKINGS_ROUTE).toMatch(/import\s*\{\s*checkAccess\s*\}\s*from\s*["']\.\.\/lib\/rbac\/authzEngine\.js["']/);
    // The guard is keyed on the status the caller is trying to set.
    expect(BOOKINGS_ROUTE).toMatch(/b\.status === "approved" \|\| b\.status === "rejected"/);
    expect(BOOKINGS_ROUTE).toMatch(/checkAccess\(scope,\s*\{[\s\S]{0,120}?feature:\s*"fleet\.bookings"[\s\S]{0,40}?action:\s*"approve"/);
  });

  it("the denial message names the missing permission explicitly", () => {
    expect(BOOKINGS_ROUTE).toMatch(/fleet\.bookings:approve/);
  });
});

/* ── 4. SPA wiring — dedicated buttons, dropdown trimmed ─────── */

describe("#2079 TA-T18-08 — SPA gates approval on the new permission", () => {
  it("booking-detail imports usePermission and reads fleet.bookings:approve", () => {
    expect(BOOKING_DETAIL_SPA).toMatch(/import\s*\{[^}]*usePermission[^}]*\}\s*from\s*["']@\/components\/shared\/permission-gate["']/);
    expect(BOOKING_DETAIL_SPA).toMatch(/usePermission\("fleet\.bookings:approve"\)/);
  });

  it("dedicated Approve + Reject buttons call the dedicated endpoints, not PATCH", () => {
    expect(BOOKING_DETAIL_SPA).toMatch(/\/transport\/bookings\/\$\{id\}\/approve/);
    expect(BOOKING_DETAIL_SPA).toMatch(/\/transport\/bookings\/\$\{id\}\/reject/);
  });

  it("the buttons render only when status is pending_approval AND canApprove is true", () => {
    expect(BOOKING_DETAIL_SPA).toMatch(/b\.status === "pending_approval" && canApprove/);
  });

  it("the buttons are hidden + a hint shows when the user lacks the approve permission", () => {
    expect(BOOKING_DETAIL_SPA).toMatch(/b\.status === "pending_approval" && !canApprove/);
    expect(BOOKING_DETAIL_SPA).toMatch(/يلزم صلاحية fleet\.bookings:approve/);
  });

  it("the reject flow requires a reason before firing the mutation", () => {
    expect(BOOKING_DETAIL_SPA).toMatch(/prompt\("سبب الرفض/);
    // No reject mutation should be sent with an empty reason.
    expect(BOOKING_DETAIL_SPA).toMatch(/if \(reason && reason\.trim\(\)\)/);
  });

  it("the generic status dropdown no longer surfaces approved or rejected as transition targets", () => {
    expect(BOOKING_DETAIL_SPA).toMatch(/APPROVAL_DECISION_STATES = new Set\(\["approved",\s*"rejected"\]\)/);
    expect(BOOKING_DETAIL_SPA).toMatch(/!APPROVAL_DECISION_STATES\.has\(t\)/);
  });
});

/* ── 5. Boundary intact ──────────────────────────────────────── */

describe("#2079 TA-T18-08 — boundary intact (no migration / no engine drift)", () => {
  it("no new migration file is referenced from this change", () => {
    expect(BOOKINGS_ROUTE).not.toMatch(/migrations\/\d{3}/);
    expect(BOOKING_DETAIL_SPA).not.toMatch(/migrations\//);
    expect(CATALOG).not.toMatch(/migrations\//);
  });

  it("no finance / GL / journal / invoice / VRP / Reputation references introduced", () => {
    const NEW_REGION = BOOKINGS_ROUTE.match(/TA-T18-08[\s\S]+?(?=transportBookingsRouter\.post\(\s*"\/transport\/bookings\/:id\/lines")/);
    expect(NEW_REGION, "TA-T18-08 region not found").toBeTruthy();
    expect(NEW_REGION![0]).not.toMatch(/journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore|vrp[A-Z]|printEngine/);
  });

  it("the existing assignment guard chain is not edited (regex pin)", () => {
    // Touchstones from PE waves — they must remain unmentioned in
    // the new code paths. This guards against accidental coupling.
    const newSpaRegion = BOOKING_DETAIL_SPA.match(/TA-T18-08[\s\S]+?(?=\}\)\(\))/);
    if (newSpaRegion) {
      expect(newSpaRegion[0]).not.toMatch(/assignmentSuggestionEngine|vehicleClassLadder|driverReadinessGate|operatingWindow|umrahFamiliarity/);
    }
  });
});
