import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 final-gap closures from the audit:
//   1. Three-bucket expense classification columns on the existing fleet
//      expense surfaces (fuel logs, maintenance, traffic violations).
//   2. fleet_expense_rules engine (default classification).
//   3. transport_intake_rules (Comment 5/6 — trip/service capture, not expenses).
//   4. Operational timeline endpoint at GET /cargo/manifests/:id/timeline.
//   5. Named freight events catalogue (one source of truth).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const EVENTS_LIB = read("lib/fleet/freightEvents.ts");
const CARGO_ROUTE = read("routes/cargo.ts");

describe("#1733 — named freight events catalogue", () => {
  it("FREIGHT_EVENTS defines every event the audit asks for", () => {
    expect(EVENTS_LIB).toContain("export const FREIGHT_EVENTS");
    for (const k of [
      // Operational lifecycle (15-state):
      "ManifestCreated", "ManifestStatusChanged", "DriverNotified",
      "TripStarted", "ArrivedPickup", "Loaded", "InTransit",
      "ArrivedDelivery", "Delivered", "Completed", "ManifestCancelled",
      // Booking + Dispatch:
      "BookingCreated", "DispatchCreated", "DispatchAccepted",
      "DispatchDeclined", "DispatchExecuting", "DispatchCompleted",
      // Operational guards:
      "VehicleCapacityUnknown", "VehicleCapacityException",
      "DriverEligibilityUnknown", "DriverEligibilityException",
      // Financial handoff (Comment 0 + 8):
      "ReadyForInvoice", "BillingCandidateCreated",
      "BillingCandidateMaterialized", "BillingCandidateRejected",
      "BillingBatchReady",
      // Vehicle operational (Comment 8):
      "VehicleOperationalEventRecorded",
    ]) {
      expect(EVENTS_LIB, `missing event constant ${k}`).toContain(`${k}:`);
    }
  });

  it("every event has an Arabic label in FREIGHT_EVENT_LABEL_AR", () => {
    expect(EVENTS_LIB).toContain("export const FREIGHT_EVENT_LABEL_AR");
    // Sample-check that representative Arabic labels are present.
    expect(EVENTS_LIB).toMatch(/تم إنشاء البوليصة/);
    expect(EVENTS_LIB).toMatch(/جاهزة للمحاسبة/);
    expect(EVENTS_LIB).toMatch(/تم تسليم الأثر للمحاسب/);
    expect(EVENTS_LIB).toMatch(/تم ترحيل الأثر للمحاسب/);
  });

  it("FREIGHT_EVENT_BY_ACTION reverse-lookup is present (for audit-log readers)", () => {
    expect(EVENTS_LIB).toContain("export const FREIGHT_EVENT_BY_ACTION");
  });
});

describe("#1733 Comment 0 — ReadyForInvoice event emitted at handoff", () => {
  it("cargo.ts emits FREIGHT_EVENTS.ReadyForInvoice on the handoff transition", () => {
    expect(CARGO_ROUTE).toContain("FREIGHT_EVENTS.ReadyForInvoice");
    // The emit must live in the same block that flips billingStatus to
    // ready_for_accounting (the canonical handoff site).
    const block = CARGO_ROUTE.match(
      /UPDATE cargo_manifests SET "billingStatus" = 'ready_for_accounting'[\s\S]{0,1200}?FREIGHT_EVENTS\.ReadyForInvoice/,
    )?.[0];
    expect(block, "ReadyForInvoice not emitted at handoff").toBeTruthy();
  });
});

