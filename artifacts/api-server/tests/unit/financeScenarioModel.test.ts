import { describe, it, expect } from "vitest";
import {
  FINANCE_SCENARIOS,
  DOMAIN_LABELS,
  scenariosForDomain,
  resolveScenario,
  TARGET_HINTS,
  resolveTargetHint,
  type FinanceDomain,
  type FinanceScenario,
  type FinanceTarget,
} from "../../../ghayth-erp/src/lib/finance/scenario-model.ts";
import {
  deriveSpecializedAccount,
  deriveOperationalEffectHint,
} from "../../src/lib/financeSpecializedAccount.js";

// #1715 / #1945 — acceptance tests for THE central finance scenario model.
//
// These encode the owner's non-negotiable rules for the progressive,
// scenario-driven finance forms: no field appears before it has meaning, the
// renderer shows ONLY the chosen scenario's fields, and the FE registry stays
// in lock-step with the backend's GL-account derivation (so a scenario is
// declared once and every layer agrees — the whole point of the model).

const ALL = Object.values(FINANCE_SCENARIOS);

describe("finance scenario model — registry integrity", () => {
  it("keys every scenario by its own id", () => {
    for (const [key, scenario] of Object.entries(FINANCE_SCENARIOS)) {
      expect(scenario.id).toBe(key);
    }
  });

  it("gives every scenario a label, an account purpose and at least one field", () => {
    for (const s of ALL) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.accountPurpose.trim().length).toBeGreaterThan(0);
      expect(s.fields.length).toBeGreaterThan(0);
    }
  });

  it("gives every field a key, a label and a control kind (no meaningless fields)", () => {
    for (const s of ALL) {
      for (const f of s.fields) {
        expect(f.key.trim().length).toBeGreaterThan(0);
        expect(f.label.trim().length).toBeGreaterThan(0);
        expect(f.kind.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("never repeats a field key within a scenario", () => {
    for (const s of ALL) {
      const keys = s.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("labels every domain it uses", () => {
    for (const s of ALL) {
      expect(DOMAIN_LABELS[s.domain]).toBeTruthy();
    }
  });
});

describe("finance scenario model — progressive selection", () => {
  it("shows ONLY the chosen domain's scenarios (vehicle → vehicle-only)", () => {
    const vehicle = scenariosForDomain("vehicle");
    expect(vehicle.length).toBeGreaterThan(0);
    expect(vehicle.every((s) => s.domain === "vehicle")).toBe(true);
    // and nothing from another domain leaks in
    expect(vehicle.some((s) => s.id === "property_maintenance")).toBe(false);
  });

  it("partitions scenarios across domains with no cross-leakage", () => {
    const domains = new Set<FinanceDomain>(ALL.map((s) => s.domain));
    for (const d of domains) {
      const list = scenariosForDomain(d);
      expect(list.every((s) => s.domain === d)).toBe(true);
    }
  });

  it("resolves a known scenario and returns null for an unknown one", () => {
    expect(resolveScenario("vehicle_fuel")?.id).toBe("vehicle_fuel");
    expect(resolveScenario("does_not_exist")).toBeNull();
  });
});

describe("finance scenario model — capitalisation discipline", () => {
  it("only capitalises inventory / fixed-asset scenarios (never a P&L expense)", () => {
    for (const s of ALL) {
      if (s.capitalize) {
        expect(["inventory", "fixed_asset", "vehicle"]).toContain(s.domain);
        expect(["inventory_receipt", "fixed_asset_purchase"]).toContain(s.accountPurpose);
      }
    }
  });
});

// The drift-closing test: the FE registry's accountPurpose for each scenario
// must equal the purpose the BACKEND derives for the same operation. If anyone
// changes one side without the other, this fails — which is exactly the
// "piecemeal patching" the owner forbade.
describe("finance scenario model — FE purpose ⇄ backend derivation", () => {
  const cases: { scenario: string; backend: { targetType?: string; itemType?: string } }[] = [
    { scenario: "vehicle_fuel", backend: { itemType: "fuel" } },
    { scenario: "vehicle_maintenance", backend: { targetType: "vehicle_maintenance" } },
    { scenario: "vehicle_tires", backend: { targetType: "vehicle_maintenance" } },
    { scenario: "vehicle_purchase", backend: { targetType: "fixed_asset", itemType: "asset" } },
    { scenario: "property_maintenance", backend: { targetType: "property_maintenance" } },
    { scenario: "umrah_cost", backend: { targetType: "umrah_season" } },
    { scenario: "project_cost", backend: { targetType: "project" } },
    { scenario: "inventory_purchase", backend: { itemType: "inventory" } },
    { scenario: "asset_purchase", backend: { targetType: "fixed_asset" } },
    { scenario: "document_renewal", backend: { targetType: "none" } },
    { scenario: "general_expense", backend: { targetType: "none" } },
  ];

  it("covers every registered scenario", () => {
    expect(new Set(cases.map((c) => c.scenario))).toEqual(
      new Set(ALL.map((s) => s.id)),
    );
  });

  for (const c of cases) {
    it(`${c.scenario}: FE purpose == backend purpose`, () => {
      const fe = FINANCE_SCENARIOS[c.scenario] as FinanceScenario;
      const be = deriveSpecializedAccount(c.backend);
      expect(fe.accountPurpose).toBe(be.purpose);
      // capitalisation must agree too (balance-sheet vs P&L)
      expect(Boolean(fe.capitalize)).toBe(be.capitalize);
    });
  }
});

// The «ربط العملية بـ» panel renders its expected-account / effect / future-task
// from TARGET_HINTS. This locks that source to the backend so the operator's
// preview is exactly what posts — the renderer is genuinely model-driven, not a
// hand-maintained copy.
describe("finance scenario model — target hints ⇄ backend", () => {
  const TARGETS = Object.keys(TARGET_HINTS) as FinanceTarget[];

  it("resolves a known target and returns null for an unknown one", () => {
    expect(resolveTargetHint("vehicle_maintenance")?.accountPurpose).toBe("vehicle_maintenance_expense");
    expect(resolveTargetHint("not_a_target")).toBeNull();
  });

  for (const t of TARGETS) {
    it(`${t}: hint account purpose + capitalisation == backend derivation`, () => {
      const be = deriveSpecializedAccount({ targetType: t });
      expect(TARGET_HINTS[t].accountPurpose).toBe(be.purpose);
      expect(TARGET_HINTS[t].capitalize).toBe(be.capitalize);
    });
  }

  // Where the backend schedules a future task (maintenance reminder / asset
  // depreciation), the panel must surface one too — no silent operational gap.
  for (const t of TARGETS) {
    it(`${t}: future-task presence matches backend hint`, () => {
      const spec = deriveSpecializedAccount({ targetType: t });
      const beHint = deriveOperationalEffectHint({ targetType: t, spec });
      if (beHint.futureTask) {
        expect(TARGET_HINTS[t].futureTask).toBeTruthy();
      }
    });
  }

  it("gives every target that produces a real side-effect an effect string", () => {
    for (const t of ["vehicle_maintenance", "property_maintenance", "fixed_asset"] as FinanceTarget[]) {
      expect(TARGET_HINTS[t].effect).toBeTruthy();
    }
  });
});
