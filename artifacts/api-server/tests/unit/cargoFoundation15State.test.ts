import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Foundation — 15-state lifecycle + billing/service-type columns
// + transport_service_lines bridge + accountant-gated billing-candidate
// handoff. Locks in:
//   1. CARGO_STATUSES grew to the full 15 the latest #1733 chain wants.
//   2. CARGO_TRANSITIONS encodes the new bridge:
//        completed → ready_for_invoice → financially_closed (terminal).
//   3. The candidate handoff (#1750) NO LONGER fires on `delivered` —
//      it fires on `ready_for_invoice` (Comment 0's explicit demand).
//   4. transport_service_lines insert lives on the same gate.
//   5. The driver's /me/cargo/:id/advance NEVER creates the candidate
//      itself (#1733 directive: only the dispatcher's ready_for_invoice
//      flip triggers the finance handoff).
//   6. The accountant's materialize endpoint flips the manifest to
//      `financially_closed` and the billing-status badge to `invoiced`.
//   7. Migration 265 + schema dump carry the new states, columns,
//      table, and constraints.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string, base = apiSrc) => readFileSync(join(base, rel), "utf8");

const CARGO_ROUTE = read("routes/cargo.ts");
const FLEET_ROUTE = read("routes/fleet.ts");
const HANDOFF_ROUTE = read("routes/transport-billing-candidates.ts");
const DETAIL_PAGE = read("pages/fleet/cargo-detail.tsx", spaSrc);

const ALPHABET_15 = [
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
  "ready_for_invoice",
  "financially_closed",
  "cancelled",
] as const;

describe("#1733 Foundation — 15-state CARGO_STATUSES", () => {
  it("cargo.ts declares all 15 states", () => {
    for (const s of ALPHABET_15) {
      expect(CARGO_ROUTE, `missing state ${s}`).toContain(`"${s}"`);
    }
  });

  it("CARGO_TRANSITIONS bridges operational → finance correctly", () => {
    const block = CARGO_ROUTE.match(
      /const CARGO_TRANSITIONS[\s\S]+?\};/,
    )?.[0]!;
    expect(block).toBeTruthy();
    // The operational close steps into the finance gate.
    expect(block).toMatch(/completed\s*:\s*\[\s*"ready_for_invoice"\s*\]/);
    // ready_for_invoice steps into the terminal state.
    expect(block).toMatch(/ready_for_invoice\s*:\s*\[\s*"financially_closed"\s*\]/);
    // financially_closed is terminal.
    expect(block).toMatch(/financially_closed\s*:\s*\[\s*\]/);
    // cancelled is reachable from every pre-ready_for_invoice state
    // but NOT from ready_for_invoice or financially_closed.
    expect(block).not.toMatch(/financially_closed\s*:\s*\[[^\]]*"cancelled"/);
  });
});

