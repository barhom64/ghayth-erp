// Integration test — mint-based numbering backfill for historical umrah
// split-off groups (#1141 follow-up).
//
// Split groups created before #2956 carry `internalRef IS NULL`. The
// register-based numberingBackfill skips NULL-ref rows by design, so these need
// a number MINTED through the centre. This test proves the umrah-owned
// backfill (previewSplitGroupNumberingBackfill / backfillSplitGroupNumbering):
//
//   - PREVIEW counts eligible (has season) vs season-blocked rows, writes nothing
//   - EXECUTE mints an internalRef for eligible rows via issueNumber, links the
//     numbering_assignments row to the group, and leaves season-blocked /
//     non-split rows untouched
//   - is IDEMPOTENT — a second run mints nothing
//
// Activation: gated on a real test Postgres via DATABASE_URL, same as the other
// *.dynamic.test.ts files; prints as skipped on dev boxes / CI without a DB.
//
// To run locally:
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/umrahSplitGroupNumberingBackfill.dynamic.test.ts

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// A seasonId that need not exist in umrah_seasons — issueNumber treats it as a
// plain counter-scope key, it does not FK-check the season. Keeps the fixture
// minimal.
const SEASON_A = 990001;
const SEASON_B = 990002;
const NUSK_PREFIX = "BFILL-TEST";

