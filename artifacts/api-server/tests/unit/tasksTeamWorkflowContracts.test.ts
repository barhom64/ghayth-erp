/**
 * tasks_assignees — team workflow contract guards.
 *
 * The route source already passes the structural checks in
 * tasksMultiAssigneeSmoke (schema fields, junction migration, etc.).
 * This suite layers on the BUSINESS-LOGIC invariants that the team
 * endpoints must preserve, so a future refactor that "simplifies" any
 * of them fails guard.sh.
 *
 * Invariants pinned:
 *   1. At most ONE primary per task at any time.
 *   2. Primary demotion before promotion (POST with role=primary).
 *   3. Auto-promote on primary removal (DELETE).
 *   4. tasks.assignedTo column always mirrors the active primary.
 *   5. Soft-remove via removedAt — never DELETE FROM task_assignees
 *      (audit log integrity).
 *   6. Team-replacement PATCH uses delta semantics (no truncate +
 *      rewrite).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const TASKS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/tasks.ts"),
  "utf8",
);

// ─── Invariant 1 — single primary per task ──────────────────────────────────

describe("task_assignees — at most one primary per task", () => {
  it("POST /:id/assignees with role='primary' demotes any existing primary FIRST", () => {
    const block = TASKS.slice(TASKS.indexOf('"/:id/assignees"'));
    // The demote query runs BEFORE the insert/update of the new
    // primary. Order matters — if the new row is inserted first, two
    // rows briefly carry role='primary'.
    const demoteIdx = block.indexOf("UPDATE task_assignees SET role = 'member'");
    expect(demoteIdx, "primary demotion query must exist").toBeGreaterThan(0);
    // The new-primary mirror write to tasks.assignedTo must come AFTER
    // the demote.
    const mirrorIdx = block.indexOf('UPDATE tasks SET "assignedTo" = $1');
    expect(mirrorIdx).toBeGreaterThan(demoteIdx);
  });
});

// ─── Invariant 2 — auto-promote oldest member on primary removal ────────────

describe("task_assignees — DELETE auto-promotes oldest remaining member", () => {
  const block = TASKS.slice(
    TASKS.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"'),
    TASKS.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"') + 4000,
  );

  it("checks the removed row's role before deciding to promote", () => {
    expect(block).toContain('if (removed.role === "primary")');
  });

  it("promotes the OLDEST member (ORDER BY assignedAt ASC LIMIT 1)", () => {
    expect(block).toContain('ORDER BY "assignedAt" ASC LIMIT 1');
  });

  it("mirrors the promoted primary into tasks.assignedTo", () => {
    expect(block).toContain('UPDATE tasks SET "assignedTo" = $1 WHERE id = $2');
  });

  it("clears tasks.assignedTo when the team is empty (no member left)", () => {
    expect(block).toContain('SET "assignedTo" = NULL');
  });
});

// ─── Invariant 3 — soft-remove only, never hard DELETE ─────────────────────

describe("task_assignees — removal is always soft (removedAt = NOW())", () => {
  it("DELETE handler sets removedAt instead of DELETE FROM", () => {
    const block = TASKS.slice(
      TASKS.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"'),
      TASKS.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"') + 4000,
    );
    expect(block).toMatch(
      /UPDATE task_assignees SET "removedAt" = NOW\(\)/,
    );
    // The handler must not execute a hard DELETE on the junction.
    // The hr_inquiry_memos and other audit tables rely on the row
    // existing forever for SOX-style audit reports.
    expect(block).not.toMatch(/DELETE\s+FROM\s+task_assignees/);
  });

  it("PATCH team-replacement also soft-removes members no longer in the team", () => {
    // The PATCH handler's "remove rows not in new team" branch.
    // Searches for the conditional that picks rows to deactivate.
    expect(TASKS).toMatch(
      /UPDATE task_assignees SET "removedAt" = NOW\(\)\s*\n\s*WHERE "taskId" = \$1 AND "assignmentId" = \$2/,
    );
  });
});

// ─── Invariant 4 — PATCH uses delta, not truncate + rewrite ────────────────

describe("task_assignees — PATCH team replacement uses delta semantics", () => {
  const patchBlock = TASKS.slice(
    TASKS.indexOf('router.patch("/:id"'),
    TASKS.indexOf('router.get(\n  "/:id/assignees"'),
  );

  it("loads existing active assignees to compute what changed", () => {
    expect(patchBlock).toContain(
      'SELECT "assignmentId", role FROM task_assignees',
    );
  });

  it("only inserts rows that are NEW (not in the existing set)", () => {
    expect(patchBlock).toContain("existingSet.has(resolved[i])");
  });

  it("uses INSERT for new members, UPDATE for re-roled members", () => {
    expect(patchBlock).toContain("INSERT INTO task_assignees");
    expect(patchBlock).toMatch(/UPDATE task_assignees SET role = \$1/);
  });
});

// ─── Invariant 5 — tasks.assignedTo always mirrors the primary ─────────────

describe("tasks.assignedTo always mirrors the primary assignee", () => {
  it("POST /tasks: primaryAssigneeId = resolvedTeam[0] ?? null", () => {
    expect(TASKS).toContain("const primaryAssigneeId = resolvedTeam[0] ?? null");
  });

  it("POST /:id/assignees with primary mirrors into tasks.assignedTo", () => {
    const block = TASKS.slice(TASKS.indexOf('"/:id/assignees"'));
    expect(block).toContain('UPDATE tasks SET "assignedTo" = $1 WHERE id = $2');
  });

  it("DELETE primary auto-promotes a successor AND mirrors them into tasks.assignedTo", () => {
    const block = TASKS.slice(
      TASKS.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"'),
    );
    // The post-DELETE mirror happens inside the `if (removed.role ===
    // "primary")` branch.
    const branchIdx = block.indexOf('if (removed.role === "primary")');
    expect(branchIdx).toBeGreaterThan(0);
    const branchBody = block.slice(branchIdx, branchIdx + 1500);
    expect(branchBody).toContain('UPDATE tasks SET "assignedTo"');
  });
});

// ─── Invariant 6 — team operations are audit-logged ────────────────────────

describe("task_assignees — every mutation writes an audit log", () => {
  it("POST /:id/assignees writes audit log with action: assignee.add", () => {
    expect(TASKS).toContain('action: "assignee.add"');
  });

  it("DELETE /:id/assignees/:id writes audit log with action: assignee.remove", () => {
    expect(TASKS).toContain('action: "assignee.remove"');
  });

  it("PATCH /tasks/:id audit log includes the resolved assignees array", () => {
    const patchBlock = TASKS.slice(
      TASKS.indexOf('router.patch("/:id"'),
      TASKS.indexOf('router.get(\n  "/:id/assignees"'),
    );
    expect(patchBlock).toContain("assignees: bodyAssignees");
  });
});

// ─── Invariant 7 — list/detail responses surface the team ──────────────────

describe("List + detail responses surface the assignee team", () => {
  it("GET /tasks list includes assigneeCount (team size at a glance)", () => {
    expect(TASKS).toMatch(
      /\(SELECT COUNT\(\*\)::int FROM task_assignees ta\s*\n?\s*WHERE ta\."taskId" = t\.id AND ta\."removedAt" IS NULL\) AS "assigneeCount"/,
    );
  });

  it("GET /tasks/:id detail returns the full assignees array", () => {
    const detailBlock = TASKS.slice(
      TASKS.indexOf('router.get("/:id"'),
      TASKS.indexOf('router.post("/"'),
    );
    expect(detailBlock).toContain("fetchTaskAssignees(id, scope.companyId)");
    expect(detailBlock).toContain("assignees: team");
  });

  it("fetchTaskAssignees orders primary first, then by assignedAt", () => {
    expect(TASKS).toContain(
      'ORDER BY (ta.role = \'primary\') DESC, ta."assignedAt" ASC',
    );
  });
});

// ─── Invariant 8 — employee visibility scope ───────────────────────────────

describe("Employee scope — a team member can see/update the task", () => {
  it("GET / list query OR-joins task_assignees for employee role", () => {
    const listBlock = TASKS.slice(
      TASKS.indexOf('router.get("/"'),
      TASKS.indexOf('router.get("/entity-search"'),
    );
    expect(listBlock).toMatch(
      /scope\.role === "employee" && !scope\.isOwner && scope\.activeAssignmentId/,
    );
    expect(listBlock).toContain("EXISTS (");
    expect(listBlock).toContain("FROM task_assignees ta");
  });

  it("PATCH /:id update guard uses the same OR-EXISTS pattern", () => {
    const patchBlock = TASKS.slice(
      TASKS.indexOf('router.patch("/:id"'),
      TASKS.indexOf('router.get(\n  "/:id/assignees"'),
    );
    expect(patchBlock).toContain('tasks."assignedTo" = $');
    expect(patchBlock).toContain('FROM task_assignees ta');
    expect(patchBlock).toContain('WHERE ta."taskId" = tasks.id');
  });
});
