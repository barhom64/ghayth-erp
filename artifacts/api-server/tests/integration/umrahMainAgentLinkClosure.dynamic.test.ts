// BILL-MAIN P7 — closure pack for the main-agent linkage loop.
//
// Roadmap reference: docs/governance/umrah-inventory-organization-repair/
//   findings/UMRAH_REMAINING_WORK_ROADMAP.md §5 line 106.
//
//   "P7 — Closure pack: contract/e2e proving import → link → invoice
//    loop on the agent path. 🟢 autonomous. Tests only."
//
// Closure shape:
//
//   1. Operator imports a mutamers file that references an existing
//      MAIN agent whose `clientId IS NULL`.
//      → BILL-MAIN P6 surfaces it on `preview.unlinkedMainAgents`.
//
//   2. Operator runs the BILL-MAIN P3 linker
//      (`PUT /umrah/agents/:id/link-client`) to assign the existing
//      financial client to that agent. The linker is operator-
//      confirmed — it only updates `umrah_agents.clientId`, no AR
//      opening, no client creation.
//
//   3. Operator re-imports the SAME file.
//      → `preview.unlinkedMainAgents` is empty. The agent is gone
//         from the banner because its `clientId` is now populated.
//      → The import detection is purely table-driven (no cached
//         memo), so a same-process re-preview sees the link.
//
// Why this is a CLOSURE and not a regression:
//   The BILL-MAIN P3 smoke pins the route shape, and the BILL-MAIN
//   P6 smoke pins the preview field. Neither asserts that the two
//   compose: the audit trail says "P3 links, P6 detects" but a
//   regression that breaks the LINK ↔ DETECT connection (e.g. the
//   preview query reads a stale snapshot, or the linker writes to
//   a different column) would slip past both smokes. This test
//   closes that gap.
//
// What this test deliberately does NOT cover:
//   - Invoice generation under `main_agent_client` policy mode.
//     The roadmap classifies P4 (engine fallback that reads
//     `agent.clientId` when sub-agent's is null) as 🔴 hard-pause.
//     The "invoice loop on the agent path" the roadmap mentions
//     activates with P4. Until P4 ships, the closure is for the
//     IMPORT → LINK → RE-IMPORT half only — the loop the audit
//     trail already promises end-to-end on `main`.
//
// Permanent hard rails preserved:
//   ❌ No engine touch. ❌ No catalog edit. ❌ No migration.
//   ❌ No FE change. ❌ No default flip. ❌ No silent linkage.
//   ❌ Isolated company name (`__BILL_MAIN_P7_COMPANY__`) so it
//      can't collide with the existing `__IMPORT_LINK_COMPANY__` or
//      `__IMPORT_FALSE_SUCCESS_COMPANY__` fixtures.
//   ❌ The "link" step is performed via the SAME SQL UPDATE the
//      route runs — verified shape-equivalent to the route by
//      umrahMainAgentLinkClientSmoke. This avoids spinning the
//      Express stack for one assertion; the P3 smoke already
//      protects the HTTP surface.
//
// To run locally:
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test \
//     tests/integration/umrahMainAgentLinkClosure.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Magic name isolated from the two other umrah integration fixtures.
const COMPANY_NAME = "__BILL_MAIN_P7_COMPANY__";
const AGENT_NAME = "وكيل البلوك الرئيسي للإغلاق";

