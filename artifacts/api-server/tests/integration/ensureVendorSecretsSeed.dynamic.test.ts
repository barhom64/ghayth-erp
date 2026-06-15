// Boot-time guarantee that the six vendor cards exist (belt-and-suspenders
// over migrations 219/340). ensureVendorSecretsSeed() runs on EVERY boot,
// so the operator never lands on an empty /admin/vendor-settings even if
// the migration-runner never reached the seed (orphaned-seed / stale-deploy
// edge cases).
//
// Proves over a live Postgres:
//   1. from an empty table → the six canonical slugs are seeded, disabled,
//      no secret material;
//   2. re-running is a no-op and NEVER touches an operator-configured row;
//   3. it only fills MISSING slugs (partial state is healed without churn).
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CANONICAL_SLUGS = ["pbx-webhook", "whatsapp", "smtp", "vapid", "siem", "zatca"];

d("ensureVendorSecretsSeed — boot-time vendor card guarantee", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let ensureVendorSecretsSeed: typeof import("../../src/lib/vendorSettings.js").ensureVendorSecretsSeed;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ ensureVendorSecretsSeed } = await import("../../src/lib/vendorSettings.js"));
  });

  afterAll(async () => {
    // leave the table in the canonical seeded state for other suites
    await ensureVendorSecretsSeed().catch(() => undefined);
  });

  it("seeds the six canonical slugs from an empty table", async () => {
    await rawExecute(`DELETE FROM vendor_secrets`);
    await ensureVendorSecretsSeed();
    const rows = await rawQuery<{ slug: string; status: string }>(
      `SELECT slug, status FROM vendor_secrets ORDER BY slug`,
    );
    expect(rows.map((r) => r.slug).sort()).toEqual([...CANONICAL_SLUGS].sort());
    for (const r of rows) expect(r.status).toBe("disabled");
    expect(JSON.stringify(rows)).not.toMatch(/enc:v1:/);
  });

  it("re-running is a no-op and never touches an operator-configured row", async () => {
    await rawExecute(
      `UPDATE vendor_secrets
          SET status='active',
              config='{"host":"smtp.hostinger.com","port":"465","password":"enc:v1:OPERATOR_SET"}'::jsonb
        WHERE slug='smtp'`,
    );
    await ensureVendorSecretsSeed();
    const [smtp] = await rawQuery<{ status: string; host: string; pw: string }>(
      `SELECT status, config->>'host' AS host, config->>'password' AS pw
         FROM vendor_secrets WHERE slug='smtp'`,
    );
    expect(smtp.status).toBe("active");
    expect(smtp.host).toBe("smtp.hostinger.com");
    expect(smtp.pw).toBe("enc:v1:OPERATOR_SET");
    const [{ count }] = await rawQuery<{ count: string }>(`SELECT count(*) AS count FROM vendor_secrets`);
    expect(Number(count)).toBe(CANONICAL_SLUGS.length);
  });

  it("heals a partial table — fills only the missing slugs", async () => {
    await rawExecute(`DELETE FROM vendor_secrets WHERE slug <> 'smtp'`);
    expect((await rawQuery(`SELECT 1 FROM vendor_secrets`)).length).toBe(1);
    await ensureVendorSecretsSeed();
    const rows = await rawQuery<{ slug: string }>(`SELECT slug FROM vendor_secrets ORDER BY slug`);
    expect(rows.map((r) => r.slug).sort()).toEqual([...CANONICAL_SLUGS].sort());
    // smtp (the surviving operator row) still active from the previous test
    const [smtp] = await rawQuery<{ status: string }>(`SELECT status FROM vendor_secrets WHERE slug='smtp'`);
    expect(smtp.status).toBe("active");
  });
});
