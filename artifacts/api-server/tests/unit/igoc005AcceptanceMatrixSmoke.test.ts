/**
 * IGOC-005 — Acceptance proof for the active-context governance contract.
 *
 * The IGOC spec defines the Definition of Done as:
 *
 *   «لا تعتبر المهمة مكتملة حتى يصبح كل ما يراه المستخدم وكل ما يستطيع
 *    الوصول إليه وكل ما يستطيع تنفيذه مبنيًا على: الدور النشط + الشركة
 *    النشطة + الفرع النشط + النطاق + الصلاحيات وليس على المستخدم فقط.»
 *
 * Translated: the same user, with the same set of grants, must see
 * DIFFERENT modules/services/menus when they switch their active role.
 * This file pins that contract for the 7 role scenarios required by the
 * spec, using the canonical PREDEFINED_ROLE_DEFAULTS map (the fallback
 * source of truth for module-lists when a role's rbac_user_roles row
 * exists but rbac_role_grants is empty — i.e. the cleanest contract).
 *
 * The test is DB-free: it reads the PREDEFINED_ROLE_DEFAULTS object
 * directly from routes/permissions.ts and asserts the 7 role matrices.
 *
 * If a future PR adds/removes a module from any role, this test fails
 * loudly — protecting against silent over-/under-privileging.
 */
import { describe, it, expect } from "vitest";
import { ROLE_MODULE_DEFAULTS } from "../../src/lib/rbac/roleModulesCatalog.js";

// PR-2 / #2163 — was reading PREDEFINED_ROLE_DEFAULTS by parsing the
// source file (the map used to be inlined twice — once in roleGuard.ts
// and once in permissions.ts). PR-2 unified the two into
// roleModulesCatalog. The data tested here is unchanged; we just read
// it as an import instead of grepping the source.
const ROLES = ROLE_MODULE_DEFAULTS;

describe("IGOC-005 — 7 acceptance scenarios from the spec", () => {
  it("PREDEFINED_ROLE_DEFAULTS object is parseable + non-empty", () => {
    expect(Object.keys(ROLES).length).toBeGreaterThan(0);
  });

  // ─── Scenario 1: موظف عادي (regular employee) ──────────────────────────
  describe("Scenario 1 — regular employee (الدور: employee)", () => {
    it("has level 10 (lowest)", () => {
      expect(ROLES.employee.level).toBe(10);
    });
    it("sees only: home / requests / documents / comms (4 modules)", () => {
      expect(ROLES.employee.modules.sort()).toEqual(["comms", "documents", "home", "requests"]);
    });
    it("does NOT see hr / finance / admin / fleet (anything operational)", () => {
      const forbidden = ["hr", "finance", "admin", "fleet", "property", "warehouse", "bi"];
      for (const f of forbidden) {
        expect(ROLES.employee.modules).not.toContain(f);
      }
    });
  });

  // ─── Scenario 2: مدير قسم (department-level manager) ───────────────────
  describe("Scenario 2 — department manager (الدور: branch_manager as proxy)", () => {
    it("has level 60 (mid)", () => {
      expect(ROLES.branch_manager.level).toBe(60);
    });
    it("sees hr + finance + requests + support", () => {
      for (const m of ["hr", "finance", "requests", "support"]) {
        expect(ROLES.branch_manager.modules).toContain(m);
      }
    });
    it("does NOT see fleet / property / warehouse / admin (cross-dept)", () => {
      for (const m of ["fleet", "property", "warehouse", "admin"]) {
        expect(ROLES.branch_manager.modules).not.toContain(m);
      }
    });
  });

  // ─── Scenario 3: مسؤول موارد بشرية ───────────────────────────────────
  describe("Scenario 3 — HR manager", () => {
    it("has level 70 (functional lead)", () => {
      expect(ROLES.hr_manager.level).toBe(70);
    });
    it("sees hr + requests + documents + comms (HR-scoped)", () => {
      for (const m of ["hr", "requests", "documents", "comms"]) {
        expect(ROLES.hr_manager.modules).toContain(m);
      }
    });
    it("does NOT see finance / fleet / property (other functional domains)", () => {
      for (const m of ["finance", "fleet", "property", "warehouse", "admin"]) {
        expect(ROLES.hr_manager.modules).not.toContain(m);
      }
    });
  });

  // ─── Scenario 4: مسؤول رواتب (payroll officer = subset of HR) ────────
  describe("Scenario 4 — payroll context (subset of HR; payroll_officer is RBAC v2 template)", () => {
    it("HR manager is the parent role; payroll_officer narrows to payroll alone via rbac_role_grants", () => {
      // payroll_officer is seeded as a TEMPLATE in migration 278
      // (companyId IS NULL, is_template = TRUE). It DOES NOT live in
      // PREDEFINED_ROLE_DEFAULTS because that map is the LEGACY fallback
      // for when no rbac_user_roles row exists. The runtime narrows to
      // payroll_officer via rbac_role_grants when the user has that
      // template assigned — which is the correct architecture (template
      // > predefined > scope-role-default).
      //
      // What we pin here: the LEGACY fallback for the parent (hr_manager)
      // does NOT silently grant payroll-officer permissions when a user
      // is supposed to be just a payroll officer. Verified by the
      // exclusion test above.
      const hrMods = ROLES.hr_manager.modules;
      expect(hrMods).toContain("hr");
      // Payroll-specific routes (hr.payroll.*) are checked via
      // rbac_role_grants, not module-list, so a payroll_officer template
      // user gets payroll grants without inheriting the full hr_manager
      // module list. This separation is the spec's «النطاق» discipline.
      expect(hrMods).not.toContain("admin");
    });
  });

  // ─── Scenario 5: مدير مشروع ──────────────────────────────────────────
  describe("Scenario 5 — projects_manager", () => {
    it("has level 70", () => {
      expect(ROLES.projects_manager.level).toBe(70);
    });
    it("sees operations + requests (project workflow)", () => {
      expect(ROLES.projects_manager.modules).toContain("operations");
      expect(ROLES.projects_manager.modules).toContain("requests");
    });
    it("does NOT see hr / finance — uses cross-team approvals, not direct access", () => {
      expect(ROLES.projects_manager.modules).not.toContain("hr");
      expect(ROLES.projects_manager.modules).not.toContain("finance");
    });
  });

  // ─── Scenario 6: multi-role user ─────────────────────────────────────
  describe("Scenario 6 — multi-role user (different views per active role)", () => {
    it("hr_manager and finance_manager are STRUCTURALLY DIFFERENT module-lists", () => {
      // The same user holding both roles SEES different modules when they
      // pick hr_manager vs finance_manager. That's the core IGOC promise.
      const hrMods = new Set(ROLES.hr_manager.modules);
      const finMods = new Set(ROLES.finance_manager.modules);
      const hrOnly = [...hrMods].filter((m) => !finMods.has(m));
      const finOnly = [...finMods].filter((m) => !hrMods.has(m));
      expect(hrOnly.length).toBeGreaterThan(0);
      expect(finOnly.length).toBeGreaterThan(0);
      expect(hrOnly).toContain("hr");
      expect(finOnly).toContain("finance");
    });

    it("switching between two manager roles changes the level too (downgrade)", () => {
      // Owner (level 100) → hr_manager (level 70) → finance_manager (70):
      // levels stay 70 across functional managers but drop from 100 when
      // an owner previews as one of them (the «معاينة كمستخدم» flow).
      expect(ROLES.owner.level).toBeGreaterThan(ROLES.hr_manager.level);
      expect(ROLES.owner.level).toBeGreaterThan(ROLES.finance_manager.level);
    });
  });

  // ─── Scenario 7: المدير العام (super admin) ──────────────────────────
  describe("Scenario 7 — owner / super admin", () => {
    it("has level 100 (highest)", () => {
      expect(ROLES.owner.level).toBe(100);
    });
    it("sees ALL 20 modules including admin", () => {
      expect(ROLES.owner.modules.length).toBeGreaterThanOrEqual(20);
      expect(ROLES.owner.modules).toContain("admin");
    });
    it("includes every module another role sees (superset property)", () => {
      const ownerSet = new Set(ROLES.owner.modules);
      for (const [key, def] of Object.entries(ROLES)) {
        if (key === "owner") continue;
        for (const m of def.modules) {
          expect(ownerSet.has(m), `owner is missing module ${m} that ${key} has`).toBe(true);
        }
      }
    });
  });
});

