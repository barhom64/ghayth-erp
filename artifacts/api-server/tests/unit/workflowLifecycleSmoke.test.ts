import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const WORKFLOW = read("workflowEngine.ts");
const LIFECYCLE = read("lifecycleEngine.ts");
const RULES = read("rulesEngine.ts");
const POLICY = read("policyEngine.ts");

// ══════════════════════════════════════════════════════════════════════════
// WORKFLOW ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("workflowEngine — exported functions", () => {
  it("exports submitWorkflow", () => {
    expect(WORKFLOW).toContain("export async function submitWorkflow");
  });

  it("exports approveWorkflow", () => {
    expect(WORKFLOW).toContain("export async function approveWorkflow");
  });

  it("exports rejectWorkflow", () => {
    expect(WORKFLOW).toContain("export async function rejectWorkflow");
  });

  it("exports referWorkflow", () => {
    expect(WORKFLOW).toContain("export async function referWorkflow");
  });

  it("exports escalateWorkflow", () => {
    expect(WORKFLOW).toContain("export async function escalateWorkflow");
  });

  it("exports returnWorkflow", () => {
    expect(WORKFLOW).toContain("export async function returnWorkflow");
  });

  it("exports getTimeline", () => {
    expect(WORKFLOW).toContain("export async function getTimeline");
  });

  it("exports getTimelineByRef", () => {
    expect(WORKFLOW).toContain("export async function getTimelineByRef");
  });

  it("exports checkSlaStatus", () => {
    expect(WORKFLOW).toContain("export async function checkSlaStatus");
  });
});

describe("workflowEngine — WorkflowAction type", () => {
  it("exports WorkflowAction type", () => {
    expect(WORKFLOW).toContain("export type WorkflowAction");
  });

  for (const action of ["submit", "approve", "reject", "refer", "escalate", "return"]) {
    it(`includes action: ${action}`, () => {
      expect(WORKFLOW).toContain(`"${action}"`);
    });
  }
});

describe("workflowEngine — domain-specific approval handlers", () => {
  it("handles leave approval", () => {
    expect(WORKFLOW).toContain("handleLeaveApproval");
  });

  it("creates audit logs", () => {
    expect(WORKFLOW).toContain("createAuditLog");
  });

  it("creates notifications", () => {
    expect(WORKFLOW).toContain("createNotification");
  });

  it("emits events", () => {
    expect(WORKFLOW).toContain("emitEvent");
  });
});

describe("workflowEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...WORKFLOW.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(30);
  });

  it("scopes by companyId", () => {
    const matches = [...WORKFLOW.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// LIFECYCLE ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("lifecycleEngine — exports", () => {
  it("exports applyTransition", () => {
    expect(LIFECYCLE).toContain("export async function applyTransition");
  });

  it("exports lifecycleErrorResponse", () => {
    expect(LIFECYCLE).toContain("export function lifecycleErrorResponse");
  });

  it("exports assertTransition", () => {
    expect(LIFECYCLE).toContain("export function assertTransition");
  });

  it("exports getStateMachine", () => {
    expect(LIFECYCLE).toContain("export function getStateMachine");
  });

  it("exports isValidTransition", () => {
    expect(LIFECYCLE).toContain("export function isValidTransition");
  });

  it("exports LifecycleError class", () => {
    expect(LIFECYCLE).toContain("export class LifecycleError");
  });
});

describe("lifecycleEngine — interfaces", () => {
  it("exports LifecycleScope", () => {
    expect(LIFECYCLE).toContain("export interface LifecycleScope");
  });

  it("exports LifecycleNotification", () => {
    expect(LIFECYCLE).toContain("export interface LifecycleNotification");
  });

  it("exports ApplyTransitionOptions", () => {
    expect(LIFECYCLE).toContain("export interface ApplyTransitionOptions");
  });

  it("exports StateMachine interface", () => {
    expect(LIFECYCLE).toContain("export interface StateMachine");
  });
});

describe("lifecycleEngine — STATE_MACHINES registry", () => {
  it("exports STATE_MACHINES array", () => {
    expect(LIFECYCLE).toContain("export const STATE_MACHINES");
  });
});

describe("lifecycleEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...LIFECYCLE.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });

  it("scopes by companyId", () => {
    const matches = [...LIFECYCLE.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RULES ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("rulesEngine — exports", () => {
  it("exports evaluateRulesForEvent", () => {
    expect(RULES).toContain("export async function evaluateRulesForEvent");
  });

  it("exports registerRulesEngineListener", () => {
    expect(RULES).toContain("export function registerRulesEngineListener");
  });
});

describe("rulesEngine — condition evaluation", () => {
  it("has evaluateCondition function", () => {
    expect(RULES).toContain("function evaluateCondition");
  });

  it("has interpolateTemplate function", () => {
    expect(RULES).toContain("function interpolateTemplate");
  });

  it("has executeAction function", () => {
    expect(RULES).toContain("function executeAction");
  });

  it("logs rule executions", () => {
    expect(RULES).toContain("logRuleExecution");
  });
});

describe("rulesEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...RULES.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// POLICY ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("policyEngine — exports", () => {
  it("exports SEPARATION_OF_DUTIES", () => {
    expect(POLICY).toContain("export const SEPARATION_OF_DUTIES");
  });

  it("exports MAX_PRIVILEGE_RULES", () => {
    expect(POLICY).toContain("export const MAX_PRIVILEGE_RULES");
  });

  it("exports SENSITIVE_OPERATIONS", () => {
    expect(POLICY).toContain("export const SENSITIVE_OPERATIONS");
  });

  it("exports ROLE_STRATEGIES", () => {
    expect(POLICY).toContain("export const ROLE_STRATEGIES");
  });

  it("exports auditSeparationOfDuties", () => {
    expect(POLICY).toContain("export async function auditSeparationOfDuties");
  });

  it("exports auditMaxPrivilege", () => {
    expect(POLICY).toContain("export async function auditMaxPrivilege");
  });

  it("exports runFullPolicyAudit", () => {
    expect(POLICY).toContain("export async function runFullPolicyAudit");
  });

  it("exports getSensitiveOperation", () => {
    expect(POLICY).toContain("export function getSensitiveOperation");
  });

  it("exports getRoleStrategy", () => {
    expect(POLICY).toContain("export function getRoleStrategy");
  });
});

describe("policyEngine — PolicyViolation type", () => {
  it("exports PolicyViolation interface", () => {
    expect(POLICY).toContain("export interface PolicyViolation");
  });

  it("exports RoleStrategy interface", () => {
    expect(POLICY).toContain("export interface RoleStrategy");
  });
});
