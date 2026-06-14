// U-08-CLOSE — Import false-success-prevention contract.
//
// Backlog reference: docs/governance/umrah-inventory-organization-repair/
//   findings/U-08_e2e_import_false_success_audit.md §4 (recovery shape).
//
// What the audit confirmed already exists (no need to add):
//   - umrahFullCycleE2E pins JE shape with exact equality.
//   - umrahImportLinking exercises confirmMutamersImport + asserts
//     side-effects (rows landed, FKs backfilled, mutamerCount synced).
//   - 3 unit smokes pin static contracts on the preview surface.
//
// What this suite closes (the audit's §4 recovery gap):
//   - Preview counters must reconcile against the source row count
//     with EXACT equality, not ">= 0" or ">= 1". A regression that
//     under-counts errorRows or skippedCount would be invisible to the
//     existing tests.
//   - Confirm result must reconcile against preview's prediction on
//     the same input — newCount/updatedCount/skippedCount/errorCount.
//   - Unlinked sub-agent count must match the file's true unlinked
//     references (de-duped + multi-row aggregation pins).
//   - Catalog policy (`umrah.auto_link.clientLinkagePolicy`) must
//     surface verbatim through the preview return when an explicit
//     setting overrides the engine default.
//   - Re-running preview AFTER confirm must report `newRows.length === 0`
//     — the idempotency proof the audit calls out as missing today.
//
// Permanent hard rails preserved:
//   ❌ No engine touch. ❌ No catalog edit. ❌ No migration.
//   ❌ No FE change. ❌ No default flip. ❌ No silent linkage.
//   ❌ No silent client creation. ❌ Uses an isolated company name
//      (`__IMPORT_FALSE_SUCCESS_COMPANY__`) so it can't collide with
//      the existing `__IMPORT_LINK_COMPANY__` fixture.
//
// To run locally:
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test \
//     tests/integration/umrahImportFalseSuccessContract.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Magic name isolated from `__IMPORT_LINK_COMPANY__` so the two suites
// can run in any order on a shared DB.
const COMPANY_NAME = "__IMPORT_FALSE_SUCCESS_COMPANY__";
const AGENT_NAME = "وكيل العقد الكاذب";

// The 4 input rows pre-seeded into umrah_pilgrims so the import file
// can demonstrate the full diff matrix (new / update / skip).
const SEEDED_UPD_1 = {
  nuskNumber: "FSC-UPD-1",
  fullName: "اسم قديم ١",
  nationality: "سعودي",
  passportNumber: "PP-UPD-1",
};
const SEEDED_UPD_2 = {
  nuskNumber: "FSC-UPD-2",
  fullName: "اسم قديم ٢",
  nationality: "سعودي",
  passportNumber: "PP-UPD-2",
};
const SEEDED_SKIP_1 = {
  nuskNumber: "FSC-SKIP-1",
  fullName: "اسم لن يتغيّر",
  nationality: "سعودي",
  passportNumber: "PP-SKIP-1",
};

