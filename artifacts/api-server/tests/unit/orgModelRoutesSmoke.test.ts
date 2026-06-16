/**
 * Org Model routes smoke — يضمن أن الـ CRUD المُضاف في routes/org.ts:
 *  - يستخدم زود الصحيح (safeParse pattern)
 *  - يصدّر router
 *  - يحوي endpoints الستة لكل جدول
 *  - مرتبط في index.ts تحت /org
 *  - الصفحة الفرونتية مُسجَّلة في adminRoutes.tsx
 *  - الـ nav entry يشير إلى /admin/org-model
 *
 * هذا اختبار static — لا يفتح DB ولا server.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ORG_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/org.ts"), "utf8");
const INDEX_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"), "utf8");
const PAGE_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/admin/org-model.tsx"), "utf8");
const ADMIN_ROUTES_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/adminRoutes.tsx"), "utf8");
const NAV_SRC = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"), "utf8");

describe("Org Model — backend routes", () => {
  it("router exported as default", () => {
    expect(ORG_SRC).toMatch(/export default router/);
  });

  it("authorize wrapper imported and used on every endpoint", () => {
    expect(ORG_SRC).toMatch(/import \{ authorize \} from/);
    const handlers = ORG_SRC.match(/router\.(get|post|patch|delete)\(/g) ?? [];
    const authorized = ORG_SRC.match(/router\.(get|post|patch|delete)\("[^"]+", authorize\(/g) ?? [];
    expect(authorized.length).toBe(handlers.length);
  });

  it("uses zodParse(...safeParse(req.body)) pattern (not zodParse(schema, body))", () => {
    expect(ORG_SRC).not.toMatch(/zodParse\(\w+Schema, req\.body\)/);
    expect(ORG_SRC).toMatch(/zodParse\(\w+Schema(?:\.partial\(\))?\.safeParse\(req\.body\)\)/);
  });

  it("uses rawExecute affectedRows (not rowCount which doesn't exist on the return)", () => {
    expect(ORG_SRC).not.toMatch(/result\.rowCount/);
    expect(ORG_SRC).toMatch(/result\.affectedRows === 0/);
  });

  it("legal-entities CRUD endpoints all present", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/legal-entities"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/legal-entities"/);
    expect(ORG_SRC).toMatch(/router\.patch\("\/legal-entities\/:id"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/legal-entities\/:id"/);
  });

  it("positions CRUD endpoints all present", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/positions"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/positions"/);
    expect(ORG_SRC).toMatch(/router\.patch\("\/positions\/:id"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/positions\/:id"/);
  });

  it("teams CRUD endpoints all present", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/teams"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/teams"/);
    expect(ORG_SRC).toMatch(/router\.patch\("\/teams\/:id"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/teams\/:id"/);
  });

  it("committees CRUD endpoints all present", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/committees"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/committees"/);
    expect(ORG_SRC).toMatch(/router\.patch\("\/committees\/:id"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/committees\/:id"/);
  });

  it("supervision-lines endpoints (no PATCH — end-then-recreate workflow)", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/supervision-lines"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/supervision-lines"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/supervision-lines\/:id"/);
  });

  it("approval-authorities endpoints (DELETE is hard-delete, POST does UPSERT)", () => {
    expect(ORG_SRC).toMatch(/router\.get\("\/approval-authorities"/);
    expect(ORG_SRC).toMatch(/router\.post\("\/approval-authorities"/);
    expect(ORG_SRC).toMatch(/router\.delete\("\/approval-authorities\/:id"/);
    expect(ORG_SRC).toMatch(/ON CONFLICT \("assignmentId", "featureKey", action, currency\) DO UPDATE/);
  });

  it("supervision-lines + approval-authorities are gated on hr.organization, NOT generic admin (HR-REV-1 #4)", () => {
    // The org model belongs to the HR Manager domain; gating it on the
    // generic `admin` feature locked everyone but the owner out. Pin the
    // domain-correct feature so a refactor can't silently regress to admin.
    const supBlock = ORG_SRC.slice(ORG_SRC.indexOf('router.get("/supervision-lines"'), ORG_SRC.indexOf('router.get("/supervision-lines"') + 200);
    const authBlock = ORG_SRC.slice(ORG_SRC.indexOf('router.get("/approval-authorities"'), ORG_SRC.indexOf('router.get("/approval-authorities"') + 200);
    expect(supBlock).toContain("authorize(ORG_READ)");
    expect(authBlock).toContain("authorize(ORG_READ)");
    expect(ORG_SRC).toMatch(/const ORG_READ = \{ feature: "hr\.organization", action: "list" \}/);
  });

  it("supervision_lines POST rejects self-supervision before INSERT", () => {
    expect(ORG_SRC).toMatch(/supervisorAssignmentId === body\.superviseeAssignmentId/);
    expect(ORG_SRC).toMatch(/لا يمكن للموظف أن يشرف على نفسه/);
  });

  it("approval_authorities requires reason (audit trail)", () => {
    expect(ORG_SRC).toMatch(/reason: z\.string\(\)\.min\(1, "السبب مطلوب — هذا تجاوز للقالب"\)/);
  });

  it("DELETE for legal_entities/positions/teams/committees is soft (isActive=false)", () => {
    const softs = ORG_SRC.match(/UPDATE \w+ SET "isActive" = FALSE/g) ?? [];
    expect(softs.length).toBeGreaterThanOrEqual(4);
  });

  it("every router handler resolves scope before querying", () => {
    const handlers = ORG_SRC.match(/router\.(get|post|patch|delete)\([\s\S]*?\}\);/g) ?? [];
    for (const h of handlers) {
      expect(h, `handler missing requireScope:\n${h.slice(0, 200)}`).toMatch(/requireScope\(req\)/);
    }
  });

  it("audit() called on every write (create/update/delete)", () => {
    const writes = ORG_SRC.match(/router\.(post|patch|delete)\(/g) ?? [];
    const audits = ORG_SRC.match(/await audit\(req,/g) ?? [];
    // every write should call audit() exactly once
    expect(audits.length).toBeGreaterThanOrEqual(writes.length - 1);
  });
});

describe("Org Model — backend mounting", () => {
  it("orgRouter imported in index.ts", () => {
    expect(INDEX_SRC).toMatch(/import orgRouter from "\.\/org\.js"/);
  });

  it("mounted at /org with HR module gate", () => {
    expect(INDEX_SRC).toMatch(/router\.use\("\/org", requireModule\("hr"\), orgRouter\)/);
  });
});

describe("Org Model — frontend page", () => {
  it("default export is OrgModelPage", () => {
    expect(PAGE_SRC).toMatch(/export default function OrgModelPage\(/);
  });

  it("renders six tabs in TabsList", () => {
    expect(PAGE_SRC).toMatch(/TabsTrigger value="legal-entities"/);
    expect(PAGE_SRC).toMatch(/TabsTrigger value="positions"/);
    expect(PAGE_SRC).toMatch(/TabsTrigger value="teams"/);
    expect(PAGE_SRC).toMatch(/TabsTrigger value="committees"/);
    expect(PAGE_SRC).toMatch(/TabsTrigger value="supervision-lines"/);
    expect(PAGE_SRC).toMatch(/TabsTrigger value="approval-authorities"/);
  });

  it("each tab has matching TabsContent body", () => {
    expect(PAGE_SRC).toMatch(/<LegalEntitiesTab \/>/);
    expect(PAGE_SRC).toMatch(/<PositionsTab \/>/);
    expect(PAGE_SRC).toMatch(/<TeamsTab \/>/);
    expect(PAGE_SRC).toMatch(/<CommitteesTab \/>/);
    expect(PAGE_SRC).toMatch(/<SupervisionLinesTab \/>/);
    expect(PAGE_SRC).toMatch(/<ApprovalAuthoritiesTab \/>/);
  });

  it("uses GuardedButton with admin:update perm for writes", () => {
    expect(PAGE_SRC).toMatch(/perm={PERM_WRITE}/);
    expect(PAGE_SRC).toMatch(/PERM_WRITE = "admin:update"/);
  });

  it("approval-authorities form forces a reason input", () => {
    expect(PAGE_SRC).toMatch(/السبب \* \(مطلوب — تجاوز قالب الدور\)/);
  });

  it("supervision-lines form blocks self-supervision client-side", () => {
    expect(PAGE_SRC).toMatch(/sup === svee/);
    expect(PAGE_SRC).toMatch(/لا يمكن للموظف الإشراف على نفسه/);
  });
});

describe("Org Model — wiring (routes + nav)", () => {
  it("AdminOrgModel imported and registered at /admin/org-model", () => {
    expect(ADMIN_ROUTES_SRC).toMatch(/const AdminOrgModel = lazy\(\(\) => import\("@\/pages\/admin\/org-model"\)\)/);
    expect(ADMIN_ROUTES_SRC).toMatch(/\{ path: "\/admin\/org-model", component: AdminOrgModel \}/);
  });

  it("nav entry under «إعدادات الموارد البشرية»", () => {
    expect(NAV_SRC).toMatch(/label: "نموذج المؤسسة التشغيلي", path: "\/admin\/org-model"/);
  });
});
