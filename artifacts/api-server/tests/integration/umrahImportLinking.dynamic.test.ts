// CI wiring for Task #577 — Umrah import linking & display fix.
//
// Reproduces the operator bug: after importing مجموعات / سندات / معتمرين the
// imported groups showed empty الوكيل (agent) + الوكيل الفرعي (sub-agent)
// columns, pilgrim counts (معتمرون) read 0, and name-only sub-agents never
// appeared in their tab. Exercises the umrahImportEngine directly so guard
// step 4 (`pnpm --filter @workspace/api-server run test`) catches a
// regression on every PR. Auto-discovered by vitest; the scenarios are
// wrapped in `describe`/`describe.skip` so dev runs without a test
// DATABASE_URL skip cleanly.
//
// To run locally:
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/umrahImportLinking.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fkSafeTeardown } from "./_fixtures/teardown.js";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__IMPORT_LINK_COMPANY__";
const AGENT_NAME = "وكيل الاستيراد الاختباري";
const SUB_AGENT_NAME = "مكتب الاستيراد الفرعي";
const GROUP_NO = "GRP-LINK-1";

d("Umrah import — agent/sub-agent/group linking + pilgrim count (Task #577)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let confirmMutamersImport: any;
  let confirmVouchersImport: any;
  const ids: {
    companyId?: number;
    branchId?: number;
    userId?: number;
    seasonId?: number;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    const c = ids.companyId;
    await fkSafeTeardown(async (del) => {
      await del(`DELETE FROM umrah_import_changes WHERE "batchId" IN (SELECT id FROM umrah_import_batches WHERE "companyId"=$1)`, [c]);
      await del(`DELETE FROM umrah_import_batches WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM umrah_nusk_invoices WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM umrah_pilgrims WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM umrah_groups WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM umrah_sub_agents WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM umrah_agents WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM umrah_seasons WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM branches WHERE "companyId"=$1`, [c]);
      await del(`DELETE FROM companies WHERE id=$1 AND name=$2`, [c, COMPANY_NAME]);
    });
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const engine = await import("../../src/lib/umrahImportEngine.js");
    confirmMutamersImport = engine.confirmMutamersImport;
    confirmVouchersImport = engine.confirmVouchersImport;

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
       VALUES ($1, '__IMPORT_LINK_BRANCH__', 'active') RETURNING id`,
      [ids.companyId],
    );
    ids.branchId = b.id as number;

    const [emp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('Import Link Tester', $1, 'active') RETURNING id`,
      [`import-link-${ids.companyId}@smoke.local`],
    );
    ids.userId = emp.id as number;

    const [season] = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
       VALUES ($1, 'Import Link Season', '2026-01-01', '2026-12-31', 'open') RETURNING id`,
      [ids.companyId],
    );
    ids.seasonId = season.id as number;
  }, 30000);

  afterAll(async () => {
    await teardown();
  });

  it("links group → agent/sub-agent via backfill and syncs the pilgrim count (mutamers import)", async () => {
    const scope = {
      companyId: ids.companyId!,
      branchId: ids.branchId!,
      userId: ids.userId!,
      seasonId: ids.seasonId!,
    };

    // Two pilgrims in the SAME group. The first row carries NO agent info
    // (group gets created blank — the original bug), the second row names
    // both the agent and a name-only (no NUSK code) sub-agent. The engine
    // must resolve them, backfill the group's FKs, and sync mutamerCount.
    const rows = [
      {
        nuskNumber: "PIL-1",
        fullName: "معتمر أول",
        nationality: "سعودي",
        passportNumber: "PP-LINK-1",
        nuskGroupNumber: GROUP_NO,
        groupName: "مجموعة الربط",
        status: "active",
      },
      {
        nuskNumber: "PIL-2",
        fullName: "معتمر ثاني",
        nationality: "سعودي",
        passportNumber: "PP-LINK-2",
        nuskGroupNumber: GROUP_NO,
        groupName: "مجموعة الربط",
        agentName: AGENT_NAME,
        subAgentName: SUB_AGENT_NAME,
        status: "active",
      },
    ];

    const res = await confirmMutamersImport(scope, rows, "import-link.xlsx");
    expect(res.newCount).toBe(2);
    expect(res.errorCount).toBe(0);

    // Agent created by name.
    const agents = await rawQuery(
      `SELECT id, name FROM umrah_agents WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, AGENT_NAME],
    );
    expect(agents).toHaveLength(1);

    // Name-only sub-agent (nuskCode NULL) created → it now shows in the tab.
    const subs = await rawQuery(
      `SELECT id, name, "nuskCode", "agentId" FROM umrah_sub_agents
        WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, SUB_AGENT_NAME],
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].nuskCode).toBeNull();
    expect(Number(subs[0].agentId)).toBe(Number(agents[0].id));

    // The group — created blank on row 1 — must be backfilled with both FKs
    // and its mutamerCount synced to the real pilgrim count (2).
    const groups = await rawQuery(
      `SELECT id, "agentId", "subAgentId", "mutamerCount" FROM umrah_groups
        WHERE "companyId"=$1 AND "nuskGroupNumber"=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, GROUP_NO],
    );
    expect(groups).toHaveLength(1);
    expect(Number(groups[0].agentId)).toBe(Number(agents[0].id));
    expect(Number(groups[0].subAgentId)).toBe(Number(subs[0].id));
    expect(Number(groups[0].mutamerCount)).toBe(2);

    // Both pilgrims linked to the group.
    const linked = await rawQuery(
      `SELECT COUNT(*)::int AS n FROM umrah_pilgrims
        WHERE "companyId"=$1 AND "groupId"=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, groups[0].id],
    );
    expect(linked[0].n).toBe(2);
  });

  it("links the nusk invoice + group to a name-only sub-agent (vouchers import)", async () => {
    const scope = {
      companyId: ids.companyId!,
      branchId: ids.branchId!,
      userId: ids.userId!,
      seasonId: ids.seasonId!,
    };

    const rows = [
      {
        nuskInvoiceNumber: "NUSK-LINK-1",
        nuskGroupNumber: GROUP_NO,
        groupName: "مجموعة الربط",
        agentName: AGENT_NAME,
        subAgentName: SUB_AGENT_NAME,
        mutamerCount: 2,
        totalAmount: 1000,
        netCost: 1000,
        nuskStatus: "active",
      },
    ];

    const res = await confirmVouchersImport(scope, rows, "vouchers-link.xlsx");
    expect(res.errorCount).toBe(0);

    const agents = await rawQuery(
      `SELECT id FROM umrah_agents WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, AGENT_NAME],
    );
    const subs = await rawQuery(
      `SELECT id FROM umrah_sub_agents WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, SUB_AGENT_NAME],
    );

    const inv = await rawQuery(
      `SELECT "agentId", "subAgentId", "groupId" FROM umrah_nusk_invoices
        WHERE "companyId"=$1 AND "nuskInvoiceNumber"=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, "NUSK-LINK-1"],
    );
    expect(inv).toHaveLength(1);
    expect(Number(inv[0].agentId)).toBe(Number(agents[0].id));
    expect(Number(inv[0].subAgentId)).toBe(Number(subs[0].id));

    const groups = await rawQuery(
      `SELECT "agentId", "subAgentId", "mutamerCount" FROM umrah_groups
        WHERE "companyId"=$1 AND "nuskGroupNumber"=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, GROUP_NO],
    );
    expect(groups).toHaveLength(1);
    expect(Number(groups[0].agentId)).toBe(Number(agents[0].id));
    expect(Number(groups[0].subAgentId)).toBe(Number(subs[0].id));
    // Vouchers don't seed pilgrim rows, so the group's mutamerCount must be
    // synced from the linked nusk invoice (2) — without it the group
    // "معتمرون" count is stuck at 0 even though the invoice carries the count.
    expect(Number(groups[0].mutamerCount)).toBe(2);
  });
});