describe("#1733 Foundation — billing-candidate handoff moved off `delivered`", () => {
  it("cargo.ts PATCH creates the candidate on `ready_for_invoice`, not `delivered`", () => {
    // Find the candidate-creation block — it must be guarded by
    // ready_for_invoice, not delivered.
    const candidateBlock = CARGO_ROUTE.match(
      /createCargoBillingCandidate[\s\S]{0,2000}?notes: \(row\.notes/,
    )?.[0]!;
    expect(candidateBlock, "candidate creation block missing").toBeTruthy();

    // The if condition wrapping it must reference ready_for_invoice.
    // Find the if-guard immediately preceding createCargoBillingCandidate.
    const guardMatch = CARGO_ROUTE.match(
      /if \(b\.status === "ready_for_invoice"[^)]*\)[\s\S]{0,200}?createCargoBillingCandidate/,
    );
    expect(guardMatch, "candidate not gated by ready_for_invoice").toBeTruthy();

    // The OLD `delivered`-guarded handoff must be GONE.
    expect(CARGO_ROUTE).not.toMatch(
      /if \(b\.status === "delivered"[\s\S]{0,400}?createCargoBillingCandidate/,
    );
  });

  it("transport_service_lines row is inserted on the same gate", () => {
    const block = CARGO_ROUTE.match(
      /if \(b\.status === "ready_for_invoice"[\s\S]+?ON CONFLICT \("companyId", "sourceType", "sourceId"\) DO NOTHING/,
    )?.[0];
    expect(block, "service line insert missing").toBeTruthy();
    expect(block!).toContain("transport_service_lines");
    expect(block!).toContain("ready_for_accounting");
  });

  it("cargo PATCH flips billingStatus to ready_for_accounting on the same gate", () => {
    const block = CARGO_ROUTE.match(
      /if \(b\.status === "ready_for_invoice"[\s\S]+?"billingStatus" = 'not_billable'/,
    )?.[0];
    expect(block, "billingStatus flip missing").toBeTruthy();
  });

  it("fleet.ts /me/cargo/:id/advance NO LONGER calls createCargoBillingCandidate", () => {
    // Strict: the driver-self route must not invoke the candidate
    // helper at all — only the dispatcher's ready_for_invoice flip does.
    const driverAdvance = FLEET_ROUTE.match(
      /\/me\/cargo\/:id\/advance[\s\S]{0,4000}?Driver cargo-advance error:/,
    )?.[0];
    expect(driverAdvance).toBeTruthy();
    expect(driverAdvance!).not.toContain("createCargoBillingCandidate");
  });
});

describe("#1733 Foundation — materialise endpoint closes the loop", () => {
  it("flips manifest to `financially_closed` + billingStatus to `invoiced` on materialise", () => {
    // Both UPDATEs must run inside the same transaction that calls
    // postCargoDeliveryGL — re-materialise is blocked by the status guard.
    const block = HANDOFF_ROUTE.match(
      /UPDATE cargo_manifests[\s\S]{0,500}?financially_closed[\s\S]{0,500}?status = 'ready_for_invoice'/,
    )?.[0];
    expect(block, "manifest financial close missing").toBeTruthy();

    expect(HANDOFF_ROUTE).toContain(
      `"billingStatus" = 'invoiced'`,
    );

    // Service line also gets `invoiced` on materialise.
    expect(HANDOFF_ROUTE).toMatch(
      /UPDATE transport_service_lines[\s\S]{0,300}?"billingStatus" = 'invoiced'/,
    );
  });
});

describe("#1733 Foundation — migration 265 + schema dump", () => {
  it("migration 265 declares 15-state CHECK + new columns + transport_service_lines", () => {
    const migPath = join(
      apiSrc,
      "migrations",
      "265_foundation_15state_billing.sql",
    );
    expect(existsSync(migPath), "migration 265 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");

    for (const s of ALPHABET_15) {
      expect(sql, `migration CHECK missing ${s}`).toContain(`'${s}'`);
    }
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "billingStatus"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "transportServiceType"/);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.transport_service_lines");
    expect(sql).toContain("uq_transport_service_line_source");
  });

  it("schema_pre.sql carries the 15-state CHECK + new columns + table", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const constraint = pre.match(/CONSTRAINT cargo_manifests_status_check CHECK[^\n]+/)?.[0]!;
    expect(constraint).toBeTruthy();
    for (const s of ALPHABET_15) {
      expect(constraint, `dump constraint missing ${s}`).toContain(`'${s}'`);
    }
    const fleetVehiclesBlock = pre.match(
      /CREATE TABLE public\.cargo_manifests[\s\S]+?\)\s*;\s*\n/,
    )?.[0]!;
    expect(fleetVehiclesBlock).toContain("billingStatus");
    expect(fleetVehiclesBlock).toContain("transportServiceType");
    expect(pre).toContain("CREATE TABLE public.transport_service_lines");
  });

  it("schema_post.sql carries PK + unique + indexes for transport_service_lines", () => {
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    expect(post).toContain("transport_service_lines_pkey");
    expect(post).toContain("uq_transport_service_line_source");
    expect(post).toContain("idx_service_lines_customer_status");
    expect(post).toContain("idx_cargo_manifests_billing_status");
  });
});

describe("#1733 Foundation — SPA reflects the new states + finance badge", () => {
  it("cargo-detail.tsx STATUS_OPTIONS adds ready_for_invoice + financially_closed", () => {
    expect(DETAIL_PAGE).toContain('value: "ready_for_invoice"');
    expect(DETAIL_PAGE).toContain('value: "financially_closed"');
  });

  it("cargo-detail.tsx exports the billingStatus label map for read-only display", () => {
    expect(DETAIL_PAGE).toContain("BILLING_STATUS_LABEL");
    // All five values must appear in the label map.
    for (const v of ["not_billable", "ready_for_accounting", "under_review", "invoiced", "excluded"]) {
      expect(DETAIL_PAGE, `BILLING_STATUS_LABEL missing ${v}`).toContain(`${v}:`);
    }
  });
});
