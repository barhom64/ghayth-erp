/**
 * Auto-assign tests for the inbox classifier. Pure-function pieces of
 * the role priority resolver — exercises the role list per task type
 * + the SQL ORDER BY CASE shape, without touching the DB.
 */
import { describe, it, expect } from "vitest";
import { rolePriorityCase, ROLES_BY_TASK_TYPE } from "../../src/lib/inboxClassifier.js";

describe("ROLES_BY_TASK_TYPE", () => {
  it("every known task type ends at owner so a sparse org chart still resolves", () => {
    for (const [type, roles] of Object.entries(ROLES_BY_TASK_TYPE)) {
      expect(roles[roles.length - 1], `${type} should fall through to owner`).toBe("owner");
    }
  });

  it("billing routes through accountant → finance_manager first", () => {
    expect(ROLES_BY_TASK_TYPE.billing[0]).toBe("accountant");
    expect(ROLES_BY_TASK_TYPE.billing[1]).toBe("finance_manager");
  });

  it("complaint routes through support_manager → branch_manager first", () => {
    expect(ROLES_BY_TASK_TYPE.complaint[0]).toBe("support_manager");
    expect(ROLES_BY_TASK_TYPE.complaint[1]).toBe("branch_manager");
  });
});

describe("rolePriorityCase", () => {
  it("returns the role list and a SQL CASE clause matching the list order", () => {
    const { roles, orderCase } = rolePriorityCase("complaint");
    expect(roles).toEqual(["support_manager", "branch_manager", "general_manager", "owner"]);
    expect(orderCase).toBe(
      "CASE role WHEN 'support_manager' THEN 1 WHEN 'branch_manager' THEN 2 WHEN 'general_manager' THEN 3 WHEN 'owner' THEN 4 ELSE 5 END",
    );
  });

  it("qualifies the column when passed an alias (avoids ambiguous-column SQL error)", () => {
    const { orderCase } = rolePriorityCase("billing", "ea.role");
    expect(orderCase).toContain("CASE ea.role");
    expect(orderCase).not.toMatch(/CASE role /);
  });

  it("falls back to general_manager + owner for unknown task types", () => {
    const { roles } = rolePriorityCase("zzz_unknown");
    expect(roles).toEqual(["general_manager", "owner"]);
  });

  it("ELSE clause uses length+1 so unknown roles sort after the listed ones", () => {
    const { orderCase } = rolePriorityCase("urgent");
    // urgent → branch_manager, general_manager, owner (3 roles) → ELSE 4
    expect(orderCase).toMatch(/ELSE 4 END$/);
  });
});
