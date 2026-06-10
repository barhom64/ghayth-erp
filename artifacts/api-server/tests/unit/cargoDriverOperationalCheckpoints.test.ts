import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * #1812 TR-016 / A-04 — cargo driver operational checkpoints.
 *
 * Acceptance criterion (user's mandate): «خطوات سائق الحمولة
 * التفصيلية: نقاط التشغيل (ميزان/راحة/تفتيش/تفريغ) = صفر — أكمِلها
 * وأظهِرها للسائق». The 7-state lifecycle on cargo_manifests
 * (driver_accepted .. delivered) gives the timeline its SHAPE; this
 * PR adds the WITHIN-step events the driver logs while a manifest
 * sits in `in_transit` / `loaded` / `arrived_pickup` — weighbridge
 * stop, mandated rest break, customs inspection, fueling, unloading
 * milestones.
 *
 * The two surfaces:
 *   POST /me/cargo/:id/checkpoint        (driver self)
 *   GET  /me/cargo/:id/checkpoints       (driver self list)
 *   GET  /cargo/manifests/:id/checkpoints (dispatcher view)
 *
 * Live behaviour against Postgres (A-04 E2E proof) intentionally
 * lives in a separate db:provision-agent run — see TRANSPORT plan.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const MIGRATION = "migrations/305_cargo_manifest_checkpoints.sql";
const FLEET     = read("routes/fleet.ts");
const EVENTS    = read("lib/fleet/freightEvents.ts");

describe("#1812 TR-016 — migration 305 schema", () => {
  it("file exists at the canonical migrations path", () => {
    expect(existsSync(join(apiSrc, MIGRATION))).toBe(true);
  });
  const SQL = read(MIGRATION);

  it("creates cargo_manifest_checkpoints with the required columns", () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS cargo_manifest_checkpoints/);
    expect(SQL).toMatch(/"manifestId"\s+INTEGER NOT NULL/);
    expect(SQL).toMatch(/"checkpointType"\s+VARCHAR\(32\) NOT NULL/);
    expect(SQL).toMatch(/notes\s+TEXT/);
    expect(SQL).toMatch(/latitude\s+NUMERIC\(10,7\)/);
    expect(SQL).toMatch(/longitude\s+NUMERIC\(10,7\)/);
    expect(SQL).toMatch(/"measuredValue"\s+NUMERIC\(12,2\)/);
    expect(SQL).toMatch(/"measuredUnit"\s+VARCHAR\(16\)/);
    expect(SQL).toMatch(/"recordedBy"\s+INTEGER/);
    expect(SQL).toMatch(/"recordedAt"\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  });

  it("constrains checkpointType to the user's bounded vocabulary", () => {
    expect(SQL).toMatch(/cargo_manifest_checkpoints_type_check CHECK/);
    for (const t of [
      "loading_start", "loading_complete",
      "weighing", "rest_break", "inspection",
      "customs", "fueling",
      "unloading_start", "unloading_complete", "other",
    ]) {
      expect(SQL, `type ${t} missing`).toContain(`'${t}'`);
    }
  });

  it("indexes the two query patterns (per-manifest timeline + per-type reporting)", () => {
    expect(SQL).toMatch(/idx_cargo_checkpoints_manifest/);
    expect(SQL).toMatch(/"companyId", "manifestId", "recordedAt" DESC/);
    expect(SQL).toMatch(/idx_cargo_checkpoints_type_recorded/);
    expect(SQL).toMatch(/"companyId", "checkpointType", "recordedAt" DESC/);
  });

  it("has no soft-delete column — checkpoints are audit facts", () => {
    expect(SQL).not.toMatch(/"deletedAt"/);
  });
});

describe("#1812 TR-016 — Zod schema + bounded vocabulary in fleet.ts", () => {
  it("CARGO_CHECKPOINT_TYPES enum mirrors the SQL CHECK", () => {
    for (const t of [
      "loading_start", "loading_complete",
      "weighing", "rest_break", "inspection",
      "customs", "fueling",
      "unloading_start", "unloading_complete", "other",
    ]) {
      expect(FLEET, `enum value ${t} missing`).toContain(`"${t}"`);
    }
  });

  it("createCheckpointSchema accepts the seven body fields with bounds", () => {
    expect(FLEET).toMatch(/checkpointType: z\.enum\(CARGO_CHECKPOINT_TYPES\)/);
    expect(FLEET).toMatch(/notes: z\.string\(\)\.max\(1000\)\.optional\(\)/);
    expect(FLEET).toMatch(/latitude:\s+z\.coerce\.number\(\)\.min\(-90\)\.max\(90\)/);
    expect(FLEET).toMatch(/longitude: z\.coerce\.number\(\)\.min\(-180\)\.max\(180\)/);
    expect(FLEET).toMatch(/measuredValue: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)/);
    expect(FLEET).toMatch(/measuredUnit:  z\.string\(\)\.max\(16\)\.optional\(\)/);
    expect(FLEET).toMatch(/recordedAt: z\.string\(\)\.optional\(\)/);
  });
});

