import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §3 of #1870 — pins the "silent NULL FK" recovery path.
 *
 * The engine resolvers fall back to NULL when the source row lacks
 * the lookup key (nuskAgentNumber / nuskGroupNumber / nuskCode), so
 * a pilgrim can land in umrah_pilgrims with NULL FKs and become
 * invisible on every rollup. This PR adds:
 *
 *   1. Three counter columns on umrah_import_batches (migration 279).
 *   2. ImportDiff.rowsWithoutGroup / rowsWithoutSubAgent (preview).
 *   3. ImportResult.unlinked*Count + batch row counters (confirm).
 *   4. GET /import/batches/:id/unlinked + POST .../unlinked/link API.
 *   5. Wizard pre-confirm banners + post-confirm drill-down link.
 *   6. /umrah/import/:batchId/unlinked recovery page.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/279_umrah_import_unlinked_counters.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);
// U-07 Phase 8: the import-batches listing + unlinked-rows recovery routes were
// carved verbatim out of umrah-entities.ts into a dedicated sub-router.
const ENTITIES = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-import-batches.ts"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-unlinked.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const SCHEMA_PRE = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);

describe("migration 279 — batch counter columns", () => {
  it("ALTER TABLE adds the three idempotent IF NOT EXISTS columns", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE umrah_import_batches/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "unlinkedAgentCount" integer DEFAULT 0/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "unlinkedGroupCount" integer DEFAULT 0/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "unlinkedSubAgentCount" integer DEFAULT 0/);
  });

  it("carries a rollback annotation (check:migration-policy)", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
    expect(MIGRATION).toMatch(/DROP COLUMN IF EXISTS "unlinkedAgentCount"/);
  });

  it("schema_pre.sql carries the three new columns on umrah_import_batches", () => {
    // The block we care about — must contain all three counters,
    // contiguously near the existing counter set.
    const block = SCHEMA_PRE.match(
      /CREATE TABLE public\.umrah_import_batches \([\s\S]+?\);/,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"unlinkedAgentCount" integer DEFAULT 0/);
    expect(block![0]).toMatch(/"unlinkedGroupCount" integer DEFAULT 0/);
    expect(block![0]).toMatch(/"unlinkedSubAgentCount" integer DEFAULT 0/);
  });
});

describe("engine — preview surfaces the missing-FK counts", () => {
  it("ImportDiff declares rowsWithoutGroup + rowsWithoutSubAgent", () => {
    expect(ENGINE).toMatch(/rowsWithoutGroup: number;/);
    expect(ENGINE).toMatch(/rowsWithoutSubAgent: number;/);
  });

  it("initializer seeds the new counters to zero", () => {
    expect(ENGINE).toMatch(/rowsWithoutGroup: 0,\s*[\r\n]+\s*rowsWithoutSubAgent: 0,/);
  });

  it("row loop increments when nuskGroupNumber / nuskCode are missing", () => {
    expect(ENGINE).toMatch(/if \(!row\.nuskGroupNumber\) diff\.rowsWithoutGroup\+\+;/);
    expect(ENGINE).toMatch(/if \(!row\.nuskCode\) diff\.rowsWithoutSubAgent\+\+;/);
  });
});

describe("engine — confirm tracks + persists unlinked counts", () => {
  it("ImportResult exposes the three unlinked counters", () => {
    expect(ENGINE).toMatch(/unlinkedAgentCount: number;/);
    expect(ENGINE).toMatch(/unlinkedGroupCount: number;/);
    expect(ENGINE).toMatch(/unlinkedSubAgentCount: number;/);
  });

  it("confirm row loop counts NULL agent / group / sub-agent resolutions", () => {
    expect(ENGINE).toMatch(/if \(agentId === null\) unlinkedAgentCount\+\+;/);
    expect(ENGINE).toMatch(/if \(groupId === null\) unlinkedGroupCount\+\+;/);
    expect(ENGINE).toMatch(/if \(subAgentId === null\) unlinkedSubAgentCount\+\+;/);
  });

  it("UPDATE on umrah_import_batches writes all three counters", () => {
    expect(ENGINE).toMatch(/"unlinkedAgentCount"=\$6/);
    expect(ENGINE).toMatch(/"unlinkedGroupCount"=\$7/);
    expect(ENGINE).toMatch(/"unlinkedSubAgentCount"=\$8/);
  });

  it("emits umrah.import.unlinked_rows_detected when any count > 0", () => {
    // Catalogued in §10 of #1870 — quiet by default, only fires when
    // there's something to recover.
    expect(ENGINE).toMatch(/action: "umrah\.import\.unlinked_rows_detected"/);
  });

  it("confirmVouchersImport returns the counters at 0 for type-shape parity", () => {
    expect(ENGINE).toMatch(/unlinkedAgentCount: 0, unlinkedGroupCount: 0, unlinkedSubAgentCount: 0/);
  });
});

