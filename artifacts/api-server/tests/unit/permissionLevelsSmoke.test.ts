import { describe, it, expect } from "vitest";
import {
  PERMISSION_LEVELS, SCOPE_TIERS, ACTION_LABELS_AR, SCOPE_LABELS_AR,
  expandLevel, levelOfActions, getPermissionLevelCatalog,
} from "../../src/lib/rbac/permissionLevels.js";
import type { Action, Scope } from "../../src/lib/rbac/featureCatalog.js";

const ALL_ACTIONS: Action[] = ["view","list","create","update","delete","approve","reject","cancel","export","print","share","submit","reopen","close"];
const ALL_SCOPES: Scope[] = ["self","team","department","department_tree","branch","branches","company","multi_company","all"];

describe("permission levels — Arabic unified model", () => {
  it("every action and scope has an Arabic label", () => {
    for (const a of ALL_ACTIONS) expect(ACTION_LABELS_AR[a]).toBeTruthy();
    for (const s of ALL_SCOPES) expect(SCOPE_LABELS_AR[s]).toBeTruthy();
  });

  it("levels are cumulative (each rank ⊇ previous)", () => {
    const sorted = [...PERMISSION_LEVELS].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Set(sorted[i - 1].actions);
      for (const a of prev) expect(sorted[i].actions).toContain(a);
    }
  });

  it("the four working levels map to intuitive Arabic names", () => {
    const byKey = Object.fromEntries(PERMISSION_LEVELS.map((l) => [l.key, l.labelAr]));
    expect(byKey.none).toContain("بلا");
    expect(byKey.view).toContain("عرض");
    expect(byKey.contribute).toContain("مسودة");
    expect(byKey.approve).toMatch(/اعتماد|رفض|إرجاع/);
    expect(byKey.manage).toContain("كامل");
  });

  it("'approve' level includes approve+reject+reopen (draft/approve/reject/return)", () => {
    const approve = PERMISSION_LEVELS.find((l) => l.key === "approve")!;
    expect(approve.actions).toEqual(expect.arrayContaining(["submit", "approve", "reject", "reopen"]));
    // but NOT destructive control
    expect(approve.actions).not.toContain("delete");
  });

  it("expandLevel restricts to a feature's available actions", () => {
    // a view/list-only feature shouldn't gain create from 'manage'
    expect(expandLevel("manage", ["view", "list"])).toEqual(expect.arrayContaining(["view", "list"]));
    expect(expandLevel("manage", ["view", "list"])).not.toContain("delete");
  });

  it("levelOfActions round-trips expandLevel", () => {
    for (const lvl of PERMISSION_LEVELS) {
      const actions = expandLevel(lvl.key);
      expect(levelOfActions(actions)).toBe(lvl.key);
    }
  });

  it("levelOfActions ignores unavailable actions when inferring", () => {
    // feature supports only view/list/create/submit → granting all of them is 'contribute'
    const avail: Action[] = ["view", "list", "create", "submit"];
    expect(levelOfActions(["view", "list", "create", "submit"], avail)).toBe("contribute");
  });

  it("scope tiers collapse 9 scopes into 5 Arabic tiers", () => {
    expect(SCOPE_TIERS.map((t) => t.key)).toEqual(["self", "department", "branch", "company", "all"]);
    expect(SCOPE_TIERS.find((t) => t.key === "department")!.scope).toBe("department_tree");
  });

  it("catalog is fully Arabic + UI-ready", () => {
    const c = getPermissionLevelCatalog();
    expect(c.levels.length).toBe(5);
    expect(c.scopeTiers.length).toBe(5);
    expect(c.levels.every((l) => l.labelAr && l.descriptionAr)).toBe(true);
  });
});
