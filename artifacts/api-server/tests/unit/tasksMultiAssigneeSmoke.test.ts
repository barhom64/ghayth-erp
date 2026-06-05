/**
 * Tasks — multi-assignee team + creator tracking — static guard.
 *
 * Verifies that the tasks system supports:
 *   1. tasks.createdBy column (the explicit creator id, not just audit logs).
 *   2. task_assignees junction table (multi-member team support).
 *   3. POST /tasks accepts an `assignees: []` array — first item is the
 *      accountable owner ("primary"), rest are members.
 *   4. PATCH /tasks supports reassignment and full-team replacement.
 *   5. POST /tasks/:id/assignees adds a member; DELETE removes one.
 *   6. Employee-scope rows where the user is a TEAM MEMBER (not just
 *      the primary) are visible in list + detail.
 *   7. Migration 250 backfills existing tasks.assignedTo into a
 *      task_assignees row and tasks.assignmentId into tasks.createdBy.
 *
 * Static-only: reads the source files and asserts the contracts hold.
 * Behavioral DB-level tests live in hrLeaveGoldenPath / hrBroadGoldenPath
 * (same harness pattern) and can be added later if needed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const TASKS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/tasks.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/api-server/src/migrations/250_task_assignees_team.sql",
  ),
  "utf8",
);

// ─── Migration 250: schema additions ─────────────────────────────────────

describe("Migration 250 — schema for multi-assignee tasks", () => {
  it("adds tasks.createdBy column", () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS "createdBy" INTEGER');
  });

  it("adds tasks.updatedAt column (for ownership-touch on team-only PATCH)", () => {
    expect(MIGRATION).toContain('"updatedAt" TIMESTAMPTZ');
  });

  it("creates task_assignees junction table", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS task_assignees");
    expect(MIGRATION).toMatch(/"taskId"\s+INTEGER NOT NULL/);
    expect(MIGRATION).toMatch(/"assignmentId"\s+INTEGER NOT NULL/);
    expect(MIGRATION).toMatch(/role\s+VARCHAR\(20\)/);
  });

  it("enforces role IN ('primary', 'member') via CHECK", () => {
    expect(MIGRATION).toContain("CHECK (role IN ('primary', 'member'))");
  });

  it("foreign key cascades on task delete", () => {
    expect(MIGRATION).toContain(
      'FOREIGN KEY ("taskId") REFERENCES tasks(id) ON DELETE CASCADE',
    );
  });

  it("foreign key restricts on assignment delete", () => {
    expect(MIGRATION).toContain(
      'FOREIGN KEY ("assignmentId") REFERENCES employee_assignments(id) ON DELETE RESTRICT',
    );
  });

  it("unique active assignee per task (partial index)", () => {
    expect(MIGRATION).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignees_active");
    expect(MIGRATION).toContain('("taskId", "assignmentId")');
    expect(MIGRATION).toContain('WHERE "removedAt" IS NULL');
  });

  it("hot-path index on (companyId, assignmentId) for 'my tasks' lookups", () => {
    expect(MIGRATION).toContain("idx_task_assignees_assignment");
    expect(MIGRATION).toContain('("companyId", "assignmentId")');
  });

  it("backfills existing assignedTo into task_assignees rows", () => {
    expect(MIGRATION).toContain("INSERT INTO task_assignees");
    expect(MIGRATION).toContain('SELECT t."companyId", t.id, t."assignedTo", \'primary\'');
  });

  it("backfills existing tasks.assignmentId into tasks.createdBy", () => {
    expect(MIGRATION).toContain('SET "createdBy" = "assignmentId"');
    expect(MIGRATION).toContain('WHERE "createdBy" IS NULL');
  });
});

// ─── Request schemas accept assignees: [] ────────────────────────────────

describe("Tasks API — schemas accept multi-assignee teams", () => {
  it("createTaskSchema declares `assignees: z.array(assigneeRefSchema)`", () => {
    expect(TASKS_ROUTE).toContain("assignees: z.array(assigneeRefSchema).optional()");
  });

  it("updateTaskSchema declares `assignees` for team replacement", () => {
    // Same field name surfaces in both create and update schemas.
    const updateBlock = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf("updateTaskSchema"),
      TASKS_ROUTE.indexOf("updateTaskSchema") + 1000,
    );
    expect(updateBlock).toContain("assignees: z.array(assigneeRefSchema)");
  });

  it("assigneeRefSchema accepts string or number references", () => {
    expect(TASKS_ROUTE).toContain(
      "z.union([z.string(), z.coerce.number()])",
    );
  });

  it("assigneeMutationSchema for /:id/assignees endpoints", () => {
    expect(TASKS_ROUTE).toContain("assigneeMutationSchema");
    expect(TASKS_ROUTE).toContain(
      'role: z.enum(["primary", "member"]).optional().default("member")',
    );
  });
});

// ─── POST /tasks resolves the team + writes junction rows ────────────────

describe("POST /tasks — team resolution & junction writes", () => {
  const POST_BLOCK = TASKS_ROUTE.slice(
    TASKS_ROUTE.indexOf('router.post("/"'),
    TASKS_ROUTE.indexOf('router.patch("/:id"'),
  );

  it("treats bodyAssignees as the canonical team source (overrides assignedTo)", () => {
    expect(POST_BLOCK).toContain("if (bodyAssignees && bodyAssignees.length > 0)");
  });

  it("falls back to bodyAssignedTo when assignees not provided", () => {
    expect(POST_BLOCK).toContain("else if (");
    expect(POST_BLOCK).toContain("bodyAssignedTo !== undefined");
  });

  it("falls back to creator (self-assign) when no team specified", () => {
    expect(POST_BLOCK).toContain("else if (scope.activeAssignmentId)");
    expect(POST_BLOCK).toContain("resolvedTeam = [scope.activeAssignmentId]");
  });

  it("dedupes the resolved team while preserving order", () => {
    expect(POST_BLOCK).toContain("const seen = new Set<number>()");
    expect(POST_BLOCK).toContain("if (!seen.has(id))");
  });

  it("first team member becomes 'primary'; rest become 'member'", () => {
    expect(POST_BLOCK).toContain('const role = i === 0 ? "primary" : "member"');
  });

  it("writes tasks.createdBy = scope.activeAssignmentId", () => {
    expect(POST_BLOCK).toContain('"createdBy"');
    // The INSERT binds createdBy at $5 — scope.activeAssignmentId is passed.
    expect(POST_BLOCK).toContain("scope.activeAssignmentId");
  });

  it("primary id is mirrored into legacy tasks.assignedTo column", () => {
    expect(POST_BLOCK).toContain("primaryAssigneeId = resolvedTeam[0] ?? null");
    expect(POST_BLOCK).toContain("primaryAssigneeId");
  });

  it("response shape includes team via fetchTaskAssignees", () => {
    expect(POST_BLOCK).toContain("fetchTaskAssignees(rows[0].id, scope.companyId)");
    expect(POST_BLOCK).toContain("assignees: team");
  });
});

// ─── PATCH /tasks/:id supports reassignment ───────────────────────────────

describe("PATCH /tasks/:id — reassignment & team replacement", () => {
  const PATCH_BLOCK = TASKS_ROUTE.slice(
    TASKS_ROUTE.indexOf('router.patch("/:id"'),
    TASKS_ROUTE.indexOf('router.get(\n  "/:id/assignees"'),
  );

  it("accepts assignedTo for primary reassignment", () => {
    expect(PATCH_BLOCK).toContain("bodyAssignedTo");
    expect(PATCH_BLOCK).toContain('addField("assignedTo", primaryReassignTo)');
  });

  it("accepts assignees array for full team replacement", () => {
    expect(PATCH_BLOCK).toContain("if (bodyAssignees !== undefined)");
  });

  it("removed members get soft-removed (removedAt = NOW())", () => {
    expect(PATCH_BLOCK).toContain('SET "removedAt" = NOW()');
  });

  it("new members inserted into task_assignees", () => {
    expect(PATCH_BLOCK).toContain("INSERT INTO task_assignees");
  });

  it("existing-but-re-roled members are UPDATEd not duplicated", () => {
    expect(PATCH_BLOCK).toContain("UPDATE task_assignees SET role");
  });
});

// ─── /tasks/:id/assignees CRUD endpoints ─────────────────────────────────

describe("Team-management endpoints", () => {
  it("GET /:id/assignees returns the team roster", () => {
    expect(TASKS_ROUTE).toContain('router.get(\n  "/:id/assignees"');
    expect(TASKS_ROUTE).toContain("fetchTaskAssignees(id, scope.companyId)");
  });

  it("POST /:id/assignees adds a member", () => {
    expect(TASKS_ROUTE).toContain('router.post(\n  "/:id/assignees"');
    expect(TASKS_ROUTE).toContain('"assignee.add"');
  });

  it("POST /:id/assignees with role='primary' demotes existing primary", () => {
    expect(TASKS_ROUTE).toMatch(/UPDATE task_assignees SET role = 'member'\s*\n\s*WHERE "taskId" = \$1/);
  });

  it("POST /:id/assignees with role='primary' mirrors into tasks.assignedTo", () => {
    const block = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('"/:id/assignees"'),
    );
    expect(block).toContain("UPDATE tasks SET \"assignedTo\" = $1 WHERE id = $2");
  });

  it("POST /:id/assignees uses SELECT-then-INSERT-or-UPDATE (avoids ON CONFLICT DO UPDATE SET drift-check false positive)", () => {
    const block = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('"/:id/assignees"'),
    );
    expect(block).toContain("SELECT id FROM task_assignees");
    expect(block).toContain('UPDATE task_assignees SET role = $1 WHERE id = $2');
    // The `ON CONFLICT (...) DO UPDATE SET ...` pattern only appears
    // inside an explanatory `//` comment now — never inside an actual
    // rawQuery template. Verify no rawQuery template literal contains
    // both the ON CONFLICT keyword and the DO UPDATE SET clause.
    const templateLiteralRe = /`[^`]+`/g;
    let m: RegExpExecArray | null;
    while ((m = templateLiteralRe.exec(block)) !== null) {
      if (m[0].includes("ON CONFLICT") && m[0].includes("DO UPDATE SET")) {
        throw new Error(
          `rawQuery template still uses DO UPDATE SET: ${m[0].slice(0, 80)}`,
        );
      }
    }
  });

  it("DELETE /:id/assignees/:assignmentId soft-removes (sets removedAt)", () => {
    expect(TASKS_ROUTE).toContain('router.delete(\n  "/:id/assignees/:assignmentId"');
    expect(TASKS_ROUTE).toContain('SET "removedAt" = NOW()');
  });

  it("DELETE auto-promotes oldest remaining member when primary is removed", () => {
    const block = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"'),
    );
    expect(block).toContain('if (removed.role === "primary")');
    expect(block).toContain("UPDATE task_assignees SET role = 'primary'");
  });

  it("DELETE clears assignedTo when team becomes empty", () => {
    const block = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('router.delete(\n  "/:id/assignees/:assignmentId"'),
    );
    expect(block).toContain('SET "assignedTo" = NULL');
  });
});

// ─── List & detail scope: team members can see "their" tasks ─────────────

describe("Employee scope — team members see their tasks", () => {
  it("GET / employee filter OR-joins task_assignees membership", () => {
    expect(TASKS_ROUTE).toContain(
      'WHERE ta."taskId" = t.id AND ta."assignmentId" = $',
    );
  });

  it("GET /:id employee filter OR-joins task_assignees membership", () => {
    const detailBlock = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('router.get("/:id"'),
      TASKS_ROUTE.indexOf('router.post("/"'),
    );
    expect(detailBlock).toContain('OR EXISTS (');
    expect(detailBlock).toContain('FROM task_assignees ta');
  });
});

// ─── Response payload includes creator info ──────────────────────────────

describe("Response payload — creator (createdBy + creatorName)", () => {
  it("list query returns t.createdBy + creator.name AS creatorName", () => {
    const listBlock = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('router.get("/"'),
      TASKS_ROUTE.indexOf('router.get("/entity-search"'),
    );
    expect(listBlock).toContain('t."createdBy"');
    expect(listBlock).toContain('creator.name AS "creatorName"');
  });

  it("detail query returns creator.name AS creatorName", () => {
    const detailBlock = TASKS_ROUTE.slice(
      TASKS_ROUTE.indexOf('router.get("/:id"'),
      TASKS_ROUTE.indexOf('router.post("/"'),
    );
    expect(detailBlock).toContain('creator.name AS "creatorName"');
  });

  it("list query returns assigneeCount (team size)", () => {
    expect(TASKS_ROUTE).toMatch(/SELECT COUNT\(\*\)::int FROM task_assignees ta\s*\n\s*WHERE ta\."taskId" = t\.id/);
  });
});
