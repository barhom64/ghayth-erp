import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 FIX-13 (TA-SEC-02) — linked-source field changes get a
 * distinct audit event.
 *
 * The audit gap before this PR: PATCH /transport/bookings/:id
 * emitted ONE generic `action: "update"` audit log per request,
 * even when the operator silently rebound a `customerId`,
 * `umrahGroupId`, or `contractId`. A malicious operator could hide
 * a customer swap inside a noisy notes/cost edit because the audit
 * trail had no way to flag the SoD-sensitive nature of a
 * source-link change. The audit's FIX-13 / TA-SEC-02 rule: a
 * link-field rebind is a distinct sensitive event and must be
 * audited as one — `action: "linked_source_changed"`.
 *
 * The existing generic update log stays — auditors still see the
 * full PATCH delta. The new event sits NEXT TO it carrying only
 * the link-field before/after so the SoD-relevant row reads
 * cleanly without scrolling.
 *
 * Per the owner's package-locality rule: this test stays in
 * api-server and reads the route file as plain text.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-bookings.ts"),
  "utf8",
);

/* ── 1. SELECT projects the three link fields ───────────────── */

describe("#2079 FIX-13 — PATCH SELECT reads the existing linked-source fields", () => {
  it("PATCH handler's SELECT now projects customerId, umrahGroupId, contractId alongside status", () => {
    // The PATCH handler used to SELECT only `status`; the fix
    // expands the SELECT so the audit-log delta is a true
    // before/after, not a one-sided guess.
    expect(ROUTE).toMatch(
      /SELECT status, "customerId", "umrahGroupId", "contractId"\s+FROM transport_bookings/,
    );
  });

  it("the `existing` row type carries the three link-field columns", () => {
    expect(ROUTE).toMatch(/customerId:\s*number\s*\|\s*null/);
    expect(ROUTE).toMatch(/umrahGroupId:\s*number\s*\|\s*null/);
    expect(ROUTE).toMatch(/contractId:\s*number\s*\|\s*null/);
  });
});

/* ── 2. Distinct audit event when a link field changes ───────── */

describe("#2079 FIX-13 — distinct `linked_source_changed` audit event", () => {
  it("declares the linkedSourceFields tuple with the three governed keys", () => {
    expect(ROUTE).toMatch(
      /linkedSourceFields\s*=\s*\["customerId",\s*"umrahGroupId",\s*"contractId"\]/,
    );
  });

  it("emits createAuditLog with action: \"linked_source_changed\"", () => {
    expect(ROUTE).toMatch(
      /action:\s*"linked_source_changed"\s*,\s*entity:\s*"transport_bookings"/,
    );
  });

  it("the linked-source audit only fires when at least one tracked field changed", () => {
    // The change-detection loop compares b[field] against
    // existing[field], so a no-op PATCH on the same value (or a
    // body without those fields) never triggers the distinct
    // event.
    expect(ROUTE).toMatch(/b\[field\]\s*!==\s*undefined\s*&&\s*b\[field\]\s*!==\s*existing\[field\]/);
    expect(ROUTE).toMatch(/Object\.keys\(linkedChange\)\.length\s*>\s*0/);
  });

  it("the audit row's before/after carry ONLY the changed link fields (no unrelated deltas)", () => {
    // before/after are built from `linkedChange`, NOT the raw
    // request body — that's how the row stays narrow enough for an
    // auditor to read at a glance.
    expect(ROUTE).toMatch(
      /linked_source_changed[\s\S]{0,500}?before:\s*Object\.fromEntries\(\s*Object\.entries\(linkedChange\)/,
    );
    expect(ROUTE).toMatch(
      /linked_source_changed[\s\S]{0,500}?after:\s*Object\.fromEntries\(\s*Object\.entries\(linkedChange\)/,
    );
  });

  it("the generic update audit log is PRESERVED (regression pin)", () => {
    // The fix is additive — the existing `action: "update"` log
    // must still fire so auditors keep the full PATCH delta.
    expect(ROUTE).toMatch(
      /action:\s*"update"\s*,\s*entity:\s*"transport_bookings"[\s\S]{0,300}?before:\s*\{\s*status:\s*existing\.status\s*\}/,
    );
  });

  it("audit-log failures are soft-failed via .catch — never roll back the PATCH", () => {
    // Both audit calls must be best-effort: the operator's PATCH
    // succeeded against the DB, the audit row is a parallel
    // bookkeeping concern.
    expect(ROUTE).toMatch(
      /linked_source_changed[\s\S]{0,800}?\.catch\(\(e\)\s*=>\s*logger\.error\(e,\s*"booking linked-source audit failed"\)\)/,
    );
  });
});

/* ── 3. Boundary ─────────────────────────────────────────────── */

describe("#2079 FIX-13 — boundary intact", () => {
  it("no new migration / no DDL change in the touched region", () => {
    const block = ROUTE.match(
      /FIX-13[\s\S]+?passenger booking close/,
    );
    expect(block, "FIX-13 region not found").toBeTruthy();
    expect(block![0]).not.toMatch(/migrations\//);
    expect(block![0]).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });

  it("no finance / GL / VRP / Reputation references introduced in the FIX-13 region", () => {
    const block = ROUTE.match(
      /FIX-13[\s\S]+?passenger booking close/,
    );
    expect(block).toBeTruthy();
    expect(block![0]).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore|printEngine/,
    );
  });

  it("the existing TA-T18-08 SoD guard is still in the PATCH handler (regression pin)", () => {
    // FIX-13 sits next to the SoD guard introduced by TA-T18-08;
    // neither change should accidentally drop the other.
    expect(ROUTE).toMatch(
      /b\.status === "approved" \|\| b\.status === "rejected"[\s\S]{0,400}?checkAccess\(scope,\s*\{[\s\S]{0,80}?action:\s*"approve"/,
    );
  });
});
