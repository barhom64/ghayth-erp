import { describe, it, expect } from "vitest";
import {
  isOwnRecord,
  createdByIdentity,
  CREATED_BY_IDENTITY,
} from "../../src/lib/rbac/recordOwnership.js";
import { rawQuery } from "../../src/lib/rawdb.js";

const HAS_DB = !!process.env.DATABASE_URL;

describe("recordOwnership — canonical createdBy interpretation", () => {
  it("classifies by FK: users→user, employee_assignments→assignment, unknown→either", () => {
    expect(createdByIdentity("budgets")).toBe("user");
    expect(createdByIdentity("bank_guarantees")).toBe("assignment");
    expect(createdByIdentity("invoices")).toBe("either"); // no FK
    expect(createdByIdentity(null)).toBe("either");
  });

  it("user-id table: matches only the user id, never an assignment id", () => {
    const id = { userId: 7, assignmentIds: [50, 51] };
    expect(isOwnRecord("budgets", 7, id)).toBe(true);
    expect(isOwnRecord("budgets", 50, id)).toBe(false); // 50 is an assignment, not this user
  });

  it("assignment-id table: matches one of the user's assignments, not their user id", () => {
    const id = { userId: 7, assignmentIds: [50, 51] };
    expect(isOwnRecord("bank_guarantees", 51, id)).toBe(true);
    expect(isOwnRecord("bank_guarantees", 7, id)).toBe(false); // 7 is the user id, not an assignment
  });

  it("no-FK (finance) table: accepts either identity space (best-effort)", () => {
    const id = { userId: 7, assignmentIds: [50, 51] };
    expect(isOwnRecord("invoices", 50, id)).toBe(true);   // assignment id (finance convention)
    expect(isOwnRecord("journal_entries", 7, id)).toBe(true); // user id (other writers)
    expect(isOwnRecord("invoices", 999, id)).toBe(false);
  });

  it("null createdBy is never self-owned", () => {
    expect(isOwnRecord("invoices", null, { userId: 7, assignmentIds: [1] })).toBe(false);
  });

  // Guards the static map against schema drift: every entry must match the
  // live FK graph, and no createdBy FK may be missing from the map.
  it.skipIf(!HAS_DB)("CREATED_BY_IDENTITY agrees with the live foreign-key graph", async () => {
    const rows = await rawQuery<{ tbl: string; ref: string }>(
      `SELECT c.conrelid::regclass::text AS tbl, c.confrelid::regclass::text AS ref
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f' AND a.attname = 'createdBy'`,
    );
    for (const { tbl, ref } of rows) {
      const expected = ref === "users" ? "user" : ref === "employee_assignments" ? "assignment" : null;
      if (!expected) continue; // FK to some other parent — not an identity we model
      expect(CREATED_BY_IDENTITY[tbl], `${tbl}.createdBy → ${ref}`).toBe(expected);
    }
  });
});
