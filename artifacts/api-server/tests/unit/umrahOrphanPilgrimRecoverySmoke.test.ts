import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §3 EXTENSION of #1870 — owner-review point 3.ب.
 *
 * PR #1878 added per-batch recovery for unlinked rows imported AFTER
 * the engine fix in #1867. But rows imported via the pre-#1867
 * legacy `doImport()` helper (notably the operator's 1,363-row
 * case) were never tagged in `umrah_import_changes`, so the
 * per-batch screen can't see them. The original PR had to tell the
 * operator "re-import the file" — unacceptable for production data.
 *
 * This PR adds a DIRECT-on-pilgrims recovery path:
 *
 *   1. GET /umrah/orphan-pilgrims?dimension=...  — list all pilgrims
 *      with the chosen FK NULL, no batch lineage required.
 *   2. POST /umrah/orphan-pilgrims/link  — bulk-link to existing or
 *      newly-created agent/group/sub-agent, with a "still NULL"
 *      guard so concurrent recoveries don't double-link.
 *   3. /umrah/orphan-pilgrims FE page  — three tabs + the per-batch
 *      page's bulk-link UX, scoped globally.
 *   4. Compliance dashboard surfaces the orphan headcount as a tile
 *      and folds it into totalRisk.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/orphan-pilgrims.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);
const COMPLIANCE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/compliance.tsx"),
  "utf8",
);

