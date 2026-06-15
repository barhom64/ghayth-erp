/**
 * HR security + race-safety hardening — static guards.
 *
 * Closes audit findings SEC-1, SEC-2, SEC-4, RACE-1, RACE-2, INT-1,
 * INT-2, TZ-1, TZ-2. Each test names the audit id it pins.
 *
 * Why static and not behavioral? The flaws are about which middleware
 * runs, which WHERE clause appears in the SQL, and where a lock is
 * taken. Asserting the source contains the right primitives is faster
 * and more reliable than spinning up Postgres + concurrent fixtures.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);
const EXIT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-exit.ts"),
  "utf8",
);

// ─── SEC-1 — /exit/:id/complete gates on an elevated grant ───────────────
// HR-REV-1 #1 migrated this inline gate off the hardcoded HR_ROLES array to
// a grant-derived scopeCan(hr.exit:approve) check (the seeded HR_ROLES —
// hr_manager/owner/gm — are exactly the holders of hr.exit:approve). The
// SoD requirement is unchanged: "update" alone is not enough to complete.

describe("SEC-1: /exit/:id/complete requires an elevated grant (not feature update alone)", () => {
  it("checks scopeCan(hr.exit:approve) before applying transition", () => {
    const completeBlock = EXIT.slice(
      EXIT.indexOf('router.patch("/exit/:id/complete"'),
      EXIT.indexOf('router.patch("/exit/:id/complete"') + 4000,
    );
    expect(completeBlock).toContain('scopeCan(scope, "hr.exit", "approve")');
    expect(completeBlock).toContain(
      "غير مصرّح لك بإتمام نهاية الخدمة — يلزم دور موارد بشرية",
    );
  });

  it("enforces status === 'approved' explicitly with an Arabic error", () => {
    const completeBlock = EXIT.slice(
      EXIT.indexOf('router.patch("/exit/:id/complete"'),
      EXIT.indexOf('router.patch("/exit/:id/complete"') + 4000,
    );
    expect(completeBlock).toContain('item.status !== "approved"');
    expect(completeBlock).toContain("يجب اعتماد نهاية الخدمة قبل إتمامها");
  });
});

// ─── INT-2 — completion blocked while loans are open ─────────────────────

describe("INT-2: /exit/:id/complete blocks completion when loans outstanding", () => {
  it("queries hr_employee_loans.remainingAmount and refuses if > 0", () => {
    const block = EXIT.slice(
      EXIT.indexOf('router.patch("/exit/:id/complete"'),
      EXIT.indexOf('router.patch("/exit/:id/complete"') + 6000,
    );
    expect(block).toContain('FROM hr_employee_loans');
    expect(block).toContain('"remainingAmount" > 0');
    expect(block).toContain("remainingLoanBalance > 0");
    expect(block).toContain("لا يمكن إتمام نهاية الخدمة قبل تسوية القروض");
  });
});

// ─── INT-1 — termination cancels pending leaves + releases reservations ──

describe("INT-1: termination cancels pending leaves and releases reserved days", () => {
  const block = EXIT.slice(
    EXIT.indexOf('router.patch("/exit/:id/complete"'),
  );

  it("cancels pending hr_leave_requests on termination", () => {
    expect(block).toContain("UPDATE hr_leave_requests");
    expect(block).toContain("SET status = 'cancelled'");
    expect(block).toContain("تم إنهاء خدمة الموظف");
  });

  it("releases reserved days back to hr_leave_balances", () => {
    expect(block).toContain("UPDATE hr_leave_balances lb");
    expect(block).toContain(
      "reserved = GREATEST(reserved - sub.total_reserved, 0)",
    );
  });
});

// ─── SEC-2 — /violations restricts employee scope to own rows ────────────

describe("SEC-2: GET /hr/violations filters by assignmentId for employee role", () => {
  it("list query adds AND ev.assignmentId = $2 for employees", () => {
    const violationsBlock = HR.slice(
      HR.indexOf('router.get("/violations"'),
      HR.indexOf('router.get("/violations"') + 2000,
    );
    expect(violationsBlock).toContain(
      'scope.role === "employee" && !scope.isOwner && scope.activeAssignmentId',
    );
    expect(violationsBlock).toContain('ev."assignmentId" = $2');
  });

  it("detail query (GET /violations/:id) applies the same gate", () => {
    const detailBlock = HR.slice(
      HR.indexOf('router.get("/violations/:id"'),
      HR.indexOf('router.get("/violations/:id"') + 2000,
    );
    expect(detailBlock).toContain('ev."assignmentId" = $3');
  });
});

// ─── RACE-1 — leave approval row-locks the balance before deducting ──────

describe("RACE-1: leave approval takes SELECT...FOR UPDATE on the balance row", () => {
  it("locks the balance row inside the same transaction before UPDATE", () => {
    // Just before the `SET used = used + $1, reserved = ...` UPDATE,
    // the route runs `SELECT 1 ... FOR UPDATE` on the same composite
    // key. Find both blocks and check the FOR UPDATE comes first.
    const apprIdx = HR.indexOf("UPDATE hr_leave_balances\n           SET used = used + $1");
    expect(apprIdx).toBeGreaterThan(0);
    const before = HR.slice(Math.max(0, apprIdx - 800), apprIdx);
    expect(before).toContain(
      "SELECT 1 FROM hr_leave_balances\n           WHERE",
    );
    expect(before).toContain("FOR UPDATE");
  });
});

// ─── RACE-2 — payroll run uses advisory-lock + double-check ──────────────

describe("RACE-2: payroll run takes pg_advisory_xact_lock + re-checks duplicate", () => {
  it("takes advisory lock on (companyId, hashtext(period)) inside withTransaction", () => {
    expect(HR).toContain("pg_advisory_xact_lock($1::int, hashtext($2)::int)");
    expect(HR).toContain("payroll_run:${targetPeriod}");
  });

  it("re-runs the duplicate-period check after acquiring the lock", () => {
    const block = HR.slice(
      HR.indexOf("pg_advisory_xact_lock"),
      HR.indexOf("pg_advisory_xact_lock") + 1500,
    );
    expect(block).toContain(
      `SELECT id FROM payroll_runs WHERE "companyId" = $1 AND period = $2`,
    );
    expect(block).toContain("dup.rows.length > 0");
  });
});

// ─── SEC-3 — salary_components writes restricted to the hr.payroll authority ──
// HR-REV-1 #1 migrated the inline PAYROLL_ROLES SoD gate to a grant-derived
// scopeCan(hr.payroll:<verb>) check (tighter than the route's
// hr.payroll.runs capability, exactly as before).

describe("SEC-3: salary-components writes require the hr.payroll authority", () => {
  const ACTION_FOR = { post: "create", patch: "update", delete: "delete" } as const;
  for (const verb of ["post", "patch", "delete"] as const) {
    it(`${verb.toUpperCase()} /salary-components requires scopeCan(hr.payroll:${ACTION_FOR[verb]}) inline`, () => {
      // The handler appears as `router.${verb}("/salary-components"...`
      // for POST and `router.${verb}("/salary-components/:id"...` for
      // PATCH/DELETE. Find whichever matches first.
      const needle =
        verb === "post"
          ? 'router.post("/salary-components"'
          : `router.${verb}("/salary-components/:id"`;
      const start = HR.indexOf(needle);
      expect(start, `${needle} handler exists`).toBeGreaterThan(0);
      const block = HR.slice(start, start + 2500);
      expect(block).toContain(`scopeCan(scope, "hr.payroll", "${ACTION_FOR[verb]}")`);
      // POST/PATCH say "تعديل"; DELETE says "حذف". Either is fine —
      // what matters is the error mentions "مكوّنات الراتب".
      expect(block).toContain("مكوّنات الراتب");
    });
  }
});

// ─── TZ-1 — attendance check-in/out uses Riyadh calendar day ─────────────

describe("TZ-1: attendance uses Asia/Riyadh calendar day", () => {
  it("/check-in resolves today from currentDateInTz(\"Asia/Riyadh\")", () => {
    const checkInBlock = HR.slice(
      HR.indexOf('router.post("/check-in"'),
      HR.indexOf('router.post("/check-out"'),
    );
    expect(checkInBlock).toContain('currentDateInTz("Asia/Riyadh")');
  });

  it("/check-out resolves today from currentDateInTz(\"Asia/Riyadh\")", () => {
    const checkOutBlock = HR.slice(
      HR.indexOf('router.post("/check-out"'),
      HR.indexOf('router.post("/check-out"') + 3000,
    );
    expect(checkOutBlock).toContain('currentDateInTz("Asia/Riyadh")');
  });
});
