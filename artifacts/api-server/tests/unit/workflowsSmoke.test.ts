import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const WF_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/workflows.ts"), "utf8");

// ─── Workflows Route Smoke Tests ────────────────────────────────────────────
// Static code analysis covering endpoints, permissions, companyId scoping,
// parameterized SQL, Zod validation, and workflow lifecycle actions.

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT EXISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Workflow endpoint registration", () => {
  it("POST /submit endpoint exists", () => {
    expect(WF_ROUTE).toContain('router.post("/submit"');
  });

  it("all workflow action POST endpoints exist (approve, reject, refer, escalate, return)", () => {
    expect(WF_ROUTE).toContain('"/:id/approve"');
    expect(WF_ROUTE).toContain('"/:id/reject"');
    expect(WF_ROUTE).toContain('"/:id/refer"');
    expect(WF_ROUTE).toContain('"/:id/escalate"');
    expect(WF_ROUTE).toContain('"/:id/return"');
  });

  it("GET timeline endpoints exist (by id and by ref)", () => {
    expect(WF_ROUTE).toContain('router.get("/:id/timeline"');
    expect(WF_ROUTE).toContain('"/timeline/:refTable/:refId"');
  });

  it("GET list, pending, and stats endpoints exist", () => {
    expect(WF_ROUTE).toContain('router.get("/",');
    expect(WF_ROUTE).toContain('router.get("/pending"');
    expect(WF_ROUTE).toContain('router.get("/stats"');
  });

  it("definition CRUD endpoints exist (GET list, GET :id, POST, PUT, DELETE)", () => {
    expect(WF_ROUTE).toContain('router.get("/definitions"');
    expect(WF_ROUTE).toContain('router.get("/definitions/:id"');
    expect(WF_ROUTE).toContain('router.post("/definitions"');
    expect(WF_ROUTE).toContain('router.put("/definitions/:id"');
    expect(WF_ROUTE).toContain('router.delete("/definitions/:id"');
  });

  it("SLA definition endpoints exist (GET and POST)", () => {
    expect(WF_ROUTE).toContain('router.get("/sla-definitions"');
    expect(WF_ROUTE).toContain('router.post("/sla-definitions"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Workflow permissions", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(WF_ROUTE).not.toContain("router.use(authMiddleware)");
  });

  it("write actions (submit, approve, reject, refer, escalate, return) require admin:write", () => {
    for (const path of ['"/submit"', '"/:id/approve"', '"/:id/reject"', '"/:id/refer"', '"/:id/escalate"', '"/:id/return"']) {
      const idx = WF_ROUTE.indexOf(path);
      const line = WF_ROUTE.slice(WF_ROUTE.lastIndexOf("\n", idx) + 1, WF_ROUTE.indexOf("\n", idx));
      expect(line).toContain('requirePermission("admin:write")');
    }
  });

  it("read actions (list, pending, stats, timeline) require admin:read", () => {
    for (const marker of ['router.get("/",', 'router.get("/pending"', 'router.get("/stats"', 'router.get("/:id/timeline"']) {
      const idx = WF_ROUTE.indexOf(marker);
      const line = WF_ROUTE.slice(idx, WF_ROUTE.indexOf("\n", idx));
      expect(line).toContain('requirePermission("admin:read")');
    }
  });

  it("definition write endpoints require admin:write", () => {
    for (const marker of ['router.post("/definitions"', 'router.put("/definitions/:id"', 'router.delete("/definitions/:id"']) {
      const idx = WF_ROUTE.indexOf(marker);
      const line = WF_ROUTE.slice(idx, WF_ROUTE.indexOf("\n", idx));
      expect(line).toContain('requirePermission("admin:write")');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY-ID SCOPING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Workflow companyId scoping", () => {
  it("list instances filters by companyId", () => {
    const idx = WF_ROUTE.indexOf('router.get("/",');
    const section = WF_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
  });

  it("pending list filters by companyId and assignee", () => {
    const idx = WF_ROUTE.indexOf('router.get("/pending"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("activeAssignmentId");
  });

  it("definitions list and detail scoped to companyId", () => {
    const listIdx = WF_ROUTE.indexOf('router.get("/definitions"');
    expect(WF_ROUTE.slice(listIdx, listIdx + 3000)).toContain('"companyId" = $1');

    const detailIdx = WF_ROUTE.indexOf('router.get("/definitions/:id"');
    expect(WF_ROUTE.slice(detailIdx, detailIdx + 3000)).toContain('"companyId" = $2');
  });

  it("delete and update definition scoped to companyId", () => {
    const delIdx = WF_ROUTE.indexOf('router.delete("/definitions/:id"');
    expect(WF_ROUTE.slice(delIdx, delIdx + 3000)).toContain('"companyId" = $2');

    const putIdx = WF_ROUTE.indexOf('router.put("/definitions/:id"');
    expect(WF_ROUTE.slice(putIdx, putIdx + 5000)).toContain('"companyId" = $8');
  });

  it("sla-definitions list and insert scoped to companyId", () => {
    const getIdx = WF_ROUTE.indexOf('router.get("/sla-definitions"');
    expect(WF_ROUTE.slice(getIdx, getIdx + 3000)).toContain('"companyId" = $1');

    const postIdx = WF_ROUTE.indexOf('router.post("/sla-definitions"');
    const section = WF_ROUTE.slice(postIdx, postIdx + 3000);
    expect(section).toContain("scope.companyId");
  });

  it("stats queries all scope to companyId (at least 4 occurrences)", () => {
    const idx = WF_ROUTE.indexOf('router.get("/stats"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    const matches = section.match(/"companyId" = \$1/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it("submit passes companyId and branchId from scope to workflow engine", () => {
    const idx = WF_ROUTE.indexOf('"/submit"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("companyId: scope.companyId");
    expect(section).toContain("branchId: scope.branchId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED SQL
// ═══════════════════════════════════════════════════════════════════════════════

describe("Workflow parameterized SQL", () => {
  it("list instances uses parameterized filters for status and requestType", () => {
    const idx = WF_ROUTE.indexOf('router.get("/",');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("$${params.length}");
    expect(section).toContain("params.push(status)");
    expect(section).toContain("params.push(requestType)");
  });

  it("create definition inserts with positional params $1-$7", () => {
    const idx = WF_ROUTE.indexOf('router.post("/definitions"');
    const section = WF_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("$1,$2,$3,$4,$5,$6,$7");
    expect(section).toContain("scope.companyId");
  });

  it("update definition uses positional params for SET (COALESCE) and WHERE", () => {
    const idx = WF_ROUTE.indexOf('router.put("/definitions/:id"');
    const section = WF_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("COALESCE($1,");
    expect(section).toContain("WHERE id = $7 AND");
  });

  it("sla-definitions insert uses ON CONFLICT upsert with params", () => {
    const idx = WF_ROUTE.indexOf('router.post("/sla-definitions"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("ON CONFLICT");
    expect(section).toContain("DO UPDATE SET");
  });

  it("workflow steps insert uses positional params $1-$8", () => {
    const idx = WF_ROUTE.indexOf('router.post("/definitions"');
    const section = WF_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("$1,$2,$3,$4,$5,$6,$7,$8");
    expect(section).toContain("INSERT INTO workflow_steps");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION (ZOD SCHEMAS)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Workflow Zod validation", () => {
  it("submit validates with submitSchema and requires requestType + title", () => {
    const schemaIdx = WF_ROUTE.indexOf("const submitSchema");
    const section = WF_ROUTE.slice(schemaIdx, schemaIdx + 500);
    expect(section).toContain("requestType: z.string().min(1)");
    expect(section).toContain("title: z.string().min(1)");

    const handlerIdx = WF_ROUTE.indexOf('"/submit"');
    const handler = WF_ROUTE.slice(handlerIdx, handlerIdx + 3000);
    expect(handler).toContain("submitSchema.safeParse");
    expect(handler).toContain("zodParse");
  });

  it("rejectSchema, returnSchema require notes; referSchema requires referredTo", () => {
    const rejectIdx = WF_ROUTE.indexOf("const rejectSchema");
    expect(WF_ROUTE.slice(rejectIdx, rejectIdx + 300)).toContain("notes: z.string().min(1)");

    const returnIdx = WF_ROUTE.indexOf("const returnSchema");
    expect(WF_ROUTE.slice(returnIdx, returnIdx + 300)).toContain("notes: z.string().min(1)");

    const referIdx = WF_ROUTE.indexOf("const referSchema");
    expect(WF_ROUTE.slice(referIdx, referIdx + 300)).toContain("referredTo: z.coerce.number()");
  });

  it("workflowStepSchema requires stepName and requiredRole", () => {
    const idx = WF_ROUTE.indexOf("const workflowStepSchema");
    const section = WF_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("stepName: z.string().min(1)");
    expect(section).toContain("requiredRole: z.string().min(1)");
  });

  it("createDefinitionSchema requires requestType and requestTypeLabel", () => {
    const idx = WF_ROUTE.indexOf("const createDefinitionSchema");
    const section = WF_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("requestType: z.string().min(1)");
    expect(section).toContain("requestTypeLabel: z.string().min(1)");
  });

  it("slaDefinitionSchema has warningHours, deadlineHours, escalationHours as coerced numbers", () => {
    const idx = WF_ROUTE.indexOf("const slaDefinitionSchema");
    const section = WF_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("warningHours: z.coerce.number()");
    expect(section).toContain("deadlineHours: z.coerce.number()");
    expect(section).toContain("escalationHours: z.coerce.number()");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE & AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

describe("Workflow lifecycle and audit", () => {
  it("submit creates audit log and emits workflow.instance.created", () => {
    const idx = WF_ROUTE.indexOf('"/submit"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("createAuditLog");
    expect(section).toContain('action: "create"');
    expect(section).toContain('entity: "workflow_instances"');
    expect(section).toContain("emitEvent");
    expect(section).toContain("workflow.instance.created");
  });

  it("approve emits workflow.instance.approved and reject emits workflow.instance.rejected", () => {
    const approveIdx = WF_ROUTE.indexOf('"/:id/approve"');
    expect(WF_ROUTE.slice(approveIdx, approveIdx + 3000)).toContain("workflow.instance.approved");

    const rejectIdx = WF_ROUTE.indexOf('"/:id/reject"');
    expect(WF_ROUTE.slice(rejectIdx, rejectIdx + 3000)).toContain("workflow.instance.rejected");
  });

  it("submit returns 201, create definition returns 201, sla-definitions returns 201", () => {
    const submitIdx = WF_ROUTE.indexOf('"/submit"');
    expect(WF_ROUTE.slice(submitIdx, submitIdx + 3000)).toContain("res.status(201)");

    const defIdx = WF_ROUTE.indexOf('router.post("/definitions"');
    expect(WF_ROUTE.slice(defIdx, defIdx + 5000)).toContain("res.status(201)");

    const slaIdx = WF_ROUTE.indexOf('router.post("/sla-definitions"');
    expect(WF_ROUTE.slice(slaIdx, slaIdx + 3000)).toContain("res.status(201)");
  });

  it("pending list orders by SLA status priority (escalated > exceeded > warning)", () => {
    const idx = WF_ROUTE.indexOf('router.get("/pending"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("CASE");
    expect(section).toContain("'escalated' THEN 0");
    expect(section).toContain("'exceeded' THEN 1");
    expect(section).toContain("'warning' THEN 2");
  });

  it("create definition inserts steps in order using i + 1 for stepOrder", () => {
    const idx = WF_ROUTE.indexOf('router.post("/definitions"');
    const section = WF_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("i + 1");
    expect(section).toContain('"stepOrder"');
  });

  it("update definition replaces steps by deleting and re-inserting", () => {
    const idx = WF_ROUTE.indexOf('router.put("/definitions/:id"');
    const section = WF_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain('DELETE FROM workflow_steps WHERE "definitionId"');
    expect(section).toContain("INSERT INTO workflow_steps");
  });

  it("definition detail fetches steps ordered by stepOrder", () => {
    const idx = WF_ROUTE.indexOf('router.get("/definitions/:id"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('ORDER BY "stepOrder"');
  });

  it("delete definition captures before-state and emits workflow.definition.deleted", () => {
    const idx = WF_ROUTE.indexOf('router.delete("/definitions/:id"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("createAuditLog");
    expect(section).toContain("emitEvent");
    expect(section).toContain("workflow.definition.deleted");
  });

  it("approve handler delegates errors to handleRouteError", () => {
    const idx = WF_ROUTE.indexOf('"/:id/approve"');
    const section = WF_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("handleRouteError");
  });

  it("list instances limits results to 200 rows", () => {
    const idx = WF_ROUTE.indexOf('router.get("/",');
    const section = WF_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("LIMIT 200");
  });
});
