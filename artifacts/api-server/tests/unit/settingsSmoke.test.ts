import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SETTINGS_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/settings.ts"), "utf8");

// ─── Settings Route Smoke Tests ─────────────────────────────────────────────
// Static code analysis covering endpoints, permissions, companyId scoping,
// parameterized SQL, and Zod validation.

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT EXISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Settings endpoint registration", () => {
  it("public GET /display endpoint exists on publicRouter", () => {
    expect(SETTINGS_ROUTE).toContain('publicRouter.get("/display"');
  });

  it("core settings CRUD endpoints exist (GET /resolve, GET /, PUT /, DELETE /)", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/resolve"');
    expect(SETTINGS_ROUTE).toContain('router.get("/",');
    expect(SETTINGS_ROUTE).toContain('router.put("/",');
    expect(SETTINGS_ROUTE).toContain('router.delete("/",');
  });

  it("general settings endpoints exist (GET and PUT /general)", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/general"');
    expect(SETTINGS_ROUTE).toContain('router.put("/general"');
  });

  it("GET /resolved endpoint exists", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/resolved"');
  });

  it("branches CRUD endpoints exist", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/branches"');
    expect(SETTINGS_ROUTE).toContain('router.get("/branches/:id"');
    expect(SETTINGS_ROUTE).toContain('router.post("/branches"');
    expect(SETTINGS_ROUTE).toContain('router.put("/branches/:id"');
    expect(SETTINGS_ROUTE).toContain('router.delete("/branches/:id"');
  });

  it("departments CRUD endpoints exist", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/departments"');
    expect(SETTINGS_ROUTE).toContain('router.post("/departments"');
    expect(SETTINGS_ROUTE).toContain('router.put("/departments/:id"');
    expect(SETTINGS_ROUTE).toContain('router.delete("/departments/:id"');
  });

  it("companies CRUD endpoints exist", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/companies"');
    expect(SETTINGS_ROUTE).toContain('router.post("/companies"');
    expect(SETTINGS_ROUTE).toContain('router.put("/companies/:id"');
    expect(SETTINGS_ROUTE).toContain('router.delete("/companies/:id"');
  });

  it("system-controls, timezone, role-modules, approval-config, audit-log, channels endpoints exist", () => {
    expect(SETTINGS_ROUTE).toContain('router.get("/timezone"');
    expect(SETTINGS_ROUTE).toContain('router.get("/system-controls"');
    expect(SETTINGS_ROUTE).toContain('router.put("/system-controls"');
    expect(SETTINGS_ROUTE).toContain('router.get("/role-modules"');
    expect(SETTINGS_ROUTE).toContain('router.put("/role-modules/:roleKey"');
    expect(SETTINGS_ROUTE).toContain('router.get("/approval-config"');
    expect(SETTINGS_ROUTE).toContain('router.post("/approval-config"');
    expect(SETTINGS_ROUTE).toContain('router.delete("/approval-config/:id"');
    expect(SETTINGS_ROUTE).toContain('router.get("/channels"');
    expect(SETTINGS_ROUTE).toContain('router.put("/channels"');
    expect(SETTINGS_ROUTE).toContain('router.get("/audit-log"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Settings permissions", () => {
  it("relies on global authMiddleware from index.ts", () => {
    expect(SETTINGS_ROUTE).not.toContain("router.use(authMiddleware)");
  });

  it("display endpoint is on publicRouter (no per-file authMiddleware needed)", () => {
    expect(SETTINGS_ROUTE).toContain('publicRouter.get("/display"');
  });

  it("read endpoints require settings:read", () => {
    for (const marker of ['router.get("/resolve"', 'router.get("/",', 'router.get("/general"', 'router.get("/branches"']) {
      const idx = SETTINGS_ROUTE.indexOf(marker);
      const line = SETTINGS_ROUTE.slice(idx, SETTINGS_ROUTE.indexOf("\n", idx));
      expect(line).toContain('authorize(');
    }
  });

  it("write endpoints require settings:write", () => {
    for (const marker of ['router.put("/",', 'router.delete("/",', 'router.post("/branches"', 'router.put("/branches/:id"', 'router.delete("/branches/:id"']) {
      const idx = SETTINGS_ROUTE.indexOf(marker);
      const line = SETTINGS_ROUTE.slice(idx, SETTINGS_ROUTE.indexOf("\n", idx));
      expect(line).toContain('authorize(');
    }
  });

  it("system scope settings enforce isOwner check on GET, PUT, and DELETE", () => {
    for (const marker of ['router.get("/",', 'router.put("/",', 'router.delete("/",']) {
      const idx = SETTINGS_ROUTE.indexOf(marker);
      const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
      expect(section).toContain("scope.isOwner");
      expect(section).toContain("ForbiddenError");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY-ID SCOPING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Settings companyId scoping", () => {
  it("GET /branches and /departments scope by allowedCompanies", () => {
    const brIdx = SETTINGS_ROUTE.indexOf('router.get("/branches"');
    const brSection = SETTINGS_ROUTE.slice(brIdx, brIdx + 3000);
    expect(brSection).toContain('"companyId" = ANY($1)');
    expect(brSection).toContain("scope.allowedCompanies");

    const deptIdx = SETTINGS_ROUTE.indexOf('router.get("/departments"');
    const deptSection = SETTINGS_ROUTE.slice(deptIdx, deptIdx + 3000);
    expect(deptSection).toContain('"companyId" = ANY($1)');
  });

  it("GET /branches/:id scopes by allowedCompanies via ANY($2)", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.get("/branches/:id"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId" = ANY($2)');
    expect(section).toContain("scope.allowedCompanies");
  });

  it("GET /companies and /audit-log scope by allowedCompanies", () => {
    const compIdx = SETTINGS_ROUTE.indexOf('router.get("/companies"');
    expect(SETTINGS_ROUTE.slice(compIdx, compIdx + 3000)).toContain("id = ANY($1)");

    const auditIdx = SETTINGS_ROUTE.indexOf('router.get("/audit-log"');
    expect(SETTINGS_ROUTE.slice(auditIdx, auditIdx + 3000)).toContain('"companyId" = ANY($1)');
  });

  it("DELETE /branches/:id and /departments/:id scope by companyId", () => {
    const brIdx = SETTINGS_ROUTE.indexOf('router.delete("/branches/:id"');
    expect(SETTINGS_ROUTE.slice(brIdx, brIdx + 4000)).toContain('"companyId"=$2');

    const deptIdx = SETTINGS_ROUTE.indexOf('router.delete("/departments/:id"');
    expect(SETTINGS_ROUTE.slice(deptIdx, deptIdx + 3000)).toContain('"companyId"=$2');
  });

  it("POST /departments inserts with scope.companyId", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.post("/departments"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("scope.companyId");
    expect(section).toContain('"companyId"');
  });

  it("GET /approval-config and POST /approval-config scope by companyId", () => {
    const getIdx = SETTINGS_ROUTE.indexOf('router.get("/approval-config"');
    expect(SETTINGS_ROUTE.slice(getIdx, getIdx + 3000)).toContain('"companyId"=$1');

    const postIdx = SETTINGS_ROUTE.indexOf('router.post("/approval-config"');
    const section = SETTINGS_ROUTE.slice(postIdx, postIdx + 3000);
    expect(section).toContain("scope.companyId");
    expect(section).toContain('"companyId"');
  });

  it("GET /role-modules scopes by companyId (P02-CRIT1 fix)", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.get("/role-modules"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
  });

  it("PUT /role-modules/:roleKey scopes UPDATE by companyId (P02-CRIT1 fix)", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/role-modules/:roleKey"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId"=$3');
    expect(section).toContain("scope.companyId");
  });

  it("GET and PUT /channels scope by companyId", () => {
    const getIdx = SETTINGS_ROUTE.indexOf('router.get("/channels"');
    expect(SETTINGS_ROUTE.slice(getIdx, getIdx + 3000)).toContain('"companyId" = $2');

    const putIdx = SETTINGS_ROUTE.indexOf('router.put("/channels"');
    expect(SETTINGS_ROUTE.slice(putIdx, putIdx + 5000)).toContain('"companyId"=$2');
  });

  it("GET /resolved scopes company rows by companyId", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.get("/resolved"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED SQL
// ═══════════════════════════════════════════════════════════════════════════════

describe("Settings parameterized SQL", () => {
  it("PUT /general uses parameterized SELECT, UPDATE, and INSERT for each key", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/general"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("WHERE key=$1");
    expect(section).toContain("SET value=$1");
    expect(section).toContain("VALUES ($1,$2)");
  });

  it("PUT /branches/:id builds dynamic SET clauses with positional params", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/branches/:id"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("$${params.length}");
    expect(section).toContain("params.push(name)");
    expect(section).toContain("sets.push(");
  });

  it("POST /branches uses positional params $1 through $12", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.post("/branches"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12");
  });

  it("PUT /system-controls uses parameterized queries for each entry", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/system-controls"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("key=$2");
    expect(section).toContain("SET value=$1");
    expect(section).toContain("VALUES ('company', $1, $2, $3)");
  });

  it("DELETE /approval-config/:id uses parameterized soft delete with companyId", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.delete("/approval-config/:id"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"deletedAt" = NOW()');
    expect(section).toContain("id=$1");
    expect(section).toContain('"companyId"=$2');
  });

  it("PUT /channels uses parameterized INSERT, UPDATE, and DELETE statements", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/channels"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("DELETE FROM system_settings WHERE key=$1");
    expect(section).toContain("UPDATE system_settings SET value=$1");
    expect(section).toContain("INSERT INTO system_settings (key, value,");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION (ZOD SCHEMAS)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Settings Zod validation", () => {
  it("settingUpsertSchema requires key and has scopeOverride enum", () => {
    const idx = SETTINGS_ROUTE.indexOf("const settingUpsertSchema");
    const section = SETTINGS_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("key: z.string().min(1)");
    expect(section).toContain('z.enum(["system", "company", "branch"])');
  });

  it("createBranchSchema and createDepartmentSchema require name", () => {
    const brIdx = SETTINGS_ROUTE.indexOf("const createBranchSchema");
    expect(SETTINGS_ROUTE.slice(brIdx, brIdx + 500)).toContain("name: z.string().min(1)");

    const deptIdx = SETTINGS_ROUTE.indexOf("const createDepartmentSchema");
    expect(SETTINGS_ROUTE.slice(deptIdx, deptIdx + 500)).toContain("name: z.string().min(1)");
  });

  it("createCompanySchema requires name; approvalConfigSchema requires chainType; roleModulesSchema requires modules array", () => {
    const compIdx = SETTINGS_ROUTE.indexOf("const createCompanySchema");
    expect(SETTINGS_ROUTE.slice(compIdx, compIdx + 500)).toContain("name: z.string().min(1)");

    const appIdx = SETTINGS_ROUTE.indexOf("const approvalConfigSchema");
    expect(SETTINGS_ROUTE.slice(appIdx, appIdx + 500)).toContain("chainType: z.string().min(1)");

    const roleIdx = SETTINGS_ROUTE.indexOf("const roleModulesSchema");
    expect(SETTINGS_ROUTE.slice(roleIdx, roleIdx + 500)).toContain("modules: z.array(z.string())");
  });

  it("PUT / and POST /branches validate with safeParse and throw ValidationError", () => {
    const putIdx = SETTINGS_ROUTE.indexOf('router.put("/",');
    const putSection = SETTINGS_ROUTE.slice(putIdx, putIdx + 3000);
    expect(putSection).toContain("settingUpsertSchema.safeParse");
    expect(putSection).toContain("zodParse");

    const branchIdx = SETTINGS_ROUTE.indexOf('router.post("/branches"');
    const branchSection = SETTINGS_ROUTE.slice(branchIdx, branchIdx + 3000);
    expect(branchSection).toContain("createBranchSchema.safeParse");
    expect(branchSection).toContain("zodParse");
  });

  it("GET /resolve throws ValidationError when key is missing", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.get("/resolve"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("ValidationError");
    expect(section).toContain("key");
  });

  it("DELETE /branches/:id checks for active employees and open purchase orders", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.delete("/branches/:id"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("employee_assignments");
    expect(section).toContain("status = 'active'");
    expect(section).toContain("purchase_orders");
    expect(section).toContain("blockers");
  });

  it("DELETE /departments/:id checks for active employees before deletion", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.delete("/departments/:id"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("employee_assignments");
    expect(section).toContain("status = 'active'");
  });

  it("PUT /channels skips secret keys when value is __configured__", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/channels"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain('"__configured__"');
    expect(section).toContain("SECRET_KEYS_PUT");
  });

  it("GET /channels masks secret keys (sms_auth_token, whatsapp_access_token)", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.get("/channels"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"__configured__"');
    expect(section).toContain("sms_auth_token");
    expect(section).toContain("whatsapp_access_token");
  });

  it("POST /companies uses bootstrapCompany and cleans up on failure", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.post("/companies"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("bootstrapCompany");
    expect(section).toContain("DELETE FROM companies WHERE id = $1");
  });

  it("PUT /general reloads cron scheduler when timezone changes", () => {
    const idx = SETTINGS_ROUTE.indexOf('router.put("/general"');
    const section = SETTINGS_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("hasTimezoneChange");
    expect(section).toContain("reloadCronScheduler");
  });
});