d("Umrah split-group numbering backfill — dynamic (real Postgres)", () => {
  let fx: any;
  let rawExecute: any;
  let rawQuery: any;
  let previewSplitGroupNumberingBackfill: any;
  let backfillSplitGroupNumbering: any;

  // Seed one umrah_group; returns its id.
  async function seedGroup(opts: {
    companyId: number;
    branchId: number | null;
    seasonId: number | null;
    status: string;
    tag: string;
  }): Promise<number> {
    const [row] = await rawQuery(
      `INSERT INTO umrah_groups
         ("companyId","branchId","nuskGroupNumber","seasonId",status,"internalRef","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,NULL,NOW(),NOW())
       RETURNING id`,
      [opts.companyId, opts.branchId, `${NUSK_PREFIX}-${opts.tag}`, opts.seasonId, opts.status],
    );
    return row.id as number;
  }

  async function internalRefOf(id: number): Promise<string | null> {
    const [row] = await rawQuery(
      `SELECT "internalRef" FROM umrah_groups WHERE id = $1`,
      [id],
    );
    return (row?.internalRef ?? null) as string | null;
  }

  beforeAll(async () => {
    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    fx = await setupTwoCompanyFixture();
    const db = await import("../../src/lib/rawdb.js");
    rawExecute = db.rawExecute;
    rawQuery = db.rawQuery;
    const mod = await import("../../src/lib/umrahGroupNumberingBackfill.js");
    previewSplitGroupNumberingBackfill = mod.previewSplitGroupNumberingBackfill;
    backfillSplitGroupNumbering = mod.backfillSplitGroupNumbering;

    // Ensure a season-scoped umrah_group scheme exists for company A.
    await rawExecute(
      `INSERT INTO numbering_schemes (
         "companyId","moduleKey","entityKey","displayNameAr",prefix,pattern,"padLength",
         "resetPolicy","scopePolicy","issueTiming","manualEditPolicy",
         "lockAfterStatuses","branchPrefixOverrides","isActive",
         "defaultEntityTable","defaultRefColumn"
       ) VALUES ($1,'umrah','umrah_group','مجموعة عمرة (اختبار)','UMG','{PREFIX}-{SEQ}',4,
                 'seasonal','season','on_draft','draft_only','[]'::jsonb,'{}'::jsonb,true,
                 'umrah_groups','internalRef')
       ON CONFLICT ("companyId","moduleKey","entityKey") DO UPDATE
         SET "scopePolicy"='season', "resetPolicy"='seasonal', "issueTiming"='on_draft',
             "isActive"=true, "defaultEntityTable"='umrah_groups', "defaultRefColumn"='internalRef'`,
      [fx.companyA.id],
    );
  });

  beforeEach(async () => {
    // Wipe test rows + numbering state for company A so each scenario is clean.
    await rawExecute(
      `DELETE FROM umrah_groups WHERE "companyId" = $1 AND "nuskGroupNumber" LIKE $2`,
      [fx.companyA.id, `${NUSK_PREFIX}-%`],
    );
    await rawExecute(
      `DELETE FROM numbering_assignments WHERE "companyId" = $1 AND "moduleKey" = 'umrah' AND "entityKey" = 'umrah_group'`,
      [fx.companyA.id],
    );
    await rawExecute(
      `DELETE FROM numbering_counters WHERE "companyId" = $1 AND "moduleKey" = 'umrah' AND "entityKey" = 'umrah_group'`,
      [fx.companyA.id],
    );
  });

  it("preview counts eligible vs season-blocked split groups, writes nothing", async () => {
    const eligible = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: SEASON_A, status: "split_from_42", tag: "elig" });
    const blocked = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: null, status: "split_from_43", tag: "blok" });
    // A non-split NULL-ref group must NOT be counted.
    const nonSplit = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: SEASON_A, status: "imported", tag: "nons" });

    const preview = await previewSplitGroupNumberingBackfill({ companyId: fx.companyA.id });
    expect(preview.eligible).toBe(1);
    expect(preview.blockedNoSeason).toBe(1);

    // Read-only: nothing got an internalRef.
    expect(await internalRefOf(eligible)).toBeNull();
    expect(await internalRefOf(blocked)).toBeNull();
    expect(await internalRefOf(nonSplit)).toBeNull();
  });

  it("execute mints internalRef for eligible split groups and links the assignment", async () => {
    const eligible = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: SEASON_A, status: "split_from_42", tag: "elig" });
    const blocked = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: null, status: "split_from_43", tag: "blok" });
    const nonSplit = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: SEASON_A, status: "imported", tag: "nons" });

    const result = await backfillSplitGroupNumbering({ companyId: fx.companyA.id, actorId: fx.companyA.userId });
    expect(result.minted).toBe(1);
    expect(result.skippedNoSeason).toBe(1);
    expect(result.failed).toBe(0);

    // Eligible row now carries a minted internalRef.
    const ref = await internalRefOf(eligible);
    expect(ref).toBeTruthy();
    expect(ref).toMatch(/^UMG-\d+$/);

    // The numbering_assignments row is linked to the group (entityId).
    const [assign] = await rawQuery(
      `SELECT "entityId", number, status FROM numbering_assignments
        WHERE "companyId" = $1 AND "moduleKey" = 'umrah' AND "entityKey" = 'umrah_group' AND "entityId" = $2`,
      [fx.companyA.id, eligible],
    );
    expect(assign).toBeTruthy();
    expect(assign.number).toBe(ref);
    expect(assign.status).toBe("assigned");

    // Season-blocked and non-split rows are untouched.
    expect(await internalRefOf(blocked)).toBeNull();
    expect(await internalRefOf(nonSplit)).toBeNull();
  });

  it("is idempotent — a second run mints nothing", async () => {
    await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: SEASON_A, status: "split_from_42", tag: "elig" });

    const first = await backfillSplitGroupNumbering({ companyId: fx.companyA.id, actorId: fx.companyA.userId });
    expect(first.minted).toBe(1);

    const second = await backfillSplitGroupNumbering({ companyId: fx.companyA.id, actorId: fx.companyA.userId });
    expect(second.minted).toBe(0);
    expect(second.failed).toBe(0);
  });

  it("tenant isolation — company A backfill never touches company B rows", async () => {
    const aGroup = await seedGroup({ companyId: fx.companyA.id, branchId: fx.companyA.branchId, seasonId: SEASON_A, status: "split_from_42", tag: "a" });
    const bGroup = await seedGroup({ companyId: fx.companyB.id, branchId: fx.companyB.branchId, seasonId: SEASON_B, status: "split_from_77", tag: "b" });

    const result = await backfillSplitGroupNumbering({ companyId: fx.companyA.id, actorId: fx.companyA.userId });
    expect(result.minted).toBe(1);

    expect(await internalRefOf(aGroup)).toBeTruthy();
    // Company B's split group is invisible to company A's backfill.
    expect(await internalRefOf(bGroup)).toBeNull();

    // cleanup B
    await rawExecute(`DELETE FROM umrah_groups WHERE id = $1`, [bGroup]);
  });
});
