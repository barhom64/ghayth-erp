import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-14 — manual fleet_trips creation requires a parent
 * transport_dispatch_order (RM-02 a+b). Static, regex-only.
 *
 * The gap the audit flagged: POST /fleet/trips accepted free-form
 * trip data with no source link, which made it possible to create
 * trips that bypassed the entire assignment guard chain (VCM /
 * Vehicle Readiness / Driver Readiness / Operating Window). The
 * fix is two-fold and small:
 *
 *   1. `createTripSchema.dispatchOrderId` is a REQUIRED positive
 *      integer — the schema-level gate keeps malformed POSTs from
 *      ever reaching the handler.
 *
 *   2. The handler resolves the dispatch order against the caller's
 *      company AND uses the resulting id in the `sourceKey` shape
 *      `dispatch:{id}:{idempotencyToken}` — so the existing
 *      `(companyId, sourceKey)` partial-unique index from migration
 *      196 doubles as the "one fleet_trip per dispatch order"
 *      guarantee for free.
 *
 * The audit explicitly forbids dropping the table or migrating its
 * fields (phase C is a later owner decision); this fix sits
 * entirely on top of the existing schema.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"),
  "utf8",
);

/* ── 1. Schema: dispatchOrderId required ─────────────────────── */

describe("#2079 TA-T18-14 — createTripSchema requires dispatchOrderId", () => {
  it("dispatchOrderId is declared as a required positive integer in the schema", () => {
    const block = FLEET.match(/const createTripSchema = z\.object\(\{[\s\S]+?\}\);/);
    expect(block, "createTripSchema not found").toBeTruthy();
    expect(block![0]).toMatch(/dispatchOrderId:\s*z\.coerce\.number\(/);
    // required_error proves it's not optional — an undefined
    // value triggers the Arabic message rather than the default
    // "Required" fallback.
    expect(block![0]).toMatch(/required_error:\s*"رقم أمر التوزيع مطلوب/);
    expect(block![0]).toMatch(/\.int\(\)\.positive\(\)/);
  });

  it("dispatchOrderId is NOT marked optional", () => {
    const block = FLEET.match(/const createTripSchema = z\.object\(\{[\s\S]+?\}\);/);
    expect(block).toBeTruthy();
    // The schema region around dispatchOrderId — pull out just the
    // declaration line(s) and pin no `.optional()` chained on.
    const lineRegion = block![0].match(/dispatchOrderId:[\s\S]+?\}\)\.int\(\)\.positive\(\)/);
    expect(lineRegion, "dispatchOrderId declaration block not found").toBeTruthy();
    expect(lineRegion![0]).not.toMatch(/\.optional\(\)/);
  });
});

/* ── 2. Handler: verifies the parent exists ─────────────────── */

describe("#2079 TA-T18-14 — POST /trips handler resolves the parent dispatch order", () => {
  it("the handler runs a SELECT against transport_dispatch_orders scoped to the company", () => {
    expect(FLEET).toMatch(
      /SELECT id FROM transport_dispatch_orders[\s\S]{0,120}?WHERE id = \$1 AND "companyId" = \$2/,
    );
  });

  it("missing-parent case throws NotFoundError with the Arabic message", () => {
    expect(FLEET).toMatch(
      /throw new NotFoundError\("أمر التوزيع المرجعي غير موجود"\)/,
    );
  });
});

/* ── 3. sourceKey encoding uses dispatch:{id}:{token} shape ── */

describe("#2079 TA-T18-14 — sourceKey carries the parent dispatch reference", () => {
  it("sourceKey is built from `dispatch:` + dispatchOrderId + idempotencyToken", () => {
    expect(FLEET).toMatch(
      /sourceKey = `dispatch:\$\{b\.dispatchOrderId\}:\$\{idempotencyToken\}`/,
    );
  });

  it("the legacy `fleet:trip:{token}` sourceKey shape is no longer emitted on the create path", () => {
    // The string `fleet:trip:` should not appear as a template
    // literal in the POST /trips handler region after this PR.
    // Allowing it in a comment or unrelated handler is fine —
    // pin only the executable form.
    const postRegion = FLEET.match(
      /router\.post\("\/trips"[\s\S]+?(?=router\.(?:post|get|patch|delete)\(")/,
    );
    expect(postRegion, "POST /trips region not found").toBeTruthy();
    expect(postRegion![0]).not.toMatch(/sourceKey = `fleet:trip:/);
  });
});

/* ── 4. Boundary ─────────────────────────────────────────────── */

describe("#2079 TA-T18-14 — boundary intact (no migration, no schema drop)", () => {
  it("no new migration file is referenced from the touched region", () => {
    const postRegion = FLEET.match(
      /router\.post\("\/trips"[\s\S]+?(?=router\.(?:post|get|patch|delete)\(")/,
    );
    expect(postRegion).toBeTruthy();
    expect(postRegion![0]).not.toMatch(/migrations\//);
  });

  it("the fleet_trips table is NOT dropped or renamed", () => {
    expect(FLEET).not.toMatch(/DROP TABLE\s+fleet_trips/i);
    expect(FLEET).not.toMatch(/ALTER TABLE\s+fleet_trips\s+RENAME/i);
  });

  it("no finance / GL / VRP / Reputation references introduced on the create path", () => {
    const postRegion = FLEET.match(
      /router\.post\("\/trips"[\s\S]+?(?=router\.(?:post|get|patch|delete)\(")/,
    );
    expect(postRegion).toBeTruthy();
    expect(postRegion![0]).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore|printEngine/,
    );
  });
});