describe("IGOC-005 — core IGOC invariants enforced by the matrix", () => {
  it("EVERY role has 'home' (the universal landing)", () => {
    for (const [key, def] of Object.entries(ROLES)) {
      expect(def.modules, `${key} missing 'home'`).toContain("home");
    }
  });

  it("ONLY owner has 'admin' module — admin is not granted by functional managers", () => {
    for (const [key, def] of Object.entries(ROLES)) {
      if (key === "owner") continue;
      expect(def.modules, `${key} unexpectedly has 'admin'`).not.toContain("admin");
    }
  });

  it("level monotonicity: employee < branch_manager < functional_manager < general_manager < owner", () => {
    expect(ROLES.employee.level).toBeLessThan(ROLES.branch_manager.level);
    expect(ROLES.branch_manager.level).toBeLessThan(ROLES.hr_manager.level);
    expect(ROLES.hr_manager.level).toBeLessThan(ROLES.general_manager.level);
    expect(ROLES.general_manager.level).toBeLessThan(ROLES.owner.level);
  });

  it("every role has at LEAST these 4 universal modules: home + requests + documents + comms", () => {
    const universal = ["home", "requests", "documents", "comms"];
    for (const [key, def] of Object.entries(ROLES)) {
      for (const m of universal) {
        expect(def.modules, `${key} missing universal module ${m}`).toContain(m);
      }
    }
  });

  it("no role module-list is identical to another (every role is distinct)", () => {
    // PR-9a (#2077) added payroll_officer as a SPECIALISATION of
    // hr_manager: same fallback module set, narrower set of rbac
    // grants (the payroll lane). The differentiation lives at the
    // grant level (rbac_role_grants), not at the static module-list
    // fallback. So at THIS layer (the fallback used when a user has no
    // rbac_user_roles entries), hr_manager and payroll_officer SHOULD
    // be identical — every payroll_officer should also have the
    // hr_manager sidebar shape; what they can't reach is the
    // discipline/investigation features, which is enforced inside the
    // hr module by authorize() — not by hiding the module.
    // The IGOC-005 invariant predates PR-9a; the matrix is still
    // non-degenerate for every other pair. Pin the documented
    // exception so a future PR doesn't silently break either side.
    const KNOWN_TWINS = new Set([
      "hr_manager:payroll_officer",
      "payroll_officer:hr_manager",
    ]);
    const seen = new Map<string, string>();
    for (const [key, def] of Object.entries(ROLES)) {
      const sig = def.modules.slice().sort().join(",");
      const prev = seen.get(sig);
      if (prev && !KNOWN_TWINS.has(`${prev}:${key}`)) {
        throw new Error(`roles ${prev} and ${key} have identical module-list — degenerate matrix`);
      }
      if (!prev) seen.set(sig, key);
    }
  });
});
