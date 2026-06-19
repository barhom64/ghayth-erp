/**
 * Field tracking ingestion + read smoke (#1799 priority #7).
 *
 * Migration 271 created `field_tracking_points`. Two HR routes write +
 * read it, with the per-category tracking frequency from
 * `attendancePolicyEngine` (migration 270) as the gate for who gets
 * tracked and how often.
 *
 * These tests pin the static contract — schema shape, route presence,
 * policy enforcement, and the throttle/exempt logic — without a DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/271_field_tracking_points.sql"),
  "utf8",
);
const HR_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);
// PR-9 (#2077) — the ping schema + policy gate + throttle + insert moved
// into the shared lib/fieldTrackingService.ts so the SAME logic serves
// both the module-gated /hr mount and the /my/field self-service mount.
const SERVICE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/fieldTrackingService.ts"),
  "utf8",
);


describe("Migration 271 — field_tracking_points schema", () => {
  it("creates the field_tracking_points table", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS field_tracking_points/);
  });

  it("stores the documented geo payload (#1799 §D)", () => {
    for (const col of ["lat", "lng", "accuracy", "speed", "heading", "altitude", "battery"]) {
      expect(MIGRATION_SRC).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("stores device + source provenance", () => {
    expect(MIGRATION_SRC).toMatch(/"deviceId" VARCHAR/);
    expect(MIGRATION_SRC).toMatch(/source VARCHAR/);
  });

  it("links optional task/trip/visit references", () => {
    expect(MIGRATION_SRC).toMatch(/"taskId" INTEGER/);
    expect(MIGRATION_SRC).toMatch(/"tripId" INTEGER/);
    expect(MIGRATION_SRC).toMatch(/"visitId" INTEGER/);
  });

  it("keeps both capturedAt (device clock) and createdAt (server receipt)", () => {
    expect(MIGRATION_SRC).toMatch(/"capturedAt" TIMESTAMPTZ NOT NULL/);
    expect(MIGRATION_SRC).toMatch(/"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  });

  it("indexes the per-employee daily breadcrumb access path", () => {
    expect(MIGRATION_SRC).toMatch(
      /idx_field_tracking_points_assignment_ts[\s\S]*?"assignmentId", "capturedAt"/,
    );
  });

  it("carries a @rollback annotation (migration policy)", () => {
    expect(MIGRATION_SRC).toMatch(/@rollback:/);
  });
});

describe("Field ingestion route — POST /hr/attendance/field-ping", () => {
  it("the field-ping route is registered", () => {
    expect(HR_SRC).toMatch(/router\.post\("\/attendance\/field-ping"/);
  });

  it("validates lat/lng bounds via zod", () => {
    expect(SERVICE_SRC).toMatch(/lat:\s*z\.coerce\.number\(\)\.min\(-90\)\.max\(90\)/);
    expect(SERVICE_SRC).toMatch(/lng:\s*z\.coerce\.number\(\)\.min\(-180\)\.max\(180\)/);
  });

  it("resolves the explicit per-employee tracking policy to gate tracking", () => {
    // Eligibility derives from an explicit active policy, NOT the
    // attendance category / role.
    expect(SERVICE_SRC).toMatch(/getActiveTrackingPolicy\(scope\.companyId, assignment\.employeeId\)/);
  });

  it("rejects employees with NO active tracking policy (eligibility derives from policy, not role/category)", () => {
    expect(SERVICE_SRC).toMatch(/if \(!policy\)/);
    expect(SERVICE_SRC).toMatch(/return \{ kind: "forbidden", categoryKey: assignment\.categoryKey/);
    expect(HR_SRC).toMatch(/case "forbidden":[\s\S]{0,200}ForbiddenError/);
  });

  it("throttles pings arriving faster than the category frequency (with tolerance)", () => {
    expect(SERVICE_SRC).toMatch(/gapSeconds < freq \* 0\.8/);
    // Throttled pings are an accepted no-op (202), not an error.
    expect(HR_SRC).toMatch(/status\(202\)\.json\(\{ accepted: false, reason: "throttled"/);
  });

  it("persists the ping into field_tracking_points on accept", () => {
    expect(SERVICE_SRC).toMatch(/INSERT INTO field_tracking_points/);
    expect(HR_SRC).toMatch(/status\(201\)\.json\(\{ accepted: true/);
  });
});

describe("Field read route — GET /hr/attendance/field-track", () => {
  it("the field-track route is registered", () => {
    expect(HR_SRC).toMatch(/router\.get\("\/attendance\/field-track"/);
  });

  it("breadcrumb mode: full ordered track for one assignment+day", () => {
    expect(HR_SRC).toMatch(/mode: "breadcrumb"/);
    expect(HR_SRC).toMatch(/ORDER BY ftp\."capturedAt" ASC/);
  });

  it("live mode: DISTINCT ON picks newest point per assignment", () => {
    expect(HR_SRC).toMatch(/DISTINCT ON \(ftp\."assignmentId"\)/);
    expect(HR_SRC).toMatch(/mode: "live"/);
  });

  it("both modes scope to the caller's company", () => {
    // Two company-scoped WHEREs in the handler block (breadcrumb + live mode).
    const start = HR_SRC.indexOf('router.get("/attendance/field-track"');
    const next = HR_SRC.indexOf("router.get(", start + 10);
    const handler = HR_SRC.slice(start, next === -1 ? undefined : next);
    const occurrences = handler.match(/ftp\."companyId" = \$/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
