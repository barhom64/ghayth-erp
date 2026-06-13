// #2080 U-13 P2 (migration-only) — smoke test for migration 326. Proves the
// structural anchor is in place on the live head-of-main DB: umrah_agents has a
// `clientId` column, it is INTEGER and NULLABLE, the partial lookup index
// exists, and NOTHING is backfilled (no writer sets it yet). This is the only
// thing P2 ships — no engine/invoicing/route/UI change. Test cluster only.
import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("U-13 P2 — umrah_agents.clientId migration (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;

  beforeAll(async () => {
    rawQuery = (await import("../../src/lib/rawdb.js")).rawQuery;
  });

  it("the clientId column exists, is INTEGER and NULLABLE", async () => {
    const [col] = await rawQuery<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'umrah_agents' AND column_name = 'clientId'`);
    expect(col, "umrah_agents.clientId must exist after migration 326").toBeTruthy();
    expect(col.data_type).toBe("integer");
    expect(col.is_nullable, "the column must be NULLABLE (no backfill, no NOT NULL)").toBe("YES");
  });

  it("the partial lookup index exists", async () => {
    const [idx] = await rawQuery<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'umrah_agents' AND indexname = 'idx_umrah_agents_client_id'`);
    expect(idx, "idx_umrah_agents_client_id must exist").toBeTruthy();
  });

  it("no rows are backfilled — every umrah_agents.clientId is NULL (P2 is structural only)", async () => {
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM umrah_agents WHERE "clientId" IS NOT NULL`);
    expect(n, "P2 ships no backfill; nothing should populate clientId yet").toBe(0);
  });
});
