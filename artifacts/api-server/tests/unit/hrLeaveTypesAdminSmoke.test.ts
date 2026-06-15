/**
 * /hr/leave-types administration endpoints — static guard.
 *
 * Closes audit gap API-1 (HR audit P2): the leave-management UI was
 * calling `PATCH /hr/leave-types/:id` to edit annual entitlement, paid
 * flag, gender restriction, etc. — but no such backend handler
 * existed. The 404 was silently swallowed; admins thought they had
 * editable leave types when they didn't.
 *
 * Pins the new POST + PATCH routes' contracts:
 *   - both are HR_ROLES-gated (compensation-level decision)
 *   - both validate via leaveTypePayloadSchema (zod)
 *   - PATCH supports partial updates + audit logs
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

// ─── POST /leave-types — new endpoint ───────────────────────────────────────

describe("POST /hr/leave-types — admin can create new leave types", () => {
  const block = HR.slice(
    HR.indexOf('router.post(\n  "/leave-types"'),
    HR.indexOf('router.patch(\n  "/leave-types/:id"'),
  );

  it("gated by authorize feature: hr.leaves, action: create", () => {
    expect(block).toContain('feature: "hr.leaves"');
    expect(block).toContain('action: "create"');
  });

  it("requires the hr:update grant inline (separation of duties for compensation)", () => {
    expect(block).toContain('scopeCan(scope, "hr", "update")');
    expect(block).toContain("تعديل أنواع الإجازات يتطلب دور موارد بشرية");
  });

  it("validates body via leaveTypePayloadSchema", () => {
    expect(block).toContain("leaveTypePayloadSchema.safeParse");
  });

  it("schema caps annualDays at 365 + minServiceMonths at 120", () => {
    expect(HR).toContain("annualDays: z.coerce.number().int().min(0).max(365).optional()");
    expect(HR).toContain("minServiceMonths: z.coerce.number().int().min(0).max(120).optional()");
  });

  it("schema accepts only male/female gender restriction (or null)", () => {
    expect(HR).toContain('genderRestriction: z.enum(["male", "female"]).nullable().optional()');
  });

  it("writes the audit log on create", () => {
    expect(block).toContain('entity: "hr_leave_types"');
    expect(block).toContain('action: "create"');
  });

  it("returns 201 with the created row + maxDays alias for legacy UI", () => {
    expect(block).toContain('"annualDays" AS "maxDays"');
    expect(block).toContain("res.status(201)");
  });
});

// ─── PATCH /leave-types/:id — fills the API-1 gap ──────────────────────────

describe("PATCH /hr/leave-types/:id — closes API-1 (UI was hitting 404)", () => {
  const block = HR.slice(
    HR.indexOf('router.patch(\n  "/leave-types/:id"'),
    HR.indexOf('router.patch(\n  "/leave-types/:id"') + 5000,
  );

  it("gated by authorize feature: hr.leaves, action: update + resource scope", () => {
    expect(block).toContain('feature: "hr.leaves"');
    expect(block).toContain('action: "update"');
    expect(block).toMatch(/resource:\s*{[\s\S]*?table:\s*"hr_leave_types"/);
    expect(block).toContain('idParam: "id"');
  });

  it("requires the hr:update grant inline (same SoD as create)", () => {
    expect(block).toContain('scopeCan(scope, "hr", "update")');
  });

  it("body is partial — uses leaveTypePayloadSchema.partial()", () => {
    expect(block).toContain("leaveTypePayloadSchema.partial().safeParse");
  });

  it("builds a dynamic SET list — only updates fields the caller sent", () => {
    expect(block).toContain("const addField = (col: string, val: unknown) =>");
    expect(block).toContain("if (val !== undefined)");
  });

  it("rejects empty PATCH body with ValidationError", () => {
    expect(block).toContain('throw new ValidationError("لا توجد بيانات للتحديث")');
  });

  it("404s with Arabic message when row not found", () => {
    expect(block).toContain('throw new NotFoundError("نوع الإجازة غير موجود")');
  });

  it("writes the audit log on update", () => {
    expect(block).toContain('action: "update"');
    expect(block).toContain('entity: "hr_leave_types"');
  });

  it("RETURNING clause includes maxDays alias for legacy UI compatibility", () => {
    expect(block).toContain('"annualDays" AS "maxDays"');
  });
});
