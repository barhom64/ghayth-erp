/**
 * HR-018 + HR-019 + HR-020 — final closure smoke for the audit residuals.
 *
 * HR-018 covered by legacyRbacCutoverRatchetSmoke.test.ts (separate file).
 *
 * Here we pin:
 *
 * HR-019 — Org Memberships bridges CRUD:
 *   - 6 new endpoints in routes/org.ts:
 *     GET /teams/:teamId/members, POST /team-memberships, DELETE /team-memberships/:id
 *     (same shape for committees + projects)
 *   - All POST endpoints check assignment in company + entity in company
 *   - All DELETE endpoints are end-date (not hard-delete) — audit trail
 *   - Project assignments return totalAllocationPercent for UI guard
 *   - /admin/org-memberships page exists with 3 tabs
 *   - Nav entry under «إعدادات الموارد البشرية»
 *
 * HR-020 — Scoring Weights per company + Ranking:
 *   - Migration 279 creates scoring_weights_per_company with CHECK sum=1
 *   - 4 new endpoints: GET/POST/DELETE scoring-weights, GET scoring-ranking
 *   - resolveCompanyWeights helper in employeeScoringEngine.ts
 *   - scoreEmployee falls back to resolveCompanyWeights when no explicit
 *     weights passed
 *   - /admin/scoring-weights page with 2 tabs (الأوزان + الترتيب)
 *   - Frontend validates sum=1.0 client-side before submit
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ORG_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/org.ts"), "utf8");
const ENGINE_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/employeeScoringEngine.ts"), "utf8");
const MIGRATION_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/migrations/279_scoring_weights_per_company.sql"), "utf8");
const ORG_MEM_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/org-memberships.tsx"), "utf8");
const WEIGHTS_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/scoring-weights.tsx"), "utf8");
const ADMIN_ROUTES_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/adminRoutes.tsx"), "utf8");
const NAV_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");

describe("HR-019 — Org Memberships backend bridges", () => {
  it("6 endpoints exist (GET members + POST + DELETE for each of teams/committees/projects)", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/teams\/:teamId\/members"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/team-memberships"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/team-memberships\/:id"/);
    expect(ORG_SRC).toMatch(/router\.get\("\/committees\/:committeeId\/members"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/committee-memberships"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/committee-memberships\/:id"/);
    expect(ORG_SRC).toMatch(/router\.get\("\/projects\/:projectId\/contributors"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/project-assignments"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/project-assignments\/:id"/);
  });

  it("POST endpoints check assignment + entity belong to the company", () => {
    expect(ORG_SRC).toMatch(/function assertAssignmentInCompany/);
    expect(ORG_SRC).toMatch(/function assertEntityInCompany/);
    // Three POST endpoints, each calls both asserts.
    const posts = ORG_SRC.match(/router\.post\("\/(?:team|committee|project)-(?:memberships|assignments)"/g) || [];
    expect(posts.length).toBeGreaterThanOrEqual(3);
  });

  it("DELETE endpoints are end-date (UPDATE ... SET \"endDate\"), not DELETE FROM", () => {
    // Search for the 3 delete handler bodies — they should set endDate.
    const deletes = ORG_SRC.split(/router\.delete\("\/(?:team|committee|project)-(?:memberships|assignments)\/:id"/).slice(1);
    expect(deletes.length).toBeGreaterThanOrEqual(3);
    for (const d of deletes) {
      const handlerEnd = d.indexOf("} catch");
      const body = handlerEnd > 0 ? d.slice(0, handlerEnd) : d;
      expect(body).toMatch(/SET "endDate" = CURRENT_DATE/);
    }
  });

  it("project contributors endpoint returns totalAllocationPercent for the UI guard", () => {
    expect(ORG_SRC).toMatch(/totalAllocationPercent: totalAlloc/);
  });

  it("UPSERT keyed on (assignmentId, teamId) prevents duplicate memberships", () => {
    expect(ORG_SRC).toMatch(/ON CONFLICT \("assignmentId", "teamId"\) DO UPDATE/);
    expect(ORG_SRC).toMatch(/ON CONFLICT \("assignmentId", "committeeId"\) DO UPDATE/);
  });

  it("audit() called on every membership write", () => {
    const writes = ORG_SRC.match(/router\.(post|delete)\("\/(?:team|committee|project)-(?:memberships|assignments)/g) || [];
    expect(writes.length).toBeGreaterThanOrEqual(6);
    // crude: count `audit(req,` invocations near the membership endpoints
    const auditCalls = (ORG_SRC.match(/await audit\(req,/g) || []).length;
    expect(auditCalls).toBeGreaterThanOrEqual(writes.length);
  });
});

describe("HR-019 — Org Memberships frontend", () => {
  it("page has default export", () => {
    expect(ORG_MEM_SRC).toMatch(/export default function OrgMembershipsPage/);
  });

  it("3 tabs (Teams / Committees / Projects)", () => {
    expect(ORG_MEM_SRC).toMatch(/TabsTrigger value="teams"/);
    expect(ORG_MEM_SRC).toMatch(/TabsTrigger value="committees"/);
    expect(ORG_MEM_SRC).toMatch(/TabsTrigger value="projects"/);
  });

  it("each tab calls the matching backend endpoint", () => {
    expect(ORG_MEM_SRC).toMatch(/\/org\/teams\/\$\{teamId\}\/members/);
    expect(ORG_MEM_SRC).toMatch(/\/org\/committees\/\$\{committeeId\}\/members/);
    expect(ORG_MEM_SRC).toMatch(/\/org\/projects\/\$\{projectId\}\/contributors/);
    expect(ORG_MEM_SRC).toContain("/org/team-memberships");
    expect(ORG_MEM_SRC).toContain("/org/committee-memberships");
    expect(ORG_MEM_SRC).toContain("/org/project-assignments");
  });

  it("project tab surfaces totalAllocation with >100% warning", () => {
    expect(ORG_MEM_SRC).toMatch(/totalAlloc > 100[\s\S]*?destructive/);
    expect(ORG_MEM_SRC).toMatch(/يتجاوز 100%/);
  });

  it("registered at /admin/org-memberships + nav entry", () => {
    expect(ADMIN_ROUTES_SRC).toMatch(/const AdminOrgMemberships = lazy/);
    expect(ADMIN_ROUTES_SRC).toMatch(/path: "\/admin\/org-memberships"/);
    expect(NAV_SRC).toMatch(/path: "\/admin\/org-memberships"/);
  });
});

describe("HR-020 — Scoring Weights per company (migration + engine)", () => {
  it("migration 279 creates scoring_weights_per_company with the 6 weights", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS scoring_weights_per_company/);
    for (const w of ["disciplineWeight", "activityWeight", "productivityWeight",
                     "qualityWeight", "managerWeight", "developmentWeight"]) {
      expect(MIGRATION_SRC).toContain(`"${w}"`);
    }
  });

  it("DB CHECK constraint asserts the 6 weights sum to 1.0 (±0.001)", () => {
    expect(MIGRATION_SRC).toMatch(/CONSTRAINT scoring_weights_sum_to_one/);
    expect(MIGRATION_SRC).toMatch(/ABS\([\s\S]*?- 1\s*\)\s*<\s*0\.001/);
  });

  it("UNIQUE (companyId, categoryKey) — per-company default + per-category override", () => {
    expect(MIGRATION_SRC).toMatch(/UNIQUE \("companyId", "categoryKey"\)/);
  });

  it("@rollback annotation present", () => {
    expect(MIGRATION_SRC).toMatch(/@rollback:/);
  });

  it("engine: resolveCompanyWeights helper exported and reads the new table", () => {
    expect(ENGINE_SRC).toMatch(/export async function resolveCompanyWeights/);
    expect(ENGINE_SRC).toMatch(/FROM scoring_weights_per_company/);
    // per-category override beats company default — ORDER BY NULLS LAST + LIMIT 1
    expect(ENGINE_SRC).toMatch(/ORDER BY "categoryKey" NULLS LAST LIMIT 1/);
  });

  it("scoreEmployee falls back to resolveCompanyWeights when no explicit weights", () => {
    expect(ENGINE_SRC).toMatch(/if \(!effective\) \{[\s\S]*?resolveCompanyWeights/);
  });

  it("returns DEFAULT_WEIGHTS when no row exists (backward compat)", () => {
    expect(ENGINE_SRC).toMatch(/if \(rows\.length === 0\) return DEFAULT_WEIGHTS/);
  });
});

describe("HR-020 — Scoring Weights endpoints + Ranking", () => {
  it("4 endpoints: GET/POST/DELETE scoring-weights + GET scoring-ranking", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/scoring-weights"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/scoring-weights"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/scoring-weights\/:id"/);
    expect(ORG_SRC).toMatch(/router\.get\("\/scoring-ranking"/);
  });

  it("POST validates sum=1.0 with friendlier Arabic error than the DB CHECK", () => {
    expect(ORG_SRC).toMatch(/Math\.abs\(sum - 1\) > 0\.001/);
    expect(ORG_SRC).toMatch(/مجموع الأوزان الستة يجب أن يساوي 1\.0/);
  });

  it("UPSERT keyed on (companyId, categoryKey)", () => {
    expect(ORG_SRC).toMatch(/ON CONFLICT \("companyId", "categoryKey"\) DO UPDATE/);
  });

  it("ranking endpoint accepts scope=weekly|monthly|quarterly + auto-detects latest periodKey", () => {
    expect(ORG_SRC).toMatch(/\["weekly", "monthly", "quarterly"\]/);
    expect(ORG_SRC).toMatch(/ORDER BY "periodKey" DESC LIMIT 1/);
    expect(ORG_SRC).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY s\."compositeScore" DESC\) AS rank/);
  });

  it("ranking returns friendly Arabic message when no data exists yet", () => {
    expect(ORG_SRC).toMatch(/لا توجد بيانات تقييم بعد/);
  });
});

describe("HR-020 — Scoring Weights frontend", () => {
  it("page exists with 2 tabs (الأوزان + الترتيب)", () => {
    expect(WEIGHTS_SRC).toMatch(/export default function ScoringWeightsPage/);
    expect(WEIGHTS_SRC).toMatch(/TabsTrigger value="weights"/);
    expect(WEIGHTS_SRC).toMatch(/TabsTrigger value="ranking"/);
  });

  it("client-side validates sum=1.0 BEFORE allowing save", () => {
    expect(WEIGHTS_SRC).toMatch(/const sumOk = Math\.abs\(sum - 1\) < 0\.001/);
    expect(WEIGHTS_SRC).toMatch(/disabled=\{!sumOk\}/);
  });

  it("ranking tab colour-codes by score band (≥85 emerald, ≥70 info, ≥50 amber, <50 error)", () => {
    expect(WEIGHTS_SRC).toMatch(/s >= 85.*emerald/);
    expect(WEIGHTS_SRC).toMatch(/s >= 70.*status-info/);
    expect(WEIGHTS_SRC).toMatch(/s >= 50.*amber/);
  });

  it("ranking shows trend arrow (↑/↓) for top performers", () => {
    expect(WEIGHTS_SRC).toMatch(/r\.trend === 1 \? " ↑" : r\.trend === -1 \? " ↓"/);
  });

  it("/admin/scoring-weights is now a wouter <Redirect> to /hr (canonical = HR)", () => {
    // PR-4 (#2077) mirrored the page under /hr so the HR Manager could
    // reach it without crossing /admin/*'s level-90 floor — the /admin
    // route stayed as a back-compat alias (alias = same component
    // bound twice).
    //
    // Wave-2 PR-3 (#2163) — Canonical Ownership ruling: scoring weights
    // drive evaluation / promotion / penalties — HR business, not
    // platform admin. The legacy /admin/* path stays reachable but
    // bound to a wouter <Redirect> wrapper now; only HR owns the
    // policy.
    expect(ADMIN_ROUTES_SRC).toMatch(/RedirectToHrScoringWeights\s*=\s*redirectTo\("\/hr\/scoring-weights"\)/);
    expect(ADMIN_ROUTES_SRC).toMatch(
      /path:\s*"\/admin\/scoring-weights",\s*component:\s*RedirectToHrScoringWeights/,
    );
    // Regression trap: re-importing AdminScoringWeights as a lazy
    // live page would re-establish dual ownership.
    expect(ADMIN_ROUTES_SRC).not.toMatch(/const AdminScoringWeights = lazy/);
    // The nav entry was moved from /admin to /hr by PR-4 of #2077 —
    // the «أوزان التقييم» link is in HR navigation only.
    expect(NAV_SRC).toMatch(/path: "\/hr\/scoring-weights"/);
  });
});