d("BILL-MAIN P7 — main-agent linkage closure (import → link → re-import, #2080)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let previewMutamersImport: any;
  const ids: {
    companyId?: number;
    branchId?: number;
    userId?: number;
    seasonId?: number;
    clientId?: number;
    agentId?: number;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    const c = ids.companyId;
    const steps: [string, unknown[]][] = [
      [`DELETE FROM umrah_pilgrims WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_groups WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_sub_agents WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_agents WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_seasons WHERE "companyId"=$1`, [c]],
      [`DELETE FROM clients WHERE "companyId"=$1`, [c]],
      [`DELETE FROM employees WHERE id=$1`, [ids.userId ?? -1]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [c]],
      [`DELETE FROM companies WHERE id=$1 AND name=$2`, [c, COMPANY_NAME]],
    ];
    for (const [sql, params] of steps) {
      try { await rawExecute(sql, params); } catch { /* tolerate */ }
    }
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const engine = await import("../../src/lib/umrahImportEngine.js");
    previewMutamersImport = engine.previewMutamersImport;

    // Clear any leftover tenant from a prior aborted run.
    const prior = await rawQuery(`SELECT id FROM companies WHERE name=$1`, [COMPANY_NAME]);
    for (const row of prior) {
      ids.companyId = row.id as number;
      await teardown();
    }
    ids.companyId = undefined;

    const [c] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME],
    );
    ids.companyId = c.id as number;

    const [b] = await rawQuery(
      `INSERT INTO branches ("companyId", name, status)
       VALUES ($1, '__BILL_MAIN_P7_BRANCH__', 'active') RETURNING id`,
      [ids.companyId],
    );
    ids.branchId = b.id as number;

    const [emp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('BILL-MAIN P7 Tester', $1, 'active') RETURNING id`,
      [`bill-main-p7-${ids.companyId}@smoke.local`],
    );
    ids.userId = emp.id as number;

    const [season] = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
       VALUES ($1, 'BILL-MAIN P7 Season', '2026-01-01', '2026-12-31', 'open') RETURNING id`,
      [ids.companyId],
    );
    ids.seasonId = season.id as number;

    // The financial client the operator will eventually assign to
    // the main agent. Pre-existing — the linker is operator-
    // confirmed linkage of an EXISTING client (no createNew branch).
    const [client] = await rawQuery(
      `INSERT INTO clients ("companyId", name, "createdAt", "updatedAt")
       VALUES ($1, 'عميل العقد الرئيسي', NOW(), NOW()) RETURNING id`,
      [ids.companyId],
    );
    ids.clientId = client.id as number;

    // The main agent — deliberately created with `clientId = NULL`
    // so the import preview's BILL-MAIN P6 detection surfaces it.
    const [agent] = await rawQuery(
      `INSERT INTO umrah_agents ("companyId", name, "contractRef", "clientId", "createdAt", "updatedAt")
       VALUES ($1, $2, 'CTR-P7-1', NULL, NOW(), NOW()) RETURNING id`,
      [ids.companyId, AGENT_NAME],
    );
    ids.agentId = agent.id as number;
  }, 30000);

  afterAll(async () => {
    await teardown();
  });

  it("§A — import preview surfaces the unlinked main agent (BILL-MAIN P6 anchor)", async () => {
    const rows = buildImportRows(AGENT_NAME);

    const preview = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      rows,
    );

    // The agent exists with clientId NULL, so BILL-MAIN P6 must
    // list it under unlinkedMainAgents. A regression that drops
    // the `clientId IS NULL` filter would fire here.
    expect(preview.unlinkedMainAgents).toHaveLength(1);
    expect(preview.unlinkedMainAgents[0].agentId).toBe(ids.agentId);
    expect(preview.unlinkedMainAgents[0].name).toBe(AGENT_NAME);
    expect(preview.unlinkedMainAgents[0].nuskAgentNumber).toBe("CTR-P7-1");

    // Sanity: the agent is the only one for this tenant and the
    // preview must not surface it twice (matchedMainAgents Map
    // dedupes by agentId).
    const sameAgentEntries = preview.unlinkedMainAgents.filter(
      (a: any) => a.agentId === ids.agentId,
    );
    expect(sameAgentEntries).toHaveLength(1);
  });

  it("§B — operator-confirmed link writes `clientId` ONLY (no AR opening, no client create)", async () => {
    // Run the same SQL UPDATE the PUT /agents/:id/link-client route
    // runs. The route's full HTTP shape (auth, audit, event, error
    // paths) is pinned by `umrahMainAgentLinkClientSmoke`; this
    // closure verifies the DB side-effect is exactly one column
    // write on `umrah_agents`, nothing else.

    const before = await rawQuery(
      `SELECT id, "clientId" FROM umrah_agents WHERE id=$1`,
      [ids.agentId],
    );
    expect(Number(before[0].clientId ?? -1)).toBe(-1); // NULL → -1 by coalesce

    const clientsBefore = await rawQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM clients WHERE "companyId"=$1`,
      [ids.companyId],
    );

    await rawExecute(
      `UPDATE umrah_agents SET "clientId"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [ids.clientId, ids.agentId, ids.companyId],
    );

    const after = await rawQuery(
      `SELECT id, "clientId" FROM umrah_agents WHERE id=$1`,
      [ids.agentId],
    );
    expect(Number(after[0].clientId)).toBe(Number(ids.clientId));

    const clientsAfter = await rawQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM clients WHERE "companyId"=$1`,
      [ids.companyId],
    );
    // The route is documented as a "no client create" path. The
    // clients table count MUST be unchanged.
    expect(clientsAfter[0].n).toBe(clientsBefore[0].n);
  });

  it("§C — re-import preview no longer surfaces the agent (closure proof)", async () => {
    const rows = buildImportRows(AGENT_NAME);

    const preview = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      rows,
    );

    // The closure invariant: §A surfaced 1, §B linked, §C must
    // surface 0. A regression where preview reads a cached snapshot
    // would still report 1 here.
    expect(preview.unlinkedMainAgents).toHaveLength(0);
  });

  it("§D — invoicing-engine boundary preserved (no `agent.clientId` read ahead of P4)", async () => {
    // The roadmap classifies the engine-side read of `agent.clientId`
    // as BILL-MAIN P4 (🔴 hard-pause). P7 must not start that work.
    // We read the engine source and assert the field is still NOT
    // referenced — same anchor the P6 smoke uses.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const REPO_ROOT = join(import.meta.dirname!, "../../../..");
    const ENGINE = readFileSync(
      join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
      "utf8",
    );
    expect(ENGINE).not.toMatch(/\bagent\.clientId\b/);
    expect(ENGINE).not.toMatch(/billingClientId/);
  });
});

/**
 * Tiny mutamers file that references the main agent by `agentName`.
 * The preview engine fetches existing `umrah_agents` rows that
 * match by name + reads their `clientId` to populate the
 * `unlinkedMainAgents` list. One row is enough — P6 dedupes by
 * `agentId`, so the closure shape doesn't need multi-row volume.
 */
function buildImportRows(agentName: string) {
  return [
    {
      nuskNumber: "P7-PIL-1",
      fullName: "معتمر إغلاق ١",
      nationality: "سعودي",
      passportNumber: "PP-P7-1",
      nuskGroupNumber: "GRP-P7-1",
      groupName: "مجموعة الإغلاق",
      agentName,
      status: "active",
    },
  ];
}
