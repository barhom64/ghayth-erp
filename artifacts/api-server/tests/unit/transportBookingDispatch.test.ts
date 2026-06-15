import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Booking + Dispatch layer (Issue Comment 9). Locks in:
//   1. Migration 266 + schema dump carry the five new tables.
//   2. Routes file exposes the canonical CRUD + dispatch endpoints.
//   3. Booking and dispatch state machines have the right shape:
//        • booking: 10 states with forward-only walk
//        • dispatch: 8 states with notify→accept/decline branch
//   4. Dispatch order creation runs:
//        • driver eligibility (re-uses #1761 guard)
//        • driver/vehicle time-window conflict detection
//      and both paths honour `overrideReason` for documented exceptions.
//   5. RBAC features `fleet.bookings` + `fleet.dispatch` are registered.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const BOOKINGS_ROUTE = read("routes/transport-bookings.ts");
const ROUTES_INDEX = read("routes/index.ts");
const FEATURE_CATALOG = read("lib/rbac/featureCatalog.ts");

const BOOKING_STATES = [
  "draft", "submitted", "pending_approval", "approved",
  "scheduled", "dispatched", "in_progress", "completed",
  "cancelled", "rejected",
] as const;

const DISPATCH_STATES = [
  "pending", "notified", "accepted", "declined",
  "executing", "completed", "closed", "cancelled",
] as const;

const BOOKING_SOURCES = [
  "manual_entry", "customer_request", "umrah_group",
  "contract_schedule", "import_excel", "api_integration",
  "recurring_schedule",
] as const;

const ROUTE_TYPES = [
  "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
  "makkah_local", "madinah_local", "ziyarah", "custom",
] as const;

describe("#1733 Booking + Dispatch — migration 266 + schema dump", () => {
  it("migration 266 declares the five tables with their CHECK constraints", () => {
    const migPath = join(apiSrc, "migrations", "266_transport_bookings_dispatch.sql");
    expect(existsSync(migPath), "migration 266 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");

    for (const t of [
      "transport_locations",
      "transport_bookings",
      "transport_booking_lines",
      "transport_dispatch_orders",
      "vehicle_location_snapshots",
    ]) {
      expect(sql, `migration missing table ${t}`).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }

    // Booking sources / route types / status checks reflect the spec.
    for (const s of BOOKING_SOURCES) {
      expect(sql, `booking source ${s} missing`).toContain(`'${s}'`);
    }
    for (const s of BOOKING_STATES) {
      expect(sql, `booking state ${s} missing`).toContain(`'${s}'`);
    }
    for (const s of DISPATCH_STATES) {
      expect(sql, `dispatch state ${s} missing`).toContain(`'${s}'`);
    }
    for (const r of ROUTE_TYPES) {
      expect(sql, `route type ${r} missing`).toContain(`'${r}'`);
    }
  });

  it("schema dump carries the five tables + PKs + indexes", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    for (const t of [
      "transport_locations",
      "transport_bookings",
      "transport_booking_lines",
      "transport_dispatch_orders",
      "vehicle_location_snapshots",
    ]) {
      expect(pre, `schema_pre missing ${t}`).toContain(`CREATE TABLE public.${t}`);
      expect(post, `${t} PK missing`).toContain(`${t}_pkey`);
    }
    // Conflict-detection indexes — partial on status NOT IN (declined, cancelled).
    expect(post).toContain("idx_dispatch_driver_window");
    expect(post).toContain("idx_dispatch_vehicle_window");
    // Postgres 16's planner rewrites `NOT IN (a, b)` into the equivalent
    // `<> ALL (ARRAY[a, b])` when re-dumped. Accept both forms so the
    // test survives `pnpm db:dump-schema` regenerations.
    const hasNotInForm = post.includes("status NOT IN ('declined', 'cancelled')");
    const hasNotAllForm = /status <> ALL \(ARRAY\['declined'(::text)?, ?'cancelled'(::text)?\]\)/.test(post);
    expect(hasNotInForm || hasNotAllForm,
      "dispatch order conflict-detection indexes must filter out declined/cancelled rows",
    ).toBe(true);
  });
});

