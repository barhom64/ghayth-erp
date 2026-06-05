import { describe, it, expect, vi, beforeEach } from "vitest";

// enforceSoD previously compared record.createdBy === userId. On the finance
// tables whose createdBy holds an *assignment* id, that never matched, so the
// runtime self-approval block silently never fired. These tests pin the fix:
// ownership is now resolved in the correct identity space.

vi.mock("../../src/lib/rawdb.js", () => ({ rawQuery: vi.fn() }));
vi.mock("../../src/lib/rbac/distributedCache.js", () => ({
  onInvalidation: vi.fn(),
  publishInvalidation: vi.fn(),
}));

async function loadModule() {
  const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as { rawQuery: ReturnType<typeof vi.fn> };
  const mod = await import("../../src/lib/rbac/sodEnforcement.js");
  return { rawQuery, ...mod };
}

const RULE = {
  rule_key: "finance_journal_create_approve",
  label_ar: "فصل صلاحية إنشاء واعتماد القيد المحاسبي",
  feature_a: "finance.journal",
  action_a: "create",
  feature_b: "finance.journal",
  action_b: "approve",
  severity: "critical",
  is_active: true,
};

describe("enforceSoD — identity-aware self-approval", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("BLOCKS when the approver created the record via their assignment id (no-FK finance table)", async () => {
    const { rawQuery, enforceSoD, invalidateSodCache } = await loadModule();
    invalidateSodCache(); // clear cross-test rule cache
    rawQuery.mockResolvedValue([RULE]);

    const result = await enforceSoD({
      userId: 7,
      companyId: 1,
      feature: "finance.journal",
      action: "approve",
      grants: [{ feature_key: "finance.journal", actions: ["create", "approve"] }],
      table: "journal_entries",
      record: { createdBy: 50 }, // an assignment id, NOT the user id
      assignmentIds: [50, 51], // assignment 50 belongs to user 7
    });

    expect(result.blocked).toBe(true);
    expect(result.rule?.ruleKey).toBe("finance_journal_create_approve");
  });

  it("does NOT block when another person's assignment created it", async () => {
    const { rawQuery, enforceSoD, invalidateSodCache } = await loadModule();
    invalidateSodCache();
    rawQuery.mockResolvedValue([RULE]);

    const result = await enforceSoD({
      userId: 7,
      companyId: 1,
      feature: "finance.journal",
      action: "approve",
      grants: [{ feature_key: "finance.journal", actions: ["create", "approve"] }],
      table: "journal_entries",
      record: { createdBy: 99 }, // not one of this user's assignments
      assignmentIds: [50, 51],
    });

    expect(result.blocked).toBe(false);
  });

  it("on a user-id FK table, an assignment-id coincidence does NOT false-block", async () => {
    const { rawQuery, enforceSoD, invalidateSodCache } = await loadModule();
    invalidateSodCache();
    rawQuery.mockResolvedValue([
      { ...RULE, rule_key: "x", feature_a: "finance.budgets", feature_b: "finance.budgets" },
    ]);

    const result = await enforceSoD({
      userId: 7,
      companyId: 1,
      feature: "finance.budgets",
      action: "approve",
      grants: [{ feature_key: "finance.budgets", actions: ["create", "approve"] }],
      table: "budgets", // FK → users: createdBy is a user id
      record: { createdBy: 50 }, // equals an assignment id, but NOT user 7
      assignmentIds: [50, 51],
    });

    expect(result.blocked).toBe(false);
  });
});