describe("API — GET /umrah/orphan-pilgrims", () => {
  it("declares the route + the dimension query whitelist", () => {
    expect(ROUTE).toMatch(/router\.get\("\/orphan-pilgrims"/);
    expect(ROUTE).toMatch(/!\["agent", "group", "subAgent"\]\.includes\(dimension\)/);
  });

  it("queries umrah_pilgrims directly without joining umrah_import_changes", () => {
    // This is THE point: catches legacy orphans that have no
    // import-changes audit lineage. The SQL must not JOIN or EXISTS
    // through `umrah_import_changes` — that's what excluded the
    // legacy 1,363 rows from PR #1878's per-batch screen.
    const handler = ROUTE.match(
      /router\.get\("\/orphan-pilgrims"[\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/FROM umrah_pilgrims p/);
    // Strip JS comments before checking the SQL body — header
    // comments legitimately reference the per-batch table for
    // context. What we care about is the actual query SQL.
    const sqlOnly = handler![0]
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sqlOnly).not.toMatch(/JOIN\s+umrah_import_changes/i);
    expect(sqlOnly).not.toMatch(/FROM\s+umrah_import_changes/i);
  });

  it("dimension → FK column mapping is whitelist-driven (no string injection)", () => {
    expect(ROUTE).toMatch(/const fkColumn = dimension === "agent" \? "agentId"/);
    expect(ROUTE).toMatch(/: dimension === "group" \? "groupId"/);
    expect(ROUTE).toMatch(/: "subAgentId"/);
  });

  it("response includes per-dimension totals + the row list", () => {
    expect(ROUTE).toMatch(/totals: \{\s*[\r\n]+\s*agent: Number\(counts\?\.agentCount/);
    expect(ROUTE).toMatch(/group: Number\(counts\?\.groupCount/);
    expect(ROUTE).toMatch(/subAgent: Number\(counts\?\.subAgentCount/);
  });

  it("optional seasonId filter is plumbed into both queries", () => {
    const handler = ROUTE.match(
      /router\.get\("\/orphan-pilgrims"[\s\S]*?\n\}\);\n/,
    );
    expect(handler![0]).toMatch(/let seasonClause = ""/);
    expect(handler![0]).toMatch(/p\."seasonId" = \$\$\{params\.length\}/);
  });
});

describe("API — POST /umrah/orphan-pilgrims/link", () => {
  it("validates exactly-one of targetId / newEntityName", () => {
    expect(ROUTE).toMatch(/linkOrphanSchema = z\.object\([\s\S]*?\)\.refine\(\(v\) => \(v\.targetId !== undefined\) !== \(v\.newEntityName !== undefined\)/);
  });

  it("verifies target ownership via companyId on the dimension table", () => {
    const handler = ROUTE.match(
      /router\.post\("\/orphan-pilgrims\/link"[\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/SELECT id FROM \$\{table\} WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NULL/);
  });

  it("sub-agent creation requires a parentAgentId", () => {
    expect(ROUTE).toMatch(/يجب اختيار الوكيل الأم للوكيل الفرعي/);
  });

  it("UPDATE only touches rows that are STILL NULL on that FK", () => {
    // Defence against concurrent recoveries — without this, two
    // operators racing to link the same row would each "win" once
    // and the audit log would show two changes.
    const handler = ROUTE.match(
      /router\.post\("\/orphan-pilgrims\/link"[\s\S]*?\n\}\);\n/,
    );
    expect(handler![0]).toMatch(/p\."\$\{fkColumn\}" IS NULL/);
  });

  it("wraps the multi-step mutation in withTransaction", () => {
    const handler = ROUTE.match(
      /router\.post\("\/orphan-pilgrims\/link"[\s\S]*?\n\}\);\n/,
    );
    expect(handler![0]).toMatch(/await withTransaction\(async \(client\) =>/);
  });

  it("emits umrah.orphan_pilgrims.linked event", () => {
    expect(ROUTE).toMatch(/action: "umrah\.orphan_pilgrims\.linked"/);
  });
});

describe("API — compliance dashboard surfaces the orphan count", () => {
  it("Promise.all destructures the new orphanRow query", () => {
    // Orphan signal is the LAST item in the Promise.all destructure —
    // the §8 audit signals (failedRow, missingApRow) keep their slots
    // so the existing compliance tiles keep working.
    expect(ROUTE).toMatch(/const \[[\s\S]*?exemptRow[\s\S]*?visaRow[\s\S]*?overstayRow[\s\S]*?penaltyRow[\s\S]*?failedRow[\s\S]*?missingApRow[\s\S]*?orphanRow[\s\S]*?\] = await Promise\.all/);
  });

  it("orphan query catches any NULL FK (agent OR group OR sub-agent)", () => {
    // The dashboard's headline is "ALL legacy damage" — a row missing
    // a sub-agent only is still legacy damage. OR (not AND) is the
    // correct semantic.
    expect(ROUTE).toMatch(/p\."agentId" IS NULL OR p\."groupId" IS NULL OR p\."subAgentId" IS NULL/);
  });

  it("response payload includes orphanPilgrims", () => {
    expect(ROUTE).toMatch(/orphanPilgrims: Number\(orphanRow\[0\]\?\.c \?\? "0"\)/);
  });
});

describe("FE — page registration + tile + totalRisk", () => {
  it("/umrah/orphan-pilgrims is registered in umrahRoutes", () => {
    expect(ROUTES).toMatch(/UmrahOrphanPilgrims = lazy\(\(\) => import\("@\/pages\/umrah\/orphan-pilgrims"\)\)/);
    expect(ROUTES).toMatch(/path: "\/umrah\/orphan-pilgrims"/);
  });

  it("ComplianceResp type carries the optional orphanPilgrims field", () => {
    expect(COMPLIANCE).toMatch(/orphanPilgrims\?: number;/);
  });

  it("compliance dashboard renders an orphan tile linking to the recovery page", () => {
    expect(COMPLIANCE).toMatch(/testid: "compliance-tile-orphan"/);
    expect(COMPLIANCE).toMatch(/معتمرون يتامى \(بلا ربط\)/);
    expect(COMPLIANCE).toMatch(/href: `\/umrah\/orphan-pilgrims`/);
  });

  it("totalRisk folds the orphan count into the headline number", () => {
    expect(COMPLIANCE).toMatch(/\(data\?\.orphanPilgrims \?\? 0\)/);
  });
});

describe("FE — orphan-pilgrims page", () => {
  it("renders three dimension tabs", () => {
    expect(PAGE).toMatch(/data-testid="orphan-tab-agent"/);
    expect(PAGE).toMatch(/data-testid="orphan-tab-group"/);
    expect(PAGE).toMatch(/data-testid="orphan-tab-subAgent"/);
  });

  it("calls the global endpoint, NOT the per-batch one", () => {
    expect(PAGE).toMatch(/`\/umrah\/orphan-pilgrims\?dimension=\$\{dimension\}`/);
    expect(PAGE).not.toMatch(/`\/umrah\/import\/batches\/\$\{batchId\}\/unlinked/);
  });

  it("link UI offers existing OR create-new modes", () => {
    expect(PAGE).toMatch(/data-testid="orphan-link-mode-existing"/);
    expect(PAGE).toMatch(/data-testid="orphan-link-mode-new"/);
  });

  it("sub-agent new-mode surfaces the parent-agent picker", () => {
    expect(PAGE).toMatch(/data-testid="orphan-select-parent-agent"/);
    expect(PAGE).toMatch(/الوكيل الأم/);
  });

  it("invalidates the headcount query + compliance query after a link", () => {
    // Without these, the tab counts + compliance tile would stay
    // stale until the operator manually refreshes.
    expect(PAGE).toMatch(/\["umrah-orphan-pilgrims-headcount", dimension\]/);
    expect(PAGE).toMatch(/\["umrah-compliance"\]/);
  });

  it("explains the legacy-data context in operator-facing copy", () => {
    // The whole purpose of this screen is to spare the operator
    // the "re-import the file" advice that PR #1878 had to give.
    // That copy must appear somewhere in the page.
    expect(PAGE).toContain("لا تحتاج لإعادة استيراد");
  });
});