describe("route — GET /import/batches/:id/unlinked", () => {
  it("declares the dimension query param + whitelists the three values", () => {
    expect(ENTITIES).toMatch(/router\.get\("\/import\/batches\/:id\/unlinked"/);
    expect(ENTITIES).toMatch(/dimension = String\(req\.query\.dimension \?\? "agent"\)/);
    expect(ENTITIES).toMatch(/!\["agent", "group", "subAgent"\]\.includes\(dimension\)/);
  });

  it("maps dimension → fkColumn safely (no string injection)", () => {
    expect(ENTITIES).toMatch(/const fkColumn = dimension === "agent" \? "agentId"/);
    expect(ENTITIES).toMatch(/: dimension === "group" \? "groupId"/);
    expect(ENTITIES).toMatch(/: "subAgentId"/);
  });

  it("filters via umrah_import_changes EXISTS sub-query (no batchId column on pilgrims)", () => {
    expect(ENTITIES).toMatch(/FROM umrah_import_changes ic[\s\S]{0,200}ic\."batchId" = \$2/);
    expect(ENTITIES).toMatch(/ic\."entityType" = 'mutamer'/);
    expect(ENTITIES).toMatch(/ic\."changeType" IN \('created','updated'\)/);
  });
});

describe("route — POST /import/batches/:id/unlinked/link", () => {
  it("validates exactly-one of targetId / newEntityName", () => {
    expect(ENTITIES).toMatch(/\.refine\(\(v\) => \(v\.targetId !== undefined\) !== \(v\.newEntityName !== undefined\)/);
  });

  it("verifies target ownership in the dimension's own table", () => {
    // For the existing-target branch — without this the operator
    // could pass another tenant's id.
    expect(ENTITIES).toMatch(/const table = b\.dimension === "agent" \? "umrah_agents"/);
    expect(ENTITIES).toMatch(/WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NULL/);
  });

  it("sub-agent creation requires parentAgentId", () => {
    expect(ENTITIES).toMatch(/يجب اختيار الوكيل الأم للوكيل الفرعي/);
  });

  it("UPDATE only touches rows that are STILL unlinked AND belong to this batch", () => {
    expect(ENTITIES).toMatch(/p\."\$\{fkColumn\}" IS NULL/);
    expect(ENTITIES).toMatch(/FROM umrah_import_changes ic[\s\S]{0,200}ic\."batchId" = \$5/);
  });

  it("decrements the batch counter using GREATEST(0, ...) for safety", () => {
    expect(ENTITIES).toMatch(/GREATEST\(0, COALESCE\("\$\{counterCol\}", 0\) - \$1\)/);
  });

  it("emits umrah.import.unlinked_rows_linked", () => {
    expect(ENTITIES).toMatch(/action: "umrah\.import\.unlinked_rows_linked"/);
  });

  it("wraps the multi-row mutation in withTransaction", () => {
    const handler = ENTITIES.match(
      /router\.post\("\/import\/batches\/:id\/unlinked\/link"[\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await withTransaction\(async \(client\) =>/);
  });
});

describe("wizard — pre-confirm banners cover all three dimensions", () => {
  it("PreviewSummary type carries rowsWithoutGroup + rowsWithoutSubAgent", () => {
    expect(WIZARD).toMatch(/rowsWithoutGroup\?: number;/);
    expect(WIZARD).toMatch(/rowsWithoutSubAgent\?: number;/);
  });

  it("group banner renders with a recovery-aware copy", () => {
    expect(WIZARD).toMatch(/data-testid="banner-rows-without-group"/);
    expect(WIZARD).toMatch(/قابلة للاسترداد بعد التأكيد/);
  });

  it("sub-agent banner renders with a recovery-aware copy", () => {
    expect(WIZARD).toMatch(/data-testid="banner-rows-without-subagent"/);
  });

  it("batch history shows a drill-down link when unlinked counts > 0", () => {
    // Without the link the operator has no path to the recovery page.
    expect(WIZARD).toMatch(/\/umrah\/import\/\$\{b\.id\}\/unlinked/);
    expect(WIZARD).toMatch(/بحاجة لاسترداد الربط/);
  });
});

describe("FE routing + page", () => {
  it("/umrah/import/:batchId/unlinked is registered in umrahRoutes", () => {
    expect(ROUTES).toMatch(/UmrahImportUnlinked = lazy\(\(\) => import\("@\/pages\/umrah\/import-unlinked"\)\)/);
    expect(ROUTES).toMatch(/path: "\/umrah\/import\/:batchId\/unlinked"/);
  });

  it("the page renders tabs for all three dimensions", () => {
    expect(PAGE).toMatch(/data-testid="tab-agent"/);
    expect(PAGE).toMatch(/data-testid="tab-group"/);
    expect(PAGE).toMatch(/data-testid="tab-subAgent"/);
  });

  it("the page calls the correct GET endpoint per dimension", () => {
    expect(PAGE).toMatch(/`\/umrah\/import\/batches\/\$\{batchId\}\/unlinked\?dimension=\$\{dimension\}`/);
  });

  it("the page POSTs through useApiMutation to the link endpoint", () => {
    expect(PAGE).toMatch(/`\/umrah\/import\/batches\/\$\{batchId\}\/unlinked\/link`/);
    expect(PAGE).toMatch(/useApiMutation</);
  });

  it("link UI lets the operator pick existing OR create new", () => {
    expect(PAGE).toMatch(/data-testid="link-mode-existing"/);
    expect(PAGE).toMatch(/data-testid="link-mode-new"/);
  });

  it("sub-agent new-mode surfaces the parent-agent picker", () => {
    expect(PAGE).toMatch(/data-testid="select-parent-agent"/);
    expect(PAGE).toMatch(/الوكيل الأم/);
  });
});