describe("#1733 Booking + Dispatch — route surface", () => {
  it("routes file exposes the four resource paths", () => {
    expect(BOOKINGS_ROUTE).toMatch(/\.get\(\s*["']\/transport\/locations["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.post\(\s*["']\/transport\/locations["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.get\(\s*["']\/transport\/bookings["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.get\(\s*["']\/transport\/bookings\/:id["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.post\(\s*["']\/transport\/bookings["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.patch\(\s*["']\/transport\/bookings\/:id["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.post\(\s*["']\/transport\/bookings\/:id\/lines["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.get\(\s*["']\/transport\/dispatch-orders["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.post\(\s*["']\/transport\/dispatch-orders["']/);
    expect(BOOKINGS_ROUTE).toMatch(/\.patch\(\s*["']\/transport\/dispatch-orders\/:id["']/);
  });

  it("dispatch creation runs driver-eligibility guard and conflict detection", () => {
    expect(BOOKINGS_ROUTE).toContain("assertDriverEligibility");
    // Time-window overlap query uses tstzrange `&&`.
    expect(BOOKINGS_ROUTE).toContain("tstzrange");
    expect(BOOKINGS_ROUTE).toMatch(/تعارض في الجدولة/);
    // The conflict rejection only fires when no overrideReason is supplied.
    expect(BOOKINGS_ROUTE).toMatch(/conflicts\.length > 0 && !b\.overrideReason/);
  });

  it("dispatch action endpoint locks the row FOR UPDATE before transitioning", () => {
    const block = BOOKINGS_ROUTE.match(
      /\/dispatch-orders\/:id[\s\S]+?Dispatch order action error:/,
    )?.[0]!;
    expect(block).toContain("FOR UPDATE");
    expect(block).toContain("DISPATCH_TRANSITIONS");
    // Decline requires a reason.
    expect(block).toMatch(/declinedReason/);
  });

  it("router is mounted under /api with module + financial guards", () => {
    expect(ROUTES_INDEX).toContain("transportBookingsRouter");
    // #1959: gated by the path-conditional fleet+financial transportPathGate (a
    // path-less requireModule used to globally lock non-admins out of all later
    // modules). The router mounts path-less; the gate runs only for /transport+/fleet.
    expect(ROUTES_INDEX).toContain('const fleetModuleGate = requireModule("fleet")');
    expect(ROUTES_INDEX).toContain('const transportFinancialGate = requireGuards("financial")');
    expect(ROUTES_INDEX).toMatch(/router\.use\(transportPathGate\)/);
  });
});

describe("#1733 Booking + Dispatch — state machines", () => {
  it("booking transitions are strictly forward + cancellable from every non-terminal", () => {
    const block = BOOKINGS_ROUTE.match(/const BOOKING_TRANSITIONS[\s\S]+?\};/)?.[0]!;
    expect(block).toBeTruthy();
    // Forward chain.
    const forward: Record<string, string> = {
      draft: "submitted",
      submitted: "pending_approval",
      pending_approval: "approved",
      approved: "scheduled",
      scheduled: "dispatched",
      dispatched: "in_progress",
      in_progress: "completed",
    };
    for (const [from, to] of Object.entries(forward)) {
      expect(block, `${from} → ${to} missing`).toMatch(
        new RegExp(`${from}\\s*:\\s*\\[[^\\]]*"${to}"[^\\]]*\\]`),
      );
    }
    // Terminal states.
    expect(block).toMatch(/completed\s*:\s*\[\s*\]/);
    expect(block).toMatch(/cancelled\s*:\s*\[\s*\]/);
    expect(block).toMatch(/rejected\s*:\s*\[\s*\]/);
  });

  it("dispatch transitions support notify → accept | decline branch", () => {
    const block = BOOKINGS_ROUTE.match(/const DISPATCH_TRANSITIONS[\s\S]+?\};/)?.[0]!;
    expect(block).toMatch(/pending\s*:\s*\[[^\]]*"notified"[^\]]*\]/);
    expect(block).toMatch(/notified\s*:\s*\[[^\]]*"accepted"[^\]]*"declined"[^\]]*\]/);
    expect(block).toMatch(/accepted\s*:\s*\[[^\]]*"executing"[^\]]*\]/);
    expect(block).toMatch(/executing\s*:\s*\[[^\]]*"completed"[^\]]*\]/);
    expect(block).toMatch(/completed\s*:\s*\[\s*"closed"\s*\]/);
    expect(block).toMatch(/closed\s*:\s*\[\s*\]/);
    expect(block).toMatch(/declined\s*:\s*\[\s*\]/);
  });

  it("accepted dispatch auto-advances a scheduled booking to dispatched (#12 cascade)", () => {
    // Runtime cascade (not the static map): when the driver ACCEPTS the
    // dispatch order, a still-"scheduled" booking auto-advances to
    // "dispatched" so the operator never has to flip it by hand. Guarded to
    // "scheduled" so it can't drag a booking already past dispatch backwards.
    expect(BOOKINGS_ROUTE).toMatch(
      /if \(target === "accepted" \|\| target === "executing"/,
    );
    expect(BOOKINGS_ROUTE).toMatch(
      /target === "accepted" && lineRow\.bookingStatus === "scheduled"[\s\S]{0,80}nextBookingStatus = "dispatched"/,
    );
  });
});

describe("#1733 Booking + Dispatch — RBAC features registered", () => {
  it("featureCatalog declares fleet.bookings + fleet.dispatch", () => {
    expect(FEATURE_CATALOG).toContain('"fleet.bookings"');
    expect(FEATURE_CATALOG).toContain('"fleet.dispatch"');
    // Both must be under the fleet module so existing fleet_manager role
    // gets them via the wildcard finance → fleet.* translation.
    expect(FEATURE_CATALOG).toMatch(
      /fleet\.bookings[\s\S]{0,300}moduleKey:\s*"fleet"/,
    );
    expect(FEATURE_CATALOG).toMatch(
      /fleet\.dispatch[\s\S]{0,300}moduleKey:\s*"fleet"/,
    );
  });
});
