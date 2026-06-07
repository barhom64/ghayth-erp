import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Blocker #3 — expand the cargo lifecycle from 7 to 13 states.
//
// These assertions lock in:
//   1. The CARGO_STATUSES alphabet matches the #1733 spec.
//   2. CARGO_TRANSITIONS encodes the forward-only walk (no state can
//      reach a non-immediate-successor; `cancelled` and `completed` are
//      terminal; cancellation is reachable from every pre-`delivered` state).
//   3. The driver's allowed-transition map at /me/cargo/:id/advance covers
//      every operational state a driver actually owns.
//   4. The migration + schema dump carry the new CHECK constraint.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string, base = apiSrc) => readFileSync(join(base, rel), "utf8");

const CARGO_ROUTE = read("routes/cargo.ts");
const FLEET_ROUTE = read("routes/fleet.ts");
const DETAIL_PAGE = read("pages/fleet/cargo-detail.tsx", spaSrc);
const DRIVER_PAGE = read("pages/fleet/me-driver.tsx", spaSrc);

const ALPHABET = [
  "draft",
  "requested",
  "approved",
  "assigned_to_driver",
  "driver_accepted",
  "trip_started",
  "arrived_pickup",
  "loaded",
  "in_transit",
  "arrived_delivery",
  "delivered",
  "completed",
  "cancelled",
] as const;

describe("#1733 — CARGO_STATUSES is the 13-state alphabet", () => {
  it("cargo.ts declares all 13 states in the canonical order", () => {
    for (const s of ALPHABET) {
      expect(CARGO_ROUTE, `missing status ${s}`).toContain(`"${s}"`);
    }
    // Old names that were renamed must NOT linger in the alphabet.
    expect(CARGO_ROUTE).not.toMatch(/CARGO_STATUSES\s*=\s*\[[^\]]*"confirmed"/);
    expect(CARGO_ROUTE).not.toMatch(/CARGO_STATUSES\s*=\s*\[[^\]]*"loading"/);
    expect(CARGO_ROUTE).not.toMatch(/CARGO_STATUSES\s*=\s*\[[^\]]*"closed"/);
  });
});

describe("#1733 — CARGO_TRANSITIONS forward-only walk + cancellation rules", () => {
  // Extract the transitions block as raw text once.
  const block = CARGO_ROUTE.match(
    /const CARGO_TRANSITIONS[\s\S]+?\};/,
  )?.[0]!;

  it("the dispatcher walk advances exactly one step per state", () => {
    expect(block).toBeTruthy();
    const expectedForward: Record<string, string> = {
      draft: "requested",
      requested: "approved",
      approved: "assigned_to_driver",
      assigned_to_driver: "driver_accepted",
      driver_accepted: "trip_started",
      trip_started: "arrived_pickup",
      arrived_pickup: "loaded",
      loaded: "in_transit",
      in_transit: "arrived_delivery",
      arrived_delivery: "delivered",
      delivered: "completed",
    };
    for (const [from, to] of Object.entries(expectedForward)) {
      // Match the row `from: ["to", "cancelled"]` OR `from: ["to"]` (terminal-ish).
      const rowRegex = new RegExp(
        `${from}\\s*:\\s*\\[[^\\]]*"${to}"[^\\]]*\\]`,
      );
      expect(block, `${from} → ${to} not encoded`).toMatch(rowRegex);
    }
  });

  it("cancellation is reachable from every pre-`delivered` state", () => {
    const cancellable = [
      "draft", "requested", "approved", "assigned_to_driver",
      "driver_accepted", "trip_started", "arrived_pickup",
      "loaded", "in_transit",
    ];
    for (const from of cancellable) {
      const rowRegex = new RegExp(
        `${from}\\s*:\\s*\\[[^\\]]*"cancelled"[^\\]]*\\]`,
      );
      expect(block, `${from} should allow cancellation`).toMatch(rowRegex);
    }
  });

  it("`completed` and `cancelled` are terminal (empty target list)", () => {
    expect(block).toMatch(/completed\s*:\s*\[\s*\]/);
    expect(block).toMatch(/cancelled\s*:\s*\[\s*\]/);
  });

  it("`arrived_delivery` and `delivered` only step forward (no cancellation)", () => {
    // Once the goods are at the consignee the operational record must
    // not flip back to cancelled — the manifest carries weight on the
    // accountant side already.
    expect(block).toMatch(/arrived_delivery\s*:\s*\[\s*"delivered"\s*\]/);
    expect(block).toMatch(/delivered\s*:\s*\[\s*"completed"\s*\]/);
  });
});

