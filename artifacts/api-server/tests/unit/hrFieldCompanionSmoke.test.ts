/**
 * PR-9 (#2077) — Field companion smoke.
 *
 * Doctrine pins:
 *   • No new tracking engine — the companion wraps the EXISTING
 *     POST /hr/attendance/field-ping; the only backend additions are
 *     a read-only eligibility mirror + context columns + dedupe index.
 *   • Eligibility BEFORE permission: the page checks /eligibility and
 *     never calls geolocation for non-tracked categories.
 *   • Context: pings carry userId + activeRoleKey + categoryKey
 *     resolved SERVER-side (unspoofable).
 *   • Offline replay is idempotent (unique index + ON CONFLICT).
 *   • Battery discipline: interval = trackingFrequencySeconds; no
 *     free-running watchPosition.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/290_field_tracking_context.sql"), "utf8");
const HR = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");
const SERVICE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/fieldTrackingService.ts"), "utf8");
const MY_FIELD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/myFieldTracking.ts"), "utf8");
const INDEX = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"), "utf8");
const PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/my/field-companion.tsx"), "utf8");
const NAV = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");
const ROUTES = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/miscRoutes.tsx"), "utf8");

describe("PR-9 (#2077) — migration 290: context columns + replay dedupe", () => {
  it("adds userId + activeRoleKey + categoryKey to field_tracking_points", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN "userId" INTEGER/);
    expect(MIGRATION).toMatch(/ADD COLUMN "activeRoleKey" VARCHAR\(60\)/);
    expect(MIGRATION).toMatch(/ADD COLUMN "categoryKey" VARCHAR\(40\)/);
  });
  it("declares the unique (assignmentId, capturedAt) replay-dedupe index", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_field_tracking_assignment_captured\s*ON field_tracking_points \("assignmentId", "capturedAt"\)/);
  });
});

describe("PR-9 (#2077) — backend: eligibility mirror + context-stamped insert", () => {
  it("GET /attendance/field-ping/eligibility exists, same gate as the ping route", () => {
    expect(HR).toMatch(/router\.get\("\/attendance\/field-ping\/eligibility", authorize\(\{ feature: "hr\.attendance\.checkin", action: "create" \}\)/);
  });
  it("eligibility derives from an explicit active tracking policy (no policy → eligible=false)", () => {
    expect(SERVICE).toMatch(/getActiveTrackingPolicy\(/);
    expect(SERVICE).toMatch(/reason: "no_tracking_policy"/);
  });
  it("the SAME service serves a /my/field self-service mount (no module gate) — field workers reach it", () => {
    // Plain employees (the actual field workers) don't carry the hr
    // module, so the module-gated /hr mount 403'd them. The self-
    // service mount mirrors /my-space: authMiddleware + per-route
    // authorize only.
    expect(MY_FIELD).toMatch(/router\.get\("\/eligibility", authorize\(\{ feature: "hr\.attendance\.checkin", action: "create" \}\)/);
    expect(MY_FIELD).toMatch(/router\.post\("\/ping", authorize\(\{ feature: "hr\.attendance\.checkin", action: "create" \}\)/);
    expect(INDEX).toMatch(/router\.use\("\/my\/field", myFieldTrackingRouter\)/);
  });
  it("dedupe runs BEFORE throttle — an offline replay returns duplicate, never throttled", () => {
    const dedupeIdx = SERVICE.indexOf('kind: "duplicate", freq };');
    const throttleIdx = SERVICE.indexOf('kind: "throttled", freq };');
    expect(dedupeIdx).toBeGreaterThan(-1);
    expect(throttleIdx).toBeGreaterThan(dedupeIdx);
  });
  it("ping INSERT stamps userId + selectedRoleKey + categoryKey from scope (server-side, unspoofable)", () => {
    expect(SERVICE).toMatch(/INSERT INTO field_tracking_points[\s\S]{0,400}"userId","activeRoleKey","categoryKey"/);
    expect(SERVICE).toMatch(/scope\.userId, scope\.selectedRoleKey \?\? null, assignment\.categoryKey \?\? null/);
  });
  it("ON CONFLICT (assignmentId, capturedAt) DO NOTHING — offline replay is idempotent", () => {
    expect(SERVICE).toMatch(/ON CONFLICT \("assignmentId", "capturedAt"\) DO NOTHING/);
    expect(HR).toMatch(/reason: "duplicate"/);
  });
  it("the policy gate (no active policy → 403) replaces the old category gate", () => {
    expect(HR).toMatch(/لا توجد سياسة تتبع فعّالة لهذا الموظف/);
  });
});

describe("PR-9 (#2077) — companion page: eligibility-first + Arabic UX + battery discipline", () => {
  it("page checks /eligibility before anything else", () => {
    expect(PAGE).toMatch(/useApiQuery<Eligibility>\(\s*\["field-ping-eligibility"\],\s*"\/my\/field\/eligibility"/);
  });
  it("ineligible categories see the Arabic banner and NO geolocation call path", () => {
    expect(PAGE).toMatch(/data-testid="not-eligible-banner"/);
    expect(PAGE).toMatch(/فئتك لا تخضع للتتبع الميداني/);
    expect(PAGE).toMatch(/لا حاجة لأي إذن موقع/);
  });
  it("permission denial shows a clear Arabic message + recovery help", () => {
    expect(PAGE).toMatch(/تم رفض إذن الموقع/);
    expect(PAGE).toMatch(/data-testid="permission-help"/);
  });
  it("the interval honours trackingFrequencySeconds (no free-running watchPosition)", () => {
    expect(PAGE).toMatch(/setInterval\(tick, freq \* 1000\)/);
    expect(PAGE).not.toMatch(/watchPosition/);
  });
  it("offline queue keeps the ORIGINAL capturedAt + dedupes locally + caps at 50", () => {
    expect(PAGE).toMatch(/const MAX_QUEUE = 50/);
    expect(PAGE).toMatch(/!q\.some\(\(x\) => x\.capturedAt === p\.capturedAt\)/);
    expect(PAGE).toMatch(/window\.addEventListener\("online", onOnline\)/);
  });
  it("stop button exists + interval cleared on unmount (no zombie timers)", () => {
    expect(PAGE).toMatch(/data-testid="stop-btn"/);
    expect(PAGE).toMatch(/useEffect\(\(\) => \(\) => \{ if \(timerRef\.current\) clearInterval\(timerRef\.current\); \}, \[\]\)/);
  });
  it("a 403 policy rejection STOPS the loop (doesn't queue or retry-storm)", () => {
    expect(PAGE).toMatch(/err\?\.code === "FORBIDDEN"[\s\S]{0,300}stopTracking\(\)/);
  });
});

describe("PR-9 (#2077) — routing + navigation", () => {
  it("/my/field-companion is registered", () => {
    expect(ROUTES).toMatch(/\{ path: "\/my\/field-companion", component: FieldCompanion \}/);
  });
  it("nav exposes «رفيق الميدان» under مساحاتي", () => {
    expect(NAV).toMatch(/label: "رفيق الميدان", path: "\/my\/field-companion"/);
  });
});