d("Umrah import — false-success-prevention contract (U-08-CLOSE, #2080)", () => {
  let rawQuery: any;
  let previewMutamersImport: any;
  let confirmMutamersImport: any;
  let upsertSetting: any;
  const ids: {
    companyId?: number;
    branchId?: number;
    userId?: number;
    seasonId?: number;
    agentId?: number;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    const c = ids.companyId;
    const rawdb = await import("../../src/lib/rawdb.js");
    // Order matters — children before parents. Each delete is tolerant
    // of "table does not exist" or "0 rows affected"; we want a partial
    // teardown to keep going so an aborted run leaves no residue that
    // re-uses the same company name on the next attempt.
    const steps: [string, unknown[]][] = [
      [`DELETE FROM umrah_import_changes WHERE "batchId" IN (SELECT id FROM umrah_import_batches WHERE "companyId"=$1)`, [c]],
      [`DELETE FROM umrah_import_batches WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_pilgrims WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_groups WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_sub_agents WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_agents WHERE "companyId"=$1`, [c]],
      [`DELETE FROM umrah_seasons WHERE "companyId"=$1`, [c]],
      [`DELETE FROM settings WHERE scope='company' AND "scopeId"=$1`, [c]],
      [`DELETE FROM employees WHERE id=$1`, [ids.userId ?? -1]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [c]],
      [`DELETE FROM companies WHERE id=$1 AND name=$2`, [c, COMPANY_NAME]],
    ];
    for (const [sql, params] of steps) {
      try {
        await rawdb.rawExecute(sql, params);
      } catch {
        // tolerate FK violations on partial state — best-effort cleanup.
      }
    }
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    const engine = await import("../../src/lib/umrahImportEngine.js");
    previewMutamersImport = engine.previewMutamersImport;
    confirmMutamersImport = engine.confirmMutamersImport;
    const settings = await import("../../src/lib/settings.js");
    upsertSetting = settings.upsertSetting;

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
       VALUES ($1, '__IMPORT_FALSE_SUCCESS_BRANCH__', 'active') RETURNING id`,
      [ids.companyId],
    );
    ids.branchId = b.id as number;

    const [emp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('False Success Tester', $1, 'active') RETURNING id`,
      [`fsc-${ids.companyId}@smoke.local`],
    );
    ids.userId = emp.id as number;

    const [season] = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
       VALUES ($1, 'False Success Season', '2026-01-01', '2026-12-31', 'open') RETURNING id`,
      [ids.companyId],
    );
    ids.seasonId = season.id as number;

    // Pre-seed the primary agent so `newAgentsToCreate` for the
    // import file stays at 0 (the contract under test is on the count
    // primitives, not on agent-creation side-effects).
    const [agent] = await rawQuery(
      `INSERT INTO umrah_agents ("companyId", name, "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
      [ids.companyId, AGENT_NAME],
    );
    ids.agentId = agent.id as number;

    // Pre-seed the 2 update + 1 skip pilgrims. They are inserted with
    // NULL FKs so the import file's FK-free rows for UPDATE/SKIP do
    // not trigger an FK-only UPDATE in confirmMutamersImport. (The
    // confirm path UNCONDITIONALLY pushes groupId/subAgentId/agentId
    // into the SET clause when truthy — that's why FK-free import
    // rows are required for the diff classes to reconcile.)
    for (const seed of [SEEDED_UPD_1, SEEDED_UPD_2, SEEDED_SKIP_1]) {
      await rawQuery(
        `INSERT INTO umrah_pilgrims
         ("companyId","branchId","seasonId","nuskNumber","fullName",nationality,status,
          "programDuration","overstayDays","isInsideKingdom","hasUmrahPermit",
          "createdBy","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,'pending',14,0,false,false,$7,NOW(),NOW())`,
        [
          ids.companyId, ids.branchId, ids.seasonId,
          seed.nuskNumber, seed.fullName, seed.nationality,
          ids.userId,
        ],
      );
    }
  }, 30000);

  afterAll(async () => {
    await teardown();
  });

  it("§A — preview counters reconcile to the source row count with exact equality", async () => {
    const rows = buildSevenRowFixture();

    const preview = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      rows,
    );

    // The 7-row fixture splits 3 / 2 / 1 / 1 across the four
    // classification buckets. A regression that mis-classifies any
    // row would break the equality.
    expect(preview.totalRows).toBe(7);
    expect(preview.newRows).toHaveLength(3);
    expect(preview.updatedRows).toHaveLength(2);
    expect(preview.skippedCount).toBe(1);
    expect(preview.errorRows).toHaveLength(1);

    // The bucket SUM must equal totalRows. This is the audit's
    // "false-success" anchor — a silent drop (engine forgets to
    // push a row to ANY bucket) shows up here.
    expect(
      preview.newRows.length +
        preview.updatedRows.length +
        preview.skippedCount +
        preview.errorRows.length,
    ).toBe(preview.totalRows);

    // Error row carries the actionable shape the operator needs to
    // fix the file (not just a count).
    expect(preview.errorRows[0].fieldName).toBe("nuskNumber");
    expect(typeof preview.errorRows[0].error).toBe("string");
  });

  it("§B — preview.unlinkedSubAgents reconciles to the file's distinct unlinked nuskCodes with row aggregation", async () => {
    const rows = buildSevenRowFixture();

    const preview = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      rows,
    );

    // Fixture references TWO distinct unlinked nuskCodes:
    //   SA-FSC-1 → appears on rows 1 + 3 → rowCount 2
    //   SA-FSC-2 → appears on row 2       → rowCount 1
    expect(preview.unlinkedSubAgents).toHaveLength(2);

    const by = new Map<string, { name: string; rowCount: number }>();
    for (const u of preview.unlinkedSubAgents) {
      by.set(u.nuskCode, { name: u.name, rowCount: u.rowCount });
    }
    expect(by.get("SA-FSC-1")?.rowCount).toBe(2);
    expect(by.get("SA-FSC-2")?.rowCount).toBe(1);
  });

  it("§C — confirm result reconciles to preview's prediction on the same input", async () => {
    const rows = buildSevenRowFixture();
    const scope = {
      companyId: ids.companyId!,
      branchId: ids.branchId!,
      userId: ids.userId!,
      seasonId: ids.seasonId!,
    };

    const preview = await previewMutamersImport(scope, rows);
    const result = await confirmMutamersImport(scope, rows, "fsc.xlsx");

    // The four count primitives MUST match preview's prediction
    // exactly. A drift here is the precise failure mode U-08
    // calls out: preview says X, confirm produces Y, operator
    // can't tell from either screen which one was the truth.
    expect(result.newCount).toBe(preview.newRows.length);
    expect(result.updatedCount).toBe(preview.updatedRows.length);
    expect(result.skippedCount).toBe(preview.skippedCount);
    expect(result.errorCount).toBe(preview.errorRows.length);

    // Confirm SUM must equal source row count too — independent
    // sanity check that the side-effect path didn't silently drop
    // a row between preview and confirm.
    expect(
      result.newCount + result.updatedCount + result.skippedCount + result.errorCount,
    ).toBe(rows.length);
  });

  it("§D — catalog policy surfaces verbatim through the preview return when explicitly set", async () => {
    // Default state — no override → engine fallback. The contract
    // says the field must always be a non-empty string, even when
    // the company has never set it. Operator UI relies on this
    // never being undefined.
    const baselineRows = buildSevenRowFixture();
    const baseline = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      baselineRows,
    );
    expect(typeof baseline.clientLinkagePolicy).toBe("string");
    expect(baseline.clientLinkagePolicy.length).toBeGreaterThan(0);
    // The engine fallback is documented as `operational_until_linked`.
    // Pinning it here makes a silent fallback change visible.
    expect(baseline.clientLinkagePolicy).toBe("operational_until_linked");

    // Explicit override — value must flow through verbatim.
    await upsertSetting(
      "company",
      ids.companyId!,
      "umrah.auto_link.clientLinkagePolicy",
      "sub_agent_client_required",
    );

    const afterOverride = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      buildSevenRowFixture(),
    );
    expect(afterOverride.clientLinkagePolicy).toBe("sub_agent_client_required");
  });

  it("§E — re-preview after confirm reports zero new rows (idempotency proof)", async () => {
    // The §C test already confirmed the 7 rows. Re-importing the
    // SAME file must classify all non-error rows as skipped (their
    // existing DB row already matches), zero new rows, zero updates.
    const rows = buildSevenRowFixture();

    const replay = await previewMutamersImport(
      { companyId: ids.companyId!, branchId: ids.branchId!, userId: ids.userId!, seasonId: ids.seasonId! },
      rows,
    );

    // The headline idempotency invariant the audit asked for.
    expect(replay.newRows).toHaveLength(0);
    // Updates must be 0 too — re-importing the same values cannot
    // produce a new diff against itself. If this fires we have a
    // non-deterministic compare (e.g. timezone normalisation drift).
    expect(replay.updatedRows).toHaveLength(0);
    // The 6 successful rows from the first confirm now skip; the
    // 7th still errors (no nuskNumber).
    expect(replay.skippedCount).toBe(6);
    expect(replay.errorRows).toHaveLength(1);

    // No-silent-linkage invariant: the linkedSubs query gates on
    // `clientId IS NOT NULL`, and confirm CREATES the sub-agents
    // without assigning a clientId. Re-preview must therefore STILL
    // surface the same two unlinked nuskCodes — confirming the
    // import path didn't silently assign a client just because a
    // sub-agent now exists. If this assertion ever flips to 0, an
    // auto-link side-effect was introduced.
    expect(replay.unlinkedSubAgents).toHaveLength(2);
  });
});