describe("#1733 — driver's /me/cargo/:id/advance walks the seven operational states", () => {
  it("DRIVER_ALLOWED_TRANSITIONS lists every state the driver legally moves into", () => {
    for (const s of [
      "driver_accepted",
      "trip_started",
      "arrived_pickup",
      "loaded",
      "in_transit",
      "arrived_delivery",
      "delivered",
    ]) {
      expect(FLEET_ROUTE).toMatch(new RegExp(`"${s}"`));
    }
    // Old binary "in_transit | delivered" gate is gone.
    expect(FLEET_ROUTE).not.toMatch(
      /status !== "in_transit" && status !== "delivered"/,
    );
  });

  it("driver's allowed map advances exactly one step per source state", () => {
    const fleetBlock = FLEET_ROUTE.match(
      /\/me\/cargo\/:id\/advance[\s\S]+?Driver cargo-advance error:/,
    )?.[0]!;
    const driverWalk: Record<string, string> = {
      assigned_to_driver: "driver_accepted",
      driver_accepted: "trip_started",
      trip_started: "arrived_pickup",
      arrived_pickup: "loaded",
      loaded: "in_transit",
      in_transit: "arrived_delivery",
      arrived_delivery: "delivered",
    };
    for (const [from, to] of Object.entries(driverWalk)) {
      expect(fleetBlock, `driver: ${from} → ${to} missing`).toMatch(
        new RegExp(`${from}\\s*:\\s*\\[\\s*"${to}"\\s*\\]`),
      );
    }
  });
});

describe("#1733 — migration 263 + schema dump carry the new constraint", () => {
  it("migration 263 exists, renames the three semantic-shift states, and re-adds CHECK with 13 values", () => {
    const migPath = join(
      apiSrc,
      "migrations",
      "263_cargo_manifest_13_state_lifecycle.sql",
    );
    expect(existsSync(migPath), "migration 263 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toMatch(/UPDATE\s+public\.cargo_manifests\s+SET\s+status\s*=\s*'approved'\s+WHERE\s+status\s*=\s*'confirmed'/i);
    expect(sql).toMatch(/UPDATE\s+public\.cargo_manifests\s+SET\s+status\s*=\s*'loaded'\s+WHERE\s+status\s*=\s*'loading'/i);
    expect(sql).toMatch(/UPDATE\s+public\.cargo_manifests\s+SET\s+status\s*=\s*'completed'\s+WHERE\s+status\s*=\s*'closed'/i);
    for (const s of ALPHABET) {
      expect(sql, `migration CHECK constraint missing ${s}`).toContain(`'${s}'`);
    }
    // Old names removed from the active constraint. The @rollback header
    // mentions them on purpose (it documents how to undo) — strip those
    // lines before asserting absence.
    const noComments = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const constraintBlock = noComments.match(/ADD CONSTRAINT cargo_manifests_status_check[\s\S]+?;/)?.[0]!;
    expect(constraintBlock).not.toContain("'confirmed'");
    expect(constraintBlock).not.toContain("'loading'");
    expect(constraintBlock).not.toContain("'closed'");
  });

  it("schema_pre.sql carries the 13-state CHECK constraint inline", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const constraint = pre.match(/CONSTRAINT cargo_manifests_status_check CHECK[^\n]+/)?.[0]!;
    expect(constraint).toBeTruthy();
    for (const s of ALPHABET) {
      expect(constraint, `dump constraint missing ${s}`).toContain(`'${s}'`);
    }
    expect(constraint).not.toContain("'confirmed'");
    expect(constraint).not.toContain("'loading'");
    expect(constraint).not.toContain("'closed'");
  });
});

describe("#1733 — SPA surfaces match the 13-state alphabet", () => {
  it("cargo-detail.tsx STATUS_OPTIONS covers every state with an Arabic label", () => {
    for (const s of ALPHABET) {
      expect(DETAIL_PAGE, `cargo-detail.tsx missing ${s}`).toContain(`value: "${s}"`);
    }
    // No stale renamed values.
    expect(DETAIL_PAGE).not.toContain('value: "confirmed"');
    expect(DETAIL_PAGE).not.toContain('value: "loading"');
    expect(DETAIL_PAGE).not.toContain('value: "closed"');
  });

  it("me-driver.tsx renders a button for every operational state the driver walks through", () => {
    for (const s of [
      "assigned_to_driver",
      "driver_accepted",
      "trip_started",
      "arrived_pickup",
      "loaded",
      "in_transit",
      "arrived_delivery",
    ]) {
      // The block `m.status === "<s>" &&` must exist so the driver sees
      // the right button at the right moment.
      expect(DRIVER_PAGE, `me-driver.tsx missing button for ${s}`).toContain(
        `m.status === "${s}"`,
      );
    }
  });
});
