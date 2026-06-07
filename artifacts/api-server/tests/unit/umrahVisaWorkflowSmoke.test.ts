import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VISA_STATUSES,
  VISA_TRANSITIONS,
  VISA_STATUS_LABELS_AR,
  canTransition,
  timestampColumnFor,
  type VisaStatus,
} from "../../src/lib/umrahVisaWorkflow.js";

/**
 * Pin the visa application state machine:
 *
 *   1. Migration 266 — adds `visaStatus` + workflow timestamps + a
 *      partial index on the active states.
 *   2. State machine library — exports the canonical states, the
 *      transition table, the Arabic label dictionary, and the
 *      `canTransition` / `timestampColumnFor` helpers.
 *   3. PATCH /pilgrims/:id — validates transitions against the table
 *      and rejects illegal jumps with a clear Arabic error.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/266_umrah_visa_workflow.sql"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("migration 266 — visa workflow columns", () => {
  it("adds visaStatus (default not_requested, NOT NULL)", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "visaStatus" VARCHAR\(20\) DEFAULT 'not_requested' NOT NULL/);
  });

  it("backfills issued for pre-existing rows with a visaNumber", () => {
    // Without the backfill, a pilgrim whose visa was already issued
    // before migration would render as "not_requested" — a regression
    // for the operational dashboard.
    expect(MIGRATION).toMatch(/UPDATE umrah_pilgrims\s+SET "visaStatus" = 'issued'\s+WHERE "visaNumber" IS NOT NULL/);
  });

  it("adds milestone timestamps + rejection reason", () => {
    expect(MIGRATION).toMatch(/"visaRequestedAt" TIMESTAMPTZ/);
    expect(MIGRATION).toMatch(/"visaIssuedAt"\s+TIMESTAMPTZ/);
    expect(MIGRATION).toMatch(/"visaRejectedAt"\s+TIMESTAMPTZ/);
    expect(MIGRATION).toMatch(/"visaRejectionReason" TEXT/);
  });

  it("partial index covers the active workflow states only", () => {
    // Partial index = smaller index = faster scan for the chase-list.
    expect(MIGRATION).toMatch(/idx_umrah_pilgrims_visa_active/);
    expect(MIGRATION).toMatch(/WHERE "deletedAt" IS NULL\s+AND "visaStatus" IN \('requested', 'under_review', 'approved'\)/);
  });
});

describe("VISA_STATUSES + VISA_TRANSITIONS contract", () => {
  it("exports the documented 8 states", () => {
    expect(VISA_STATUSES).toEqual([
      "not_requested",
      "requested",
      "under_review",
      "approved",
      "issued",
      "delivered",
      "rejected",
      "cancelled",
    ]);
  });

  it("delivered + rejected + cancelled are terminal (no outgoing transitions)", () => {
    expect(VISA_TRANSITIONS.delivered).toEqual([]);
    expect(VISA_TRANSITIONS.rejected).toEqual([]);
    expect(VISA_TRANSITIONS.cancelled).toEqual([]);
  });

  it("not_requested can become requested or cancelled", () => {
    expect(VISA_TRANSITIONS.not_requested).toEqual(["requested", "cancelled"]);
  });

  it("issued can become delivered or cancelled (but not back to approved)", () => {
    expect(VISA_TRANSITIONS.issued).toEqual(["delivered", "cancelled"]);
  });

  it("VISA_STATUS_LABELS_AR covers every state with an Arabic label", () => {
    for (const s of VISA_STATUSES) {
      expect(VISA_STATUS_LABELS_AR[s]).toBeTruthy();
      expect(VISA_STATUS_LABELS_AR[s]).toMatch(/[ء-ي]/);
    }
  });
});

describe("canTransition", () => {
  it("accepts every documented forward edge", () => {
    for (const from of VISA_STATUSES) {
      for (const to of VISA_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("rejects backward jumps (e.g. delivered → not_requested)", () => {
    expect(canTransition("delivered", "not_requested")).toBe(false);
    expect(canTransition("delivered", "requested")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("rejects skips (e.g. requested → delivered without issued)", () => {
    expect(canTransition("requested", "delivered")).toBe(false);
    expect(canTransition("not_requested", "approved")).toBe(false);
  });

  it("rejects unknown source or target", () => {
    expect(canTransition("foo" as VisaStatus, "issued")).toBe(false);
    expect(canTransition("issued", "bar" as VisaStatus)).toBe(false);
  });
});

describe("timestampColumnFor", () => {
  it("captures the operationally significant milestones", () => {
    expect(timestampColumnFor("requested")).toBe("visaRequestedAt");
    expect(timestampColumnFor("issued")).toBe("visaIssuedAt");
    expect(timestampColumnFor("rejected")).toBe("visaRejectedAt");
  });

  it("returns null for in-between / terminal states without a timestamp", () => {
    expect(timestampColumnFor("under_review")).toBe(null);
    expect(timestampColumnFor("approved")).toBe(null);
    expect(timestampColumnFor("delivered")).toBe(null);
    expect(timestampColumnFor("cancelled")).toBe(null);
  });
});

describe("PATCH /pilgrims/:id integrates the visa workflow", () => {
  it("schema accepts visaStatus + visaRejectionReason", () => {
    expect(ROUTE).toMatch(/visaStatus: z\.enum\(\[/);
    expect(ROUTE).toMatch(/visaRejectionReason: z\.string\(\)\.optional\(\)\.nullable\(\)/);
  });

  it("validates transition against canTransition", () => {
    expect(ROUTE).toMatch(/canTransition, timestampColumnFor/);
    expect(ROUTE).toMatch(/!canTransition\(currentStatus, b\.visaStatus\)/);
    expect(ROUTE).toMatch(/انتقال غير مسموح من حالة التأشيرة/);
  });

  it("rejection without a reason is refused (compliance)", () => {
    expect(ROUTE).toMatch(/b\.visaStatus === "rejected"/);
    expect(ROUTE).toMatch(/throw new ValidationError\("سبب الرفض مطلوب/);
  });

  it("writes the milestone timestamp when the transition has one", () => {
    expect(ROUTE).toMatch(/const tsCol = timestampColumnFor\(b\.visaStatus as never\)/);
    expect(ROUTE).toMatch(/if \(tsCol\) sets\.push\(`"\$\{tsCol\}"=NOW\(\)`\)/);
  });
});