describe("#1812 TR-016 — endpoint surface", () => {
  it("POST /me/cargo/:id/checkpoint — driver self, RBAC fleet.cargo.my:update", () => {
    expect(FLEET).toMatch(/router\.post\("\/me\/cargo\/:id\/checkpoint"/);
    const block = FLEET.slice(FLEET.indexOf('"/me/cargo/:id/checkpoint"'));
    expect(block.slice(0, 250)).toMatch(/feature: "fleet\.cargo\.my", action: "update"/);
  });

  it("GET /me/cargo/:id/checkpoints — driver self list, fleet.cargo.my:list", () => {
    expect(FLEET).toMatch(/router\.get\("\/me\/cargo\/:id\/checkpoints"/);
    const block = FLEET.slice(FLEET.indexOf('"/me/cargo/:id/checkpoints"'));
    expect(block.slice(0, 250)).toMatch(/feature: "fleet\.cargo\.my", action: "list"/);
  });

  it("GET /cargo/manifests/:id/checkpoints — dispatcher view, fleet.cargo:view", () => {
    expect(FLEET).toMatch(/router\.get\("\/cargo\/manifests\/:id\/checkpoints"/);
    const block = FLEET.slice(FLEET.indexOf('"/cargo/manifests/:id/checkpoints"'));
    expect(block.slice(0, 250)).toMatch(/feature: "fleet\.cargo", action: "view"/);
  });
});

describe("#1812 TR-016 — driver-only gating", () => {
  const checkpointBlock = FLEET.slice(
    FLEET.indexOf('"/me/cargo/:id/checkpoint"'),
    FLEET.indexOf('"/me/cargo/:id/checkpoints"'),
  );

  it("resolves driver from auth scope (NOT body) so a driver can't impersonate", () => {
    expect(checkpointBlock).toMatch(/const driver = await resolveDriverFromScope\(req\)/);
    expect(checkpointBlock).toMatch(/لا يوجد سجل سائق مرتبط بحسابك/);
  });

  it("queries manifest by (id, driverId, companyId) — the driver can only log on their own trip", () => {
    expect(checkpointBlock).toMatch(/WHERE id = \$1 AND "driverId" = \$2 AND "companyId" = \$3/);
  });

  it("rejects checkpoints on closed / draft manifests (CARGO_DRIVER_CHECKPOINT_OPEN_STATES gate)", () => {
    expect(FLEET).toMatch(/CARGO_DRIVER_CHECKPOINT_OPEN_STATES = \[/);
    expect(checkpointBlock).toMatch(/!CARGO_DRIVER_CHECKPOINT_OPEN_STATES\.includes\(manifest\.status\)/);
    expect(checkpointBlock).toMatch(/لا يمكن تسجيل نقطة تشغيل على بوليصة في حالة/);
  });

  it("recordedBy is FORCED to scope.userId — driver can't backdate a peer's checkpoint", () => {
    expect(checkpointBlock).toMatch(/scope\.userId, b\.recordedAt \?\? null,/);
  });

  it("INSERT uses COALESCE so omitted recordedAt defaults to NOW()", () => {
    expect(checkpointBlock).toMatch(/COALESCE\(\$10::timestamptz, NOW\(\)\)/);
  });
});

describe("#1812 TR-016 — event catalogue + audit", () => {
  it("emits CargoCheckpointRecorded after a successful insert", () => {
    const checkpointBlock = FLEET.slice(
      FLEET.indexOf('"/me/cargo/:id/checkpoint"'),
      FLEET.indexOf('"/me/cargo/:id/checkpoints"'),
    );
    expect(checkpointBlock).toMatch(/action: "fleet\.cargo\.checkpoint_recorded"/);
    expect(checkpointBlock).toMatch(/entity: "cargo_manifest_checkpoints"/);
  });

  it("FREIGHT_EVENTS catalogue declares CargoCheckpointRecorded + Arabic label", () => {
    expect(EVENTS).toMatch(/CargoCheckpointRecorded:\s+"fleet\.cargo\.checkpoint_recorded"/);
    expect(EVENTS).toMatch(/FREIGHT_EVENTS\.CargoCheckpointRecorded\]:\s+"نقطة تشغيلية مسجَّلة"/);
  });

  it("checkpoint flow posts NO journal entry from the driver-self surface", () => {
    const checkpointBlock = FLEET.slice(
      FLEET.indexOf('"/me/cargo/:id/checkpoint"'),
      FLEET.indexOf('"/me/cargo/:id/checkpoints"'),
    );
    expect(checkpointBlock).not.toMatch(/postJournalEntry|journal_entries|writeJournal/);
  });
});

describe("#1812 TR-016 — list endpoint returns chronological-asc per manifest", () => {
  it("driver list scopes by manifest.driverId join + ORDER BY recordedAt ASC", () => {
    const listBlock = FLEET.slice(
      FLEET.indexOf('"/me/cargo/:id/checkpoints"'),
      FLEET.indexOf('"/cargo/manifests/:id/checkpoints"'),
    );
    expect(listBlock).toMatch(/JOIN cargo_manifests m[\s\S]{0,200}m\."driverId" = \$1/);
    expect(listBlock).toMatch(/ORDER BY c\."recordedAt" ASC/);
  });

  it("dispatcher list is company-scoped + soft-delete-aware, no driver filter", () => {
    const start = FLEET.indexOf('"/cargo/manifests/:id/checkpoints"');
    const opsBlock = FLEET.slice(start, start + 1200);
    expect(opsBlock).toMatch(/m\."deletedAt" IS NULL/);
    expect(opsBlock).not.toMatch(/m\."driverId" =/);
  });
});
