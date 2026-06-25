import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Auto-creation of cost centres on branch + project insert. Operator
 * request: «مركز تكلفة تلقائي لكل فرع يتم فتحه ومراكز تكلفة فرعية
 * تلقائية لكل مهمة او معاملة».
 *
 * The CC tree this produces (per tenant):
 *   BR-0001            مركز تكلفة الفرع الرئيسي
 *   ├── BR-0001-P0001  مشروع #1 (nested via parent's code)
 *   └── BR-0001-P0002  مشروع #2
 *   BR-0002            مركز تكلفة الفرع الثاني
 *   └── BR-0002-P0003  مشروع #3
 *
 * Every journal line carrying costCenterId = the project CC rolls up
 * to the branch CC automatically via parentId. Per-branch P&L works
 * out of the box without manual operator setup.
 */

const HELPER = readFileSync(
  join(import.meta.dirname!, "../../src/lib/costCenterAutoCreate.ts"),
  "utf8",
);
const SETTINGS = readFileSync(
  join(import.meta.dirname!, "../../src/routes/settings.ts"),
  "utf8",
);
const PROJECTS = readFileSync(
  join(import.meta.dirname!, "../../src/routes/projects.ts"),
  "utf8",
);
const FCC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-cost-centers.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Helper — code shape, dual-write, idempotency, autoCreated traceability
// ─────────────────────────────────────────────────────────────────────────────
describe("createCostCenterForEntity — naming + idempotency", () => {
  it("declares the supported entity types — at minimum branch / project / contract / department", () => {
    // Pinned as a subset check so later additions (e.g. vehicle) don't
    // churn this test — the explicit "vehicle" assertion lives in the
    // dedicated extension smoke (costCenterTreeAndAllEntitiesAutoCreate).
    for (const t of ["branch", "project", "contract", "department"]) {
      expect(HELPER).toMatch(new RegExp(`\\|\\s*"${t}"`));
    }
    expect(HELPER).toMatch(/export type CostCenterEntityType =/);
  });

  it("uses short prefix codes — BR / P / CT / D — for scannable CC codes", () => {
    const block = HELPER.match(/const PREFIX_BY_TYPE[\s\S]{0,400}\};/);
    expect(block).toBeTruthy();
    expect(block![0]).toMatch(/branch:\s+"BR"/);
    expect(block![0]).toMatch(/project:\s+"P"/);
    expect(block![0]).toMatch(/contract:\s+"CT"/);
    expect(block![0]).toMatch(/department: "D"/);
  });

  it("code = parentCode-prefix+padded id when nested, else prefix-padded id", () => {
    expect(HELPER).toMatch(/const code = parentCode\s*\?\s*`\$\{parentCode\}-\$\{prefix\}\$\{paddedId\}`\s*:\s*`\$\{prefix\}-\$\{paddedId\}`/);
  });

  it("ids are zero-padded to 4 digits for stable sort + scannability", () => {
    expect(HELPER).toMatch(/String\(entityId\)\.padStart\(4, "0"\)/);
  });

  it("DUAL-WRITES legacy + newer entity columns (relatedEntity* AND linkedEntity*)", () => {
    // The cost_centers table has two parallel column pairs because
    // different resolvers (finance-reports.ts vs accountingAllocation.ts)
    // historically read from different pairs. Writing both keeps both
    // consumers in sync — same rationale as the manual POST path.
    expect(HELPER).toMatch(/"relatedEntityType", "relatedEntityId",\s*"linkedEntityType",\s+"linkedEntityId"/);
    expect(HELPER).toMatch(/VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$6, \$7,/);
  });

  it("fills autoCreatedBy + autoCreatedReason — migration 203's traceability columns", () => {
    expect(HELPER).toMatch(/"autoCreatedBy", "autoCreatedReason"/);
    const reasons = HELPER.match(/const REASON_BY_TYPE[\s\S]{0,700}\};/);
    expect(reasons).toBeTruthy();
    expect(reasons![0]).toContain("auto-created on branch insert");
    expect(reasons![0]).toContain("auto-created on project insert");
  });

  it("look-up by (entityType, entityId) FIRST — reuses existing CC even if code differs", () => {
    // If an operator manually created a CC for branch #7 with a non-
    // standard code, the auto-create should reuse THAT row, not insert
    // a duplicate at BR-0007.
    expect(HELPER).toMatch(/SELECT id, code, name, "parentId" FROM cost_centers\s+WHERE "companyId" = \$1\s+AND "relatedEntityType" = \$2\s+AND "relatedEntityId" = \$3/);
  });

  it("ON CONFLICT (companyId, code) DO NOTHING — concurrent inserts collapse to one row", () => {
    expect(HELPER).toMatch(/ON CONFLICT \("companyId", code\) DO NOTHING/);
  });

  it("when ON CONFLICT skips, it reads the conflicting row and BACK-LINKS it to this entity", () => {
    // A manually-created CC with the same code but no entity link
    // shouldn't leave the new entity orphaned — we patch in the
    // relatedEntity* + linkedEntity* values via UPDATE.
    expect(HELPER).toMatch(/UPDATE cost_centers\s+SET "relatedEntityType" = \$1, "relatedEntityId" = \$2,\s*"linkedEntityType"\s+= \$1, "linkedEntityId"\s+= \$2/);
  });

  it("project's parent is resolved by relatedEntityType='branch' + relatedEntityId=branchId", () => {
    expect(HELPER).toMatch(/options\.parentEntityType && options\.parentEntityId/);
    expect(HELPER).toMatch(/AND "relatedEntityType" = \$2\s+AND "relatedEntityId" = \$3/);
  });

  it("swallows errors — branch/project create must succeed even if CC insert fails", () => {
    expect(HELPER).toMatch(/} catch \(err\) \{\s*logger\.error\(err, `\[costCenterAutoCreate\] failed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Wire-in — branch POST + project POST
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /settings/branches — auto-creates a top-level cost centre", () => {
  it("imports the helper in settings.ts", () => {
    expect(SETTINGS).toMatch(/import \{ createCostCenterForEntity \} from "\.\.\/lib\/costCenterAutoCreate\.js"/);
  });

  it("fires the helper after the branch INSERT with branch name + actorUserId", () => {
    expect(SETTINGS).toMatch(/createCostCenterForEntity\(\s*targetCompanyId,\s*"branch",\s*r\.insertId,\s*name,\s*\{ actorUserId: scope\.userId \}/);
  });

  it("fire-and-forget — non-blocking", () => {
    expect(SETTINGS).toMatch(/createCostCenterForEntity\([\s\S]{1,300}\.catch\(\(e\) => logger\.error\(e, "branch cost-centre auto-create failed"\)\)/);
  });
});

describe("POST /projects — auto-creates a project CC nested under the branch", () => {
  it("imports the helper in projects.ts", () => {
    // Batch 6 — projects now uses the GUARANTEED (awaited) variant.
    // Also imports syncEntityCostCenterAllocation (budget → allocatedAmount sync).
    expect(PROJECTS).toMatch(/import \{ ensureCostCenterForEntity, syncEntityCostCenterAllocation \} from "\.\.\/lib\/costCenterAutoCreate\.js"/);
  });

  it("passes parentEntityType='branch' + parentEntityId=scope.branchId for proper nesting", () => {
    expect(PROJECTS).toMatch(/ensureCostCenterForEntity\(\s*scope\.companyId,\s*"project",\s*insertId,\s*b\.name\.trim\(\),\s*\{\s*parentEntityType: scope\.branchId \? "branch" : null,\s*parentEntityId: scope\.branchId \?\? null,/);
  });

  it("orphan projects (no branchId in scope) still get a CC at root level", () => {
    expect(PROJECTS).toMatch(/scope\.branchId \? "branch" : null/);
    expect(PROJECTS).toMatch(/scope\.branchId \?\? null/);
  });

  it("batch 6 — project CC link is GUARANTEED (awaited), not fire-and-forget", () => {
    // The CC dimension must land before the 201 so the project never reaches
    // its first posting with a null cost-centre. ensureCostCenterForEntity
    // stays idempotent + never throws, so the create still succeeds.
    expect(PROJECTS).toMatch(/await ensureCostCenterForEntity\(\s*scope\.companyId, "project", insertId, b\.name\.trim\(\),/);
    expect(PROJECTS).not.toMatch(/project cost-centre auto-create failed/);
  });

  it("budget edits re-sync the CC allocation (PATCH /:id)", () => {
    expect(PROJECTS).toMatch(/syncEntityCostCenterAllocation\(scope\.companyId, "project", id, Number\(after\.budget\) \|\| 0\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Backfill — covers «على القديم» for cost-centre auto-creation
// ─────────────────────────────────────────────────────────────────────────────
const BACKFILL = (() => {
  const m = FCC.match(/router\.post\("\/cost-centers\/backfill"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport \{)/);
  if (!m) throw new Error("/cost-centers/backfill handler not found");
  return m[0];
})();

describe("POST /finance/cost-centers/backfill — retroactive auto-create", () => {
  it("registers under feature: finance.cost_centers, action: create (write permission)", () => {
    expect(BACKFILL).toMatch(/authorize\(\{\s*feature:\s*"finance\.cost_centers",\s*action:\s*"create"\s*\}\)/);
  });

  it("supports narrowing to one entity (used by detail-page button)", () => {
    // The enum widens over time as we extend auto-create to more
    // entity types. Pin the SHAPE (entityType + entityId optionals)
    // not the exact enum list.
    expect(FCC).toMatch(/backfillCostCentersSchema = z\.object\(\{\s*entityType: z\.enum\(\[[^\]]*"branch"[^\]]*"project"[^\]]*\]\)\.optional\(\),\s*entityId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\),\s*\}\);/);
  });

  it("processes branches BEFORE projects so nesting works on first pass", () => {
    const brIdx = BACKFILL.indexOf("FROM branches");
    const prIdx = BACKFILL.indexOf("FROM projects");
    expect(brIdx).toBeGreaterThan(0);
    expect(prIdx).toBeGreaterThan(brIdx);
  });

  it("project's branchId is inferred from its earliest journal entry (no projects.branchId column)", () => {
    // projects table has no branchId column — the auto-create needs a
    // hint somewhere. The earliest JE's branchId is a stable signal
    // ("which branch posted to this project first").
    expect(BACKFILL).toMatch(/SELECT je\."branchId" FROM journal_entries je\s+WHERE je\."companyId" = p\."companyId"\s+AND je\."sourceType" = 'projects'/);
  });

  it("returns a summary with at minimum branches + projects + created + reused counts", () => {
    // Like the schema, the summary widens over time. Pin each field
    // individually so later additions (contracts, vehicles) don't
    // churn this test.
    for (const f of ["branches:", "projects:", "created:", "reused:"]) {
      expect(BACKFILL).toContain(f);
    }
    expect(BACKFILL).toMatch(/const summary = \{[^}]*\}/);
  });

  it("audit-logs the bulk operation (action=cost_center.backfill)", () => {
    expect(BACKFILL).toMatch(/action: "cost_center\.backfill",\s*entity: "cost_centers"/);
  });
});
