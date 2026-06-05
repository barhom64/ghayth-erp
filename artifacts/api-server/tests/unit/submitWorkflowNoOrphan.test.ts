import { describe, it, expect, vi, beforeEach } from "vitest";

// submitWorkflow used to INSERT a workflow_instance even when no active
// workflow_definition existed for the requestType — producing an orphan,
// unassigned, step-less row that can never advance yet inflates the workflows
// list/SLA counters. With no definitions seeded anywhere, every loan/exit/
// overtime/leave/official_letter/purchase_request submission created one.
// These flows are driven by the approval-chain engine instead. This test pins
// the fix: no definition ⇒ no instance created (returns null).

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 });
  const withTransaction = vi.fn(async <T>(fn: () => Promise<T>) => fn());
  return { rawQuery, rawExecute, withTransaction };
});
vi.mock("../../src/lib/businessHelpers.js", () => ({
  createNotification: vi.fn(),
  getAssignmentIdByRole: vi.fn(),
  createAuditLog: vi.fn(),
  emitEvent: vi.fn(),
  toDateISO: (d: Date) => d.toISOString(),
  currentPeriod: () => "2026-06",
}));

interface Mocked {
  rawQuery: ReturnType<typeof vi.fn>;
  rawExecute: ReturnType<typeof vi.fn>;
}
async function mocked(): Promise<Mocked> {
  return (await import("../../src/lib/rawdb.js")) as unknown as Mocked;
}

describe("submitWorkflow — no orphan instance without a definition", () => {
  beforeEach(async () => {
    const { rawQuery, rawExecute } = await mocked();
    rawQuery.mockReset();
    rawExecute.mockReset().mockResolvedValue({ insertId: 1, affectedRows: 1 });
  });

  it("returns null and inserts nothing when no active workflow_definition exists", async () => {
    const { rawQuery, rawExecute } = await mocked();
    // First query is the workflow_definitions lookup → no rows.
    rawQuery.mockResolvedValue([]);
    const { submitWorkflow } = await import("../../src/lib/workflowEngine.js");

    const result = await submitWorkflow({
      companyId: 1,
      branchId: 1,
      requestType: "loan",
      refTable: "hr_employee_loans",
      refId: 99,
      title: "loan 99",
      submittedBy: 5,
      submittedByName: "t",
      data: {},
    });

    expect(result).toBeNull();
    // No workflow_instance INSERT should have been issued.
    const insertCalls = rawExecute.mock.calls.filter(([sql]) =>
      /INSERT\s+INTO\s+workflow_instances/i.test(String(sql)),
    );
    expect(insertCalls).toHaveLength(0);
  });
});
