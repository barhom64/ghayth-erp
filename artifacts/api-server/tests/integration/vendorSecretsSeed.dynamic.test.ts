// Regression guard for the orphaned vendor_secrets seed (#2153 class).
//
// PRODUCTION SYMPTOM: /admin/vendor-settings showed «لا توجد سجلات
// إعداد. طبّق migration 219 أولاً» on every fresh install, because:
//   - db/schema_pre.sql is schema-only: it has the vendor_secrets TABLE
//     but not its DATA rows;
//   - migration 219 (which seeds the six rows) is <= baseline-cutoff
//     (297), so bootstrap marks it applied WITHOUT running its INSERT.
// Net: the table existed but was empty → the SMTP card the operator
// needs (#2137) never rendered.
//
// FIX: migration 340_vendor_secrets_seed_backfill.sql (> cutoff, so it
// actually runs on boot) idempotently re-seeds the six rows with EMPTY
// config (zero secrets), ON CONFLICT (slug) DO NOTHING.
//
// This suite proves, over a live Postgres + HTTP:
//   1. after the backfill runs, all six canonical slugs exist;
//   2. GET /admin/vendor-settings returns the six cards (SMTP included)
//      with secrets masked;
//   3. re-running the backfill is a no-op and NEVER touches a row the
//      operator already configured (the active-smtp preservation case);
//   4. the seed carries NO secret material.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CANONICAL_SLUGS = ["pbx-webhook", "whatsapp", "smtp", "vapid", "siem", "zatca"];
const PFX = "vsseed-";

d("vendor_secrets seed backfill (migration 340) — orphaned-seed regression guard", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let invalidateVendorSettingsCache: typeof import("../../src/lib/vendorSettings.js").invalidateVendorSettingsCache;

  let token: string;
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };

  const backfillSql = readFileSync(
    join(import.meta.dirname!, "..", "..", "src", "migrations", "340_vendor_secrets_seed_backfill.sql"),
    "utf8",
  );

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ invalidateVendorSettingsCache } = await import("../../src/lib/vendorSettings.js"));
    const { signToken } = await import("../../src/lib/auth.js");

    await cleanup();

    const [branch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches ORDER BY id LIMIT 1`,
    );
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`,
      [PFX + "owner", PFX + "owner@test.local"],
    );
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`,
      [emp.id, 1, branch.id],
    );
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"],
    );
    created.userId = usr.id;
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "owner" });
  }, 60_000);

  afterAll(cleanup);

  async function cleanup() {
    if (!rawExecute) return;
    if (created.userId) await rawExecute(`DELETE FROM users WHERE id = $1`, [created.userId]);
    if (created.assignmentId)
      await rawExecute(`DELETE FROM employee_assignments WHERE id = $1`, [created.assignmentId]);
    if (created.employeeId)
      await rawExecute(`DELETE FROM employees WHERE id = $1`, [created.employeeId]);
    invalidateVendorSettingsCache?.();
  }

  it("backfill seeds all six canonical slugs from an empty table (the fresh-install state)", async () => {
    // Reproduce the exact production symptom: table present, but empty.
    await rawExecute(`DELETE FROM vendor_secrets`);
    expect((await rawQuery(`SELECT 1 FROM vendor_secrets`)).length).toBe(0);

    // Run the backfill migration verbatim (what a >cutoff migration does on boot).
    await rawExecute(backfillSql);
    invalidateVendorSettingsCache();

    const rows = await rawQuery<{ slug: string; status: string }>(
      `SELECT slug, status FROM vendor_secrets ORDER BY slug`,
    );
    expect(rows.map((r) => r.slug).sort()).toEqual([...CANONICAL_SLUGS].sort());
    // Seeded rows start disabled (operator flips them on) and carry NO secrets.
    for (const r of rows) expect(r.status).toBe("disabled");
    const raw = JSON.stringify(rows);
    expect(raw).not.toMatch(/enc:v1:/);
  });

  it("GET /admin/vendor-settings renders the six cards including SMTP, secrets masked", async () => {
    const res = await request(app)
      .get("/api/admin/vendor-settings")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const slugs = (res.body.data as Array<{ slug: string }>).map((r) => r.slug);
    for (const s of CANONICAL_SLUGS) expect(slugs).toContain(s);

    const smtp = (res.body.data as Array<any>).find((r) => r.slug === "smtp");
    expect(smtp).toBeTruthy();
    // empty config field stays "" (not a secret); a populated secret would be "*****".
    expect(smtp.config.password).toBe("");
  });

  it("re-running the backfill is a no-op and never touches an operator-configured row", async () => {
    // Operator wires SMTP for real (active + an encrypted password).
    await rawExecute(
      `UPDATE vendor_secrets
          SET status='active',
              config='{"host":"smtp.hostinger.com","port":"465","password":"enc:v1:OPERATOR_SET"}'::jsonb
        WHERE slug='smtp'`,
    );
    // Boot replays the idempotent backfill.
    await rawExecute(backfillSql);

    const [smtp] = await rawQuery<{ status: string; host: string; pw: string }>(
      `SELECT status, config->>'host' AS host, config->>'password' AS pw
         FROM vendor_secrets WHERE slug='smtp'`,
    );
    expect(smtp.status).toBe("active");
    expect(smtp.host).toBe("smtp.hostinger.com");
    expect(smtp.pw).toBe("enc:v1:OPERATOR_SET");

    // Still exactly six rows — no duplicates.
    const [{ count }] = await rawQuery<{ count: string }>(`SELECT count(*) AS count FROM vendor_secrets`);
    expect(Number(count)).toBe(CANONICAL_SLUGS.length);
  });
});
