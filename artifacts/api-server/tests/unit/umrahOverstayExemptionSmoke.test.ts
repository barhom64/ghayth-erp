import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the overstay-exemption flag the user described:
 *
 *   "ولابد تسجل تلقائيا اذا ما خرج وممكن تستثنى اذا تم الاتفاق عليه"
 *
 * Migration 242 adds 4 columns to umrah_pilgrims. The cron skips
 * exempt rows entirely (no auto-violation row, no penalty calc).
 * The PATCH endpoint guards against silent exemption — a reason
 * is REQUIRED whenever overstayExempt is set to true so compliance
 * can audit WHY each pilgrim was exempted.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/242_umrah_pilgrims_overstay_exemption.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);
const CRON = readFileSync(
  join(import.meta.dirname!, "../../src/lib/cronScheduler.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("migration 242 — umrah_pilgrims exemption columns", () => {
  it("adds 4 nullable columns + a partial index on the exempt=true bucket", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "overstayExempt" boolean DEFAULT false/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "overstayExemptReason" text/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "overstayExemptBy" integer/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "overstayExemptAt" timestamptz/);
    // Partial index — only the (small) exempt bucket; saves on
    // false-default rows.
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS umrah_pilgrims_overstay_exempt_idx[\s\S]{1,300}WHERE "overstayExempt" = true/);
  });

  it("rollback drops all 4 columns (additive ⇒ trivial undo)", () => {
    expect(MIGRATION).toMatch(/-- @rollback: ALTER TABLE umrah_pilgrims/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "overstayExempt"/);
  });

  it("schema_pre.sql mirror has the 4 columns inside the umrah_pilgrims block", () => {
    const block = SCHEMA.match(/CREATE TABLE public\.umrah_pilgrims \(([\s\S]*?)\);/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/"overstayExempt" boolean DEFAULT false/);
    expect(block![1]).toMatch(/"overstayExemptReason" text/);
    expect(block![1]).toMatch(/"overstayExemptBy" integer/);
    expect(block![1]).toMatch(/"overstayExemptAt" timestamp with time zone/);
  });
});

describe("cron — overstay scan skips exempt pilgrims", () => {
  it("WHERE clause adds NOT COALESCE(overstayExempt, false) (null-safe)", () => {
    // NULL → COALESCE → false → NOT false → true. Pre-migration rows
    // (where the column doesn't exist or is null) flow through the
    // scan as the existing path expects. Pin the explicit null-safe
    // form so a future cleanup can't accidentally tighten to just
    // `NOT overstayExempt` (which would treat null as null in
    // 3-valued logic and skip the row).
    expect(CRON).toMatch(/AND NOT COALESCE\(p\."overstayExempt", false\)/);
  });
});

describe("PATCH /umrah/pilgrims/:id — exemption guards", () => {
  it("schema accepts overstayExempt (boolean) + overstayExemptReason (string)", () => {
    expect(ROUTE).toMatch(/overstayExempt: z\.boolean\(\)\.optional\(\)/);
    expect(ROUTE).toMatch(/overstayExemptReason: z\.string\(\)\.optional\(\)\.nullable\(\)/);
  });

  it("setting overstayExempt=true REQUIRES a non-empty reason", () => {
    // Without this guard the operator could silently skip the cron
    // for any pilgrim with no audit trail of why.
    expect(ROUTE).toMatch(/if \(b\.overstayExempt === true\) \{[\s\S]{1,500}throw new ValidationError\("سبب الاستثناء مطلوب/);
    expect(ROUTE).toMatch(/field: "overstayExemptReason"/);
  });

  it("setting overstayExempt=false does NOT require a reason (un-exempting)", () => {
    // Removing an exemption is fine without a reason — the operator
    // is enabling enforcement, not bypassing it. The guard fires
    // ONLY on === true.
    expect(ROUTE).toMatch(/if \(b\.overstayExempt === true\) \{[\s\S]{0,200}const reason = \(b\.overstayExemptReason \?\? ""\)\.trim\(\)/);
  });

  it("UPDATE writes overstayExemptBy = scope.userId (server-side, not client-controlled)", () => {
    // Operator could lie about WHO exempted if we trusted the body.
    // Server-side capture from the scope keeps the audit trail
    // honest.
    expect(ROUTE).toMatch(/params\.push\(scope\.userId\);\s*sets\.push\(`"overstayExemptBy"=\$\$\{params\.length\}`\)/);
  });

  it("UPDATE writes overstayExemptAt = NOW() (server-side timestamp)", () => {
    expect(ROUTE).toMatch(/sets\.push\(`"overstayExemptAt"=NOW\(\)`\)/);
  });

  it("un-exempting CLEARS by/at/reason (no stale metadata on re-exemption)", () => {
    // Without clearing, a pilgrim un-exempted then re-exempted would
    // carry the OLD reason. The audit trail must reflect each
    // exemption decision independently.
    expect(ROUTE).toMatch(/sets\.push\(`"overstayExemptReason"=NULL`\);\s*sets\.push\(`"overstayExemptBy"=NULL`\);\s*sets\.push\(`"overstayExemptAt"=NULL`\)/);
  });
});
