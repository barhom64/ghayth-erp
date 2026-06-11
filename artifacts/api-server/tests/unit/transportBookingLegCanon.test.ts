import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 Gate-PE-2 — Route Leg as Canon.
 *
 * The owner's mandate 2026-06-11:
 *   «لا تجعل multi-leg مجرد ميزة. مطار جدة → فندق مكة → الحرم →
 *    مزار → فندق → مطار جدة هذا تشغيل يومي.»
 *
 * Audit finding: `transport_booking_lines` (since migration 266)
 * already supports up to 20 legs per booking; the POST endpoint
 * accepts an optional `lines: []` payload. But the schema also
 * allows zero lines, in which case the header's own from/to
 * fields are the de-facto "implicit single leg" — an ambiguity
 * that breaks every downstream "lines is canon" assumption.
 *
 * Gate-2 elevates `transport_booking_lines` to the canonical
 * primitive:
 *   1. Every new booking POSTs at least one line. If the operator
 *      didn't supply `lines: []` (or sent an empty array), the
 *      server synthesises a single leg derived from the header.
 *   2. Migration 320 backfills the same synthetic line on every
 *      existing booking that has zero non-deleted lines.
 *
 * This file pins both surfaces. Behavioural tests are intentionally
 * source-code-based (no live DB needed) — the per-PR live E2E is
 * gated under db:provision-agent per the owner's «لا ترحيل بـ
 * typecheck فقط» rule.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ROUTE = readFileSync(join(apiSrc, "routes/transport-bookings.ts"), "utf8");
const MIG   = readFileSync(join(apiSrc, "migrations/320_transport_bookings_leg_canon.sql"), "utf8");

/* ── POST handler auto-derives a single leg when lines is absent ── */

describe("#2079 Gate-PE-2 — POST /transport/bookings auto-derives a single leg when lines empty", () => {
  it("declares a legsToInsert local that defaults to a synthetic single leg", () => {
    expect(ROUTE).toMatch(/const legsToInsert: typeof bookingLineSchema\._type\[\]/);
    expect(ROUTE).toMatch(/b\.lines && b\.lines\.length > 0[\s\S]{0,200}\? b\.lines/);
  });

  it("synthetic leg inherits the booking header's from/to + window fields", () => {
    const fallback = ROUTE.slice(ROUTE.indexOf("Auto-derived single leg") - 1500, ROUTE.indexOf("Auto-derived single leg") + 200);
    for (const heritage of [
      "b.fromLocationId",
      "b.toLocationId",
      "b.fromLocationText",
      "b.toLocationText",
      "b.pickupWindowStart",
      "b.fixedAppointmentTime",
      "b.passengerCount",
    ]) {
      expect(fallback, `synthetic leg missing inheritance of ${heritage}`).toContain(heritage);
    }
  });

  it("synthetic leg is tagged 'Auto-derived single leg' for downstream identification", () => {
    expect(ROUTE).toMatch(/notes:\s+"Auto-derived single leg"/);
  });

  it("multi-leg path (lines.length > 0) is unchanged — same INSERT statement", () => {
    // Pin the explicit-lines code path still runs the same INSERT
    // through the loop; backward-compat for callers that DO supply
    // a lines: [] payload (used by from-umrah-group, etc).
    expect(ROUTE).toMatch(/for \(let i = 0; i < legsToInsert\.length; i\+\+\)/);
    expect(ROUTE).toMatch(/INSERT INTO transport_booking_lines/);
  });

  it("the loop counter `inserted` reflects every line (auto-derived or explicit)", () => {
    // Critical for the `legsInserted` audit event the POST emits
    // downstream — it tells the operator how many legs the booking
    // ended up with regardless of which path the synthesis took.
    expect(ROUTE).toMatch(/inserted\+\+/);
    expect(ROUTE).toMatch(/legsInserted: inserted/);
  });
});

/* ── Migration 320 backfill ──────────────────────────────────────── */

describe("#2079 Gate-PE-2 — migration 320 backfills legacy bookings", () => {
  it("INSERTs INTO transport_booking_lines with a SELECT FROM transport_bookings", () => {
    expect(MIG).toMatch(/INSERT INTO public\.transport_booking_lines/);
    expect(MIG).toMatch(/FROM public\.transport_bookings b/);
  });

  it("targets only bookings that lack a non-deleted line (idempotent)", () => {
    expect(MIG).toMatch(/NOT EXISTS \([\s\S]{0,200}FROM public\.transport_booking_lines l/);
    expect(MIG).toMatch(/l\."bookingId" = b\.id/);
    expect(MIG).toMatch(/l\."deletedAt" IS NULL/);
  });

  it("derives scheduledPickupAt from header window/appointment fields", () => {
    expect(MIG).toMatch(/COALESCE\(b\."pickupWindowStart", b\."fixedAppointmentTime"/);
  });

  it("derives scheduledDeliveryAt from header dropoff window or requestedDelivery*", () => {
    expect(MIG).toMatch(/COALESCE\(b\."dropoffWindowStart"/);
  });

  it("maps the line status to mirror the booking aggregate", () => {
    for (const transition of [
      "WHEN b.status IN ('cancelled')              THEN 'cancelled'",
      "WHEN b.status IN ('completed', 'closed')    THEN 'completed'",
      "WHEN b.status IN ('executing')              THEN 'in_progress'",
      "WHEN b.status IN ('scheduled')              THEN 'dispatched'",
    ]) {
      expect(MIG, `status transition missing: ${transition}`).toContain(transition);
    }
  });

  it("tags every backfilled row in `notes` for rollback + auditability", () => {
    expect(MIG).toMatch(/'#2079 Gate-PE-2 — derived from booking header'/);
  });

  it("declares a rollback block that targets the same tag", () => {
    expect(MIG).toMatch(/@rollback:/);
    expect(MIG).toMatch(/DELETE FROM public\.transport_booking_lines[\s\S]{0,200}#2079 Gate-PE-2/);
  });

  it("only backfills non-deleted bookings (deletedAt IS NULL)", () => {
    expect(MIG).toMatch(/WHERE b\."deletedAt" IS NULL/);
  });
});

/* ── Invariant pin ───────────────────────────────────────────────── */

describe("#2079 Gate-PE-2 — every booking has ≥1 line invariant", () => {
  it("POST handler does NOT have an early return / skip path that bypasses line insertion", () => {
    // Spot-check: no `if (!b.lines) return ...` short-circuit between
    // the header insert and the lines insert. The synthetic-leg
    // fallback above is the ONLY way the function exits the lines
    // block — there's no zero-line path. This regex catches the
    // common regression of "skip lines if none provided".
    expect(ROUTE).not.toMatch(/if \(!b\.lines\)\s*return/);
    expect(ROUTE).not.toMatch(/if \(b\.lines == null\)\s*\{\s*continue/);
  });
});