describe("#1733 Comment 6 — operational timeline endpoint", () => {
  it("cargo.ts exposes GET /manifests/:id/timeline", () => {
    expect(CARGO_ROUTE).toMatch(/router\.get\(\s*["']\/manifests\/:id\/timeline["']/);
  });

  it("timeline endpoint merges audit_logs + event_logs + billing-candidate events", () => {
    const block = CARGO_ROUTE.match(
      /\/manifests\/:id\/timeline[\s\S]+?Get cargo timeline error:/,
    )?.[0];
    expect(block, "timeline handler missing").toBeTruthy();
    expect(block!).toContain("FROM audit_logs");
    expect(block!).toContain("FROM event_logs");
    expect(block!).toContain("transport_billing_candidates");
    expect(block!).toMatch(/ORDER BY "createdAt" ASC/);
  });
});

describe("#1733 Comment 7 — three-bucket expense reclassification", () => {
  it("migration 269 extends the three existing fleet expense tables with the classification columns", () => {
    const migPath = join(apiSrc, "migrations", "269_freight_events_timeline_expenses.sql");
    expect(existsSync(migPath), "migration 269 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");

    // Three existing tables targeted.
    for (const t of ["fleet_fuel_logs", "fleet_maintenance", "fleet_traffic_violations"]) {
      expect(sql, `migration missing ${t}`).toContain(`'${t}'`);
    }

    // Six new columns each (rechargeable is lowercase / unquoted SQL identifier).
    for (const col of [
      "accountingTreatment", "billToCustomer",
      "customerBillableAmount", "linkedExpenseId", "liabilityParty",
    ]) {
      expect(sql, `column ${col} missing`).toContain(`"${col}"`);
    }
    expect(sql).toMatch(/\brechargeable\s+boolean/);

    // Three-bucket accounting enum.
    for (const v of ["direct_expense", "capitalized_asset_improvement", "deferred_expense"]) {
      expect(sql, `accounting treatment ${v} missing`).toContain(`'${v}'`);
    }

    // Liability party enum.
    for (const v of ["company", "driver", "customer", "third_party", "insurance", "unknown"]) {
      expect(sql, `liability party ${v} missing`).toContain(`'${v}'`);
    }
  });

  it("schema dump carries the three-bucket columns on all three tables", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    for (const t of ["fleet_fuel_logs", "fleet_maintenance", "fleet_traffic_violations"]) {
      const block = pre.match(
        new RegExp(`CREATE TABLE public\\.${t}[\\s\\S]+?\\)\\s*;\\s*\\n`),
      )?.[0]!;
      expect(block, `${t} block not found`).toBeTruthy();
      expect(block, `${t} missing accountingTreatment`).toContain("accountingTreatment");
      expect(block, `${t} missing rechargeable`).toContain("rechargeable");
      expect(block, `${t} missing liabilityParty`).toContain("liabilityParty");
    }
  });
});

describe("#1733 Comment 7 — fleet_expense_rules engine", () => {
  it("migration 269 declares fleet_expense_rules with the right CHECK constraints", () => {
    const sql = readFileSync(
      join(apiSrc, "migrations", "269_freight_events_timeline_expenses.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.fleet_expense_rules");
    expect(sql).toContain("fleet_expense_rules_source_check");
    expect(sql).toContain("fleet_expense_rules_acct_check");
    // Three source types.
    for (const v of ["fuel_log", "maintenance", "traffic_violation"]) {
      expect(sql, `source ${v} missing`).toContain(`'${v}'`);
    }
  });

  it("schema dump carries fleet_expense_rules table + lookup index", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    expect(pre).toContain("CREATE TABLE public.fleet_expense_rules");
    expect(post).toContain("fleet_expense_rules_pkey");
    expect(post).toContain("idx_expense_rules_lookup");
  });
});

describe("#1733 Comment 5/6 — transport_intake_rules", () => {
  it("migration 269 declares transport_intake_rules for TRIP/SERVICE capture (not expenses)", () => {
    const sql = readFileSync(
      join(apiSrc, "migrations", "269_freight_events_timeline_expenses.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.transport_intake_rules");
    // Three operation types from Comment 5 + 6 (after the reversal).
    for (const v of ["booking", "dispatch", "service_line"]) {
      expect(sql, `operation type ${v} missing`).toContain(`'${v}'`);
    }
    // Six service types matching the existing #1733 alphabet.
    for (const v of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(sql, `service type ${v} missing`).toContain(`'${v}'`);
    }
    // Defaults that the operator's intake form reads.
    for (const col of [
      "requiredVehicleType", "requiredLicenseClass", "defaultCostCenterId",
      "requiresAttachment", "requiresApproval",
      "createsBookingDraft", "createsBillingCandidate",
    ]) {
      expect(sql, `column ${col} missing`).toContain(`"${col}"`);
    }
  });

  it("schema dump carries transport_intake_rules table + lookup index", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    expect(pre).toContain("CREATE TABLE public.transport_intake_rules");
    expect(post).toContain("transport_intake_rules_pkey");
    expect(post).toContain("idx_intake_rules_lookup");
  });
});
