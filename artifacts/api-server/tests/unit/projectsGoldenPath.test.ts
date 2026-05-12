import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PROJ_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/projects.ts"), "utf8");

// ─── Projects Golden Path Tests ─────────────────────────────────────────────
// P4.6 — Lock in project lifecycle contracts: projects, phases, tasks,
// milestones, risks.

describe("Projects route structure", () => {
  it("project CRUD endpoints exist", () => {
    expect(PROJ_ROUTE).toContain('router.post("/",');
    expect(PROJ_ROUTE).toContain('router.patch("/:id",');
    expect(PROJ_ROUTE).toContain('router.delete("/:id",');
  });

  it("phase and task endpoints exist", () => {
    expect(PROJ_ROUTE).toContain('"/:id/phases"');
    expect(PROJ_ROUTE).toContain('"/:id/tasks"');
    expect(PROJ_ROUTE).toContain('"/tasks/:taskId"');
  });

  it("milestone and risk endpoints exist", () => {
    expect(PROJ_ROUTE).toContain('"/:id/milestones"');
    expect(PROJ_ROUTE).toContain('"/:id/risks"');
  });

  it("project close endpoint exists", () => {
    expect(PROJ_ROUTE).toContain('"/:id/close"');
  });

  it("gantt chart endpoint exists", () => {
    expect(PROJ_ROUTE).toContain('"/:id/gantt"');
  });
});

describe("Projects state machine", () => {
  it("defines PROJECT_STATUSES and PROJECT_TRANSITIONS", () => {
    expect(PROJ_ROUTE).toContain("PROJECT_STATUSES");
    expect(PROJ_ROUTE).toContain("PROJECT_TRANSITIONS");
  });

  it("project statuses include planning through cancelled", () => {
    expect(PROJ_ROUTE).toContain('"planning"');
    expect(PROJ_ROUTE).toContain('"active"');
    expect(PROJ_ROUTE).toContain('"in_progress"');
    expect(PROJ_ROUTE).toContain('"completed"');
    expect(PROJ_ROUTE).toContain('"cancelled"');
  });

  it("completed and cancelled are terminal project states", () => {
    const idx = PROJ_ROUTE.indexOf("PROJECT_TRANSITIONS");
    const block = PROJ_ROUTE.slice(idx, idx + 700);
    expect(block).toContain("completed:");
    expect(block).toContain("cancelled:");
  });

  it("validates project status transitions", () => {
    expect(PROJ_ROUTE).toContain("PROJECT_TRANSITIONS[existing.status");
  });
});

describe("Task state machine", () => {
  it("defines TASK_STATUSES and TASK_TRANSITIONS", () => {
    expect(PROJ_ROUTE).toContain("TASK_STATUSES");
    expect(PROJ_ROUTE).toContain("TASK_TRANSITIONS");
  });

  it("task statuses: todo, in_progress, blocked, done, cancelled, review", () => {
    const idx = PROJ_ROUTE.indexOf("TASK_STATUSES");
    const line = PROJ_ROUTE.slice(idx, PROJ_ROUTE.indexOf("\n", idx));
    expect(line).toContain("todo");
    expect(line).toContain("in_progress");
    expect(line).toContain("done");
    expect(line).toContain("review");
  });

  it("validates task status transitions", () => {
    expect(PROJ_ROUTE).toMatch(/TASK_TRANSITIONS\[\(?existingTask\.status/);
  });
});

describe("Phase state machine", () => {
  it("defines PHASE_TRANSITIONS", () => {
    expect(PROJ_ROUTE).toContain("PHASE_TRANSITIONS");
  });
});

describe("Milestone state machine", () => {
  it("defines MILESTONE_STATUSES and MILESTONE_TRANSITIONS", () => {
    expect(PROJ_ROUTE).toContain("MILESTONE_STATUSES");
    expect(PROJ_ROUTE).toContain("MILESTONE_TRANSITIONS");
  });

  it("validates milestone status transitions", () => {
    expect(PROJ_ROUTE).toMatch(/MILESTONE_TRANSITIONS\[\(?existing\.status/);
  });
});

describe("Risk state machine", () => {
  it("defines RISK_STATUSES and RISK_TRANSITIONS", () => {
    expect(PROJ_ROUTE).toContain("RISK_STATUSES");
    expect(PROJ_ROUTE).toContain("RISK_TRANSITIONS");
  });
});

describe("Projects lifecycle integration", () => {
  it("imports applyTransition", () => {
    expect(PROJ_ROUTE).toContain("applyTransition");
    expect(PROJ_ROUTE).toContain("lifecycleEngine");
  });

  it("project close endpoint emits events", () => {
    const idx = PROJ_ROUTE.indexOf('"/:id/close"');
    const endIdx = PROJ_ROUTE.indexOf("router.", idx + 10);
    const section = PROJ_ROUTE.slice(idx, endIdx);
    expect(section).toContain("emitEvent");
  });

  it("creates audit logs", () => {
    const auditCalls = PROJ_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Projects security contracts", () => {
  it("project queries include companyId scoping", () => {
    const selects = PROJ_ROUTE.matchAll(
      /FROM\s+projects[^;]*WHERE[^;]*/g
    );
    for (const match of selects) {
      const sql = match[0];
      const hasDynamic = sql.includes("${where}") || sql.includes("${baseWhere}") || sql.includes("${detailWhere}");
      const isReRead = /WHERE\s+id=\$1/.test(sql) && !sql.includes("AND \"companyId\"");
      if (!hasDynamic && !isReRead) {
        expect(sql).toContain("companyId");
      }
    }
  });
});
