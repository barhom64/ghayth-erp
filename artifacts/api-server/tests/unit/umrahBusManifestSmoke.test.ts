import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the bus manifest check-in pipeline:
 *
 *   1. Migration 267 — adds the operational columns the dispatcher
 *      flow needs: seat number, check-in timestamp + operator, no-show
 *      flag, notes.
 *
 *   2. Endpoints:
 *      - GET  /umrah/transport/:id/manifest          → printable list
 *      - POST /umrah/transport/:id/check-in          → one row
 *      - POST /umrah/transport/:id/check-in-bulk     → batch
 *
 *   3. Guards: completed/cancelled trips can't accept check-ins; the
 *      pilgrim must already be assigned to the trip (no auto-assign
 *      via check-in).
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/267_umrah_transport_manifest.sql"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("migration 267 — transport manifest columns", () => {
  it("adds the four operational columns", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "seatNumber"\s+VARCHAR\(10\)/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMPTZ/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "checkedInBy" INTEGER/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "noShow"\s+BOOLEAN DEFAULT FALSE NOT NULL/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "notes"\s+TEXT/);
  });

  it("creates a partial unique index on (transportId, seatNumber)", () => {
    // Same seat on the same bus = the dispatcher mis-typed. Hard-fail
    // at the DB layer so the operator can't silently double-book. NULL
    // seats are allowed during the pre-trip assignment phase.
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}uq_umrah_transport_pilgrims_seat/);
    expect(MIGRATION).toMatch(/WHERE "seatNumber" IS NOT NULL/);
  });

  it("creates a partial index for the 'still not checked in' lookup", () => {
    expect(MIGRATION).toMatch(/idx_umrah_transport_pilgrims_pending_checkin/);
    expect(MIGRATION).toMatch(/WHERE "checkedInAt" IS NULL AND "noShow" = FALSE/);
  });
});

describe("GET /umrah/transport/:id/manifest", () => {
  it("registers under feature: umrah, action: view (read-only)", () => {
    expect(ROUTE).toMatch(/router\.get\("\/transport\/:id\/manifest",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("404s when the trip doesn't exist (no empty data for bad URL)", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.get("/transport/:id/manifest"'));
    expect(block).toMatch(/SELECT id FROM umrah_transport WHERE id=\$1 AND "companyId"=\$2/);
    expect(block).toMatch(/throw new NotFoundError\("رحلة النقل غير موجودة"\)/);
  });

  it("joins pilgrim record for human-readable manifest (name + phone + NUSK)", () => {
    expect(ROUTE).toMatch(/LEFT JOIN umrah_pilgrims p[\s\S]{0,200}AND p\."companyId" = tp\."companyId"/);
    expect(ROUTE).toMatch(/p\."fullName"/);
    expect(ROUTE).toMatch(/p\."nuskNumber"/);
  });

  it("orders by seat (NULLS LAST) then name — matches the printed sheet", () => {
    expect(ROUTE).toMatch(/ORDER BY tp\."seatNumber" NULLS LAST, p\."fullName"/);
  });
});

describe("POST /umrah/transport/:id/check-in (single row)", () => {
  it("rejects check-in on completed or cancelled trips", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in"'));
    expect(block).toMatch(/trip\.status === "completed" \|\| trip\.status === "cancelled"/);
    expect(block).toMatch(/throw new ConflictError\("لا يمكن تسجيل ركوب لرحلة مكتملة أو ملغاة"\)/);
  });

  it("noShow=true clears the check-in (operator marked them missing)", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in"'));
    expect(block).toMatch(/if \(b\.noShow === true\)[\s\S]{0,400}"noShow" = TRUE[\s\S]{0,200}"checkedInAt" = NULL[\s\S]{0,200}"checkedInBy" = NULL/);
  });

  it("noShow=false records the operator + timestamp", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in"'));
    expect(block).toMatch(/sets\.push\(`"noShow" = FALSE`\)/);
    expect(block).toMatch(/sets\.push\(`"checkedInAt" = NOW\(\)`\)/);
    expect(block).toMatch(/sets\.push\(`"checkedInBy" = \$\$\{params\.length\}`\)/);
  });

  it("404s when the pilgrim isn't assigned to this trip", () => {
    // The manifest doesn't auto-assign; assign-pilgrims is a separate
    // step. Without this guard the dispatcher could create a manifest
    // row for any pilgrim by guessing IDs.
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in"'));
    expect(block).toMatch(/throw new NotFoundError\("المعتمر غير مُسند لهذه الرحلة"\)/);
  });

  it("emits an event so the audit trail surfaces each check-in", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in"'));
    expect(block).toMatch(/action: b\.noShow \? "umrah\.transport\.no_show" : "umrah\.transport\.checked_in"/);
  });
});

describe("POST /umrah/transport/:id/check-in-bulk (batch)", () => {
  it("validates the bulk shape: rows[] of pilgrimId + optional fields", () => {
    expect(ROUTE).toMatch(/const manifestRowSchema = z\.object\(\{[\s\S]{0,400}pilgrimId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
    expect(ROUTE).toMatch(/const manifestBulkSchema = z\.object\(\{\s*rows: z\.array\(manifestRowSchema\)\.min\(1/);
  });

  it("transactional loop — all-or-nothing for the batch", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in-bulk"'));
    expect(block).toMatch(/await withTransaction\(async \(client\) =>/);
  });

  it("response surfaces updated + skipped + total (operator UI shows the summary)", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in-bulk"'));
    expect(block).toMatch(/res\.json\(\{ updated, skipped, total: rows\.length \}\)/);
  });

  it("rejects bulk check-in on terminal trips too", () => {
    const block = ROUTE.slice(ROUTE.indexOf('router.post("/transport/:id/check-in-bulk"'));
    expect(block).toMatch(/trip\.status === "completed" \|\| trip\.status === "cancelled"/);
  });
});