/**
 * The 7-row fixture used across §A–§E.
 *
 *   Row 1: NEW + agentName + SA-FSC-1 + GRP-FSC → newRows[0]
 *   Row 2: NEW + agentName + SA-FSC-2 + GRP-FSC → newRows[1]
 *   Row 3: NEW + agentName + SA-FSC-1 + GRP-FSC → newRows[2]
 *                                                  (SA-FSC-1 aggregates to rowCount 2)
 *   Row 4: UPDATE — pre-seeded FSC-UPD-1, new fullName, NO FKs
 *   Row 5: UPDATE — pre-seeded FSC-UPD-2, new nationality, NO FKs
 *   Row 6: SKIP   — pre-seeded FSC-SKIP-1, same fullName, NO FKs
 *   Row 7: ERROR  — missing nuskNumber
 *
 * Update/skip rows carry NO FK info (`nuskGroupNumber`, `nuskCode`,
 * `agentName`, `nuskAgentNumber` all undefined). The confirm path
 * unconditionally appends groupId/subAgentId/agentId to its UPDATE
 * SET clause whenever they resolve to truthy — so a row with an FK
 * would land in `updatedCount` even when the content was unchanged,
 * which would silently break the reconciliation against preview's
 * (content-only) classification.
 */
function buildSevenRowFixture() {
  return [
    {
      nuskNumber: "FSC-NEW-1",
      fullName: "معتمر جديد ١",
      nationality: "سعودي",
      passportNumber: "PP-NEW-1",
      nuskCode: "SA-FSC-1",
      nuskGroupNumber: "GRP-FSC",
      groupName: "مجموعة العقد",
      agentName: AGENT_NAME,
      status: "active",
    },
    {
      nuskNumber: "FSC-NEW-2",
      fullName: "معتمر جديد ٢",
      nationality: "سعودي",
      passportNumber: "PP-NEW-2",
      nuskCode: "SA-FSC-2",
      nuskGroupNumber: "GRP-FSC",
      groupName: "مجموعة العقد",
      agentName: AGENT_NAME,
      status: "active",
    },
    {
      nuskNumber: "FSC-NEW-3",
      fullName: "معتمر جديد ٣",
      nationality: "سعودي",
      passportNumber: "PP-NEW-3",
      nuskCode: "SA-FSC-1",
      nuskGroupNumber: "GRP-FSC",
      groupName: "مجموعة العقد",
      agentName: AGENT_NAME,
      status: "active",
    },
    {
      nuskNumber: SEEDED_UPD_1.nuskNumber,
      fullName: "اسم جديد ١",
      nationality: SEEDED_UPD_1.nationality,
      passportNumber: SEEDED_UPD_1.passportNumber,
      status: "active",
    },
    {
      nuskNumber: SEEDED_UPD_2.nuskNumber,
      fullName: SEEDED_UPD_2.fullName,
      nationality: "مصري",
      passportNumber: SEEDED_UPD_2.passportNumber,
      status: "active",
    },
    {
      nuskNumber: SEEDED_SKIP_1.nuskNumber,
      fullName: SEEDED_SKIP_1.fullName,
      nationality: SEEDED_SKIP_1.nationality,
      passportNumber: SEEDED_SKIP_1.passportNumber,
      status: "pending",
    },
    {
      // Empty nuskNumber → preview pushes to errorRows; confirm
      // increments errorCount and `continue`s before any side-effect.
      nuskNumber: "",
      fullName: "بدون رقم",
      nationality: "سعودي",
    },
  ];
}
