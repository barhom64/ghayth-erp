// Per-company SMTP override ("بريد الشركة" — migration 388).
//
// Proves over a live Postgres that resolveSystemSmtpConfig honours a
// company's own active vendor_secrets row (companyId = X) OVER the platform
// default (companyId IS NULL), while a company with no row falls through to
// the platform mailbox UNCHANGED. This is the whole point of the feature.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("per-company SMTP override (migration 388)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let resolveSystemSmtpConfig: typeof import("../../src/lib/systemSmtp.js").resolveSystemSmtpConfig;
  let invalidateVendorSettingsCache: typeof import("../../src/lib/vendorSettings.js").invalidateVendorSettingsCache;

  let companyId = 0;

  const platformCfg = JSON.stringify({ host: "platform.example.com", port: "465", user: "sys@door.sa", password: "p1", from: "sys@door.sa", secure: "true" });
  const companyCfg = JSON.stringify({ host: "company.example.com", port: "587", user: "info@acme.test", password: "p2", from: "info@acme.test", secure: "false" });

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ resolveSystemSmtpConfig } = await import("../../src/lib/systemSmtp.js"));
    ({ invalidateVendorSettingsCache } = await import("../../src/lib/vendorSettings.js"));

    const [c] = await rawQuery<{ id: number }>(`SELECT id FROM companies ORDER BY id LIMIT 1`);
    companyId = c!.id;

    // Platform default (companyId IS NULL), active.
    await rawExecute(
      `INSERT INTO vendor_secrets (slug, name, description, status, config, "companyId")
       VALUES ('smtp', 'Email (SMTP)', 'platform', 'active', $1::jsonb, NULL)
       ON CONFLICT (slug) WHERE "companyId" IS NULL
       DO UPDATE SET status = 'active', config = EXCLUDED.config`,
      [platformCfg],
    );
    // Per-company row, active.
    await rawExecute(`DELETE FROM vendor_secrets WHERE slug = 'smtp' AND "companyId" = $1`, [companyId]);
    await rawExecute(
      `INSERT INTO vendor_secrets (slug, name, description, status, config, "companyId")
       VALUES ('smtp', 'بريد الشركة', 'company override', 'active', $1::jsonb, $2)`,
      [companyCfg, companyId],
    );
    invalidateVendorSettingsCache();
  }, 60_000);

  afterAll(async () => {
    if (rawExecute && companyId) {
      await rawExecute(`DELETE FROM vendor_secrets WHERE slug = 'smtp' AND "companyId" = $1`, [companyId]).catch(() => undefined);
    }
    invalidateVendorSettingsCache?.();
  });

  it("a company's active row OVERRIDES the platform default", async () => {
    const cfg = await resolveSystemSmtpConfig(companyId);
    expect(cfg?.host).toBe("company.example.com");
    expect(cfg?.port).toBe(587);
  });

  it("a company WITHOUT its own row falls through to the platform default", async () => {
    // 999999 has no per-company row → platform.
    const cfg = await resolveSystemSmtpConfig(999999);
    expect(cfg?.host).toBe("platform.example.com");
  });

  it("the platform resolver (no companyId) is unchanged", async () => {
    const cfg = await resolveSystemSmtpConfig();
    expect(cfg?.host).toBe("platform.example.com");
  });

  it("disabling the company row reverts that company to the platform default", async () => {
    await rawExecute(`UPDATE vendor_secrets SET status = 'disabled' WHERE slug = 'smtp' AND "companyId" = $1`, [companyId]);
    invalidateVendorSettingsCache();
    const cfg = await resolveSystemSmtpConfig(companyId);
    expect(cfg?.host).toBe("platform.example.com");
  });
});
