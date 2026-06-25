import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFUND_STATUSES,
  REFUND_TRANSITIONS,
  REFUND_STATUS_LABELS_AR,
  canTransition,
} from "../../src/lib/umrahRefundWorkflow.js";

/**
 * Pin the refund workflow scaffolding:
 *
 *   1. Migration 268 — `umrah_refund_requests` table with status
 *      lifecycle, generated `netAmount` column, audit timestamps for
 *      each milestone, and a check that either pilgrimId OR agentId
 *      is supplied.
 *
 *   2. State machine helper — REFUND_STATUSES + REFUND_TRANSITIONS +
 *      labels + `canTransition`.
 *
 *   3. Endpoints — list / create + transition endpoints (approve,
 *      reject, pay, close) each gated by the state machine.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/268_umrah_refund_workflow.sql"),
  "utf8",
);
// U-07 Phase 14 — refund-request routes carved into umrah-refunds.ts.
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-refunds.ts"),
  "utf8",
);

describe("migration 268 — umrah_refund_requests table", () => {
  it("creates the table with the documented columns", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS umrah_refund_requests/);
    expect(MIGRATION).toMatch(/"companyId"\s+INTEGER NOT NULL/);
    expect(MIGRATION).toMatch(/"pilgrimId"\s+INTEGER REFERENCES umrah_pilgrims/);
    expect(MIGRATION).toMatch(/"agentId"\s+INTEGER REFERENCES umrah_agents/);
    expect(MIGRATION).toMatch(/"grossAmount"\s+NUMERIC\(12,2\) NOT NULL/);
    expect(MIGRATION).toMatch(/"netAmount"\s+NUMERIC\(12,2\) GENERATED ALWAYS AS/);
    expect(MIGRATION).toMatch(/status\s+VARCHAR\(20\) DEFAULT 'requested' NOT NULL/);
  });

  it("either-party-required check prevents anonymous refund requests", () => {
    // A refund without a pilgrim AND without an agent has no
    // operational meaning — the DB rejects it before the route does.
    expect(MIGRATION).toMatch(/CONSTRAINT umrah_refund_either_party_required[\s\S]{0,200}CHECK \("pilgrimId" IS NOT NULL OR "agentId" IS NOT NULL\)/);
  });

  it("grossAmount must be > 0 (no zero or negative refunds)", () => {
    expect(MIGRATION).toMatch(/CONSTRAINT umrah_refund_amount_positive[\s\S]{0,100}CHECK \("grossAmount" > 0\)/);
  });

  it("indexes cover the common access paths", () => {
    expect(MIGRATION).toMatch(/idx_umrah_refund_requests_status/);
    expect(MIGRATION).toMatch(/idx_umrah_refund_requests_pilgrim/);
    expect(MIGRATION).toMatch(/idx_umrah_refund_requests_invoice/);
  });
});

describe("REFUND_STATUSES + REFUND_TRANSITIONS state machine", () => {
  it("exports the documented 6 states", () => {
    expect(REFUND_STATUSES).toEqual([
      "requested", "approved", "rejected", "paid", "closed", "cancelled",
    ]);
  });

  it("requested can become approved / rejected / cancelled", () => {
    expect(REFUND_TRANSITIONS.requested).toEqual(["approved", "rejected", "cancelled"]);
  });

  it("approved can become paid or cancelled (no rejection after approval)", () => {
    expect(REFUND_TRANSITIONS.approved).toEqual(["paid", "cancelled"]);
  });

  it("paid can only progress to closed", () => {
    expect(REFUND_TRANSITIONS.paid).toEqual(["closed"]);
  });

  it("rejected / closed / cancelled are terminal", () => {
    expect(REFUND_TRANSITIONS.rejected).toEqual([]);
    expect(REFUND_TRANSITIONS.closed).toEqual([]);
    expect(REFUND_TRANSITIONS.cancelled).toEqual([]);
  });

  it("REFUND_STATUS_LABELS_AR covers every state with Arabic", () => {
    for (const s of REFUND_STATUSES) {
      expect(REFUND_STATUS_LABELS_AR[s]).toBeTruthy();
      expect(REFUND_STATUS_LABELS_AR[s]).toMatch(/[ء-ي]/);
    }
  });
});

describe("canTransition", () => {
  it("accepts every documented forward edge", () => {
    for (const from of REFUND_STATUSES) {
      for (const to of REFUND_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("rejects backward jumps (e.g. closed → paid)", () => {
    expect(canTransition("closed", "paid")).toBe(false);
    expect(canTransition("paid", "approved")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("rejects skips (requested → paid without approval)", () => {
    expect(canTransition("requested", "paid")).toBe(false);
    expect(canTransition("requested", "closed")).toBe(false);
  });
});

describe("/umrah/refund-requests endpoints", () => {
  it("GET /refund-requests lists with status filter + tenant-scoped JOINs", () => {
    expect(ROUTES).toMatch(/router\.get\("\/refund-requests"/);
    expect(ROUTES).toMatch(/r\."companyId" = \$1 AND r\."deletedAt" IS NULL/);
    expect(ROUTES).toMatch(/LEFT JOIN umrah_pilgrims p[\s\S]{0,200}AND p\."companyId" = r\."companyId"/);
  });

  it("POST /refund-requests validates head ownership in tenant + records audit", () => {
    expect(ROUTES).toMatch(/router\.post\("\/refund-requests"/);
    expect(ROUTES).toMatch(/throw new ValidationError\("المعتمر غير موجود في النظام"/);
    expect(ROUTES).toMatch(/throw new ValidationError\("الوكيل غير موجود في النظام"/);
    expect(ROUTES).toMatch(/action: "umrah\.refund\.requested"/);
  });

  it("POST /:id/approve enforces canTransition before flipping", () => {
    expect(ROUTES).toMatch(/router\.post\("\/refund-requests\/:id\/approve"/);
    expect(ROUTES).toMatch(/!canTransition\(current\.status, "approved"\)/);
    expect(ROUTES).toMatch(/UPDATE umrah_refund_requests[\s\S]{0,300}status='approved'/);
    expect(ROUTES).toMatch(/action: "umrah\.refund\.approved"/);
  });

  it("POST /:id/reject requires a reason + records who/when", () => {
    expect(ROUTES).toMatch(/router\.post\("\/refund-requests\/:id\/reject"/);
    expect(ROUTES).toMatch(/rejectionReason: z\.string\(\)\.min\(1, "سبب الرفض مطلوب"\)/);
    expect(ROUTES).toMatch(/UPDATE umrah_refund_requests[\s\S]{0,500}status='rejected'[\s\S]{0,300}"rejectedBy"/);
  });

  it("POST /:id/pay requires settledAmount + treasury + reference", () => {
    expect(ROUTES).toMatch(/router\.post\("\/refund-requests\/:id\/pay"/);
    expect(ROUTES).toMatch(/settledAmount: z\.coerce\.number\(\)\.positive\(\)/);
    expect(ROUTES).toMatch(/treasuryId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
    expect(ROUTES).toMatch(/paymentReference: z\.string\(\)\.min\(1, "مرجع الدفع مطلوب"\)/);
  });

  it("POST /:id/close finalises the cycle (paid → closed only)", () => {
    expect(ROUTES).toMatch(/router\.post\("\/refund-requests\/:id\/close"/);
    expect(ROUTES).toMatch(/!canTransition\(current\.status, "closed"\)/);
  });
});
