import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Blocker #1 — transport MUST NOT post journal entries directly. The
// delivery transition hands off a candidate row; the accountant materialises
// it from /finance/transport-billing-candidates/:id/materialize.
//
// These tests lock in the contract so a future refactor that "helpfully"
// re-wires postCargoDeliveryGL into the cargo/fleet routes breaks here
// instead of silently reintroducing the architecture violation.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const FLEET_ENGINE = read("lib/engines/fleetEngine.ts");
const CARGO_ROUTE = read("routes/cargo.ts");
const FLEET_ROUTE = read("routes/fleet.ts");
const ROUTES_INDEX = read("routes/index.ts");
const FEATURE_CATALOG = read("lib/rbac/featureCatalog.ts");
const HANDOFF_ROUTE = read("routes/transport-billing-candidates.ts");

describe("#1733 — transport→finance handoff: engine", () => {
  it("fleetEngine exposes createCargoBillingCandidate", () => {
    expect(FLEET_ENGINE).toMatch(/async createCargoBillingCandidate\(/);
  });

  it("billing candidates insert into transport_billing_candidates, not journal_entries (cargo delegates to the shared writer)", () => {
    // The six creators now delegate to ONE createBillingCandidate writer (was
    // six copy-pasted INSERT blocks). Cargo maps + delegates; the writer owns
    // the INSERT — neither posts a journal entry on the transport path.
    const cargo = FLEET_ENGINE.match(/async createCargoBillingCandidate\([\s\S]*?\n\s\s\}\n/)?.[0];
    expect(cargo).toBeTruthy();
    expect(cargo!).toContain("this.createBillingCandidate(");
    expect(cargo!).not.toMatch(/postJournalEntry/);
    const writer = FLEET_ENGINE.match(/async createBillingCandidate\([\s\S]*?\n\s\s\}\n/)?.[0];
    expect(writer).toBeTruthy();
    expect(writer!).toContain("transport_billing_candidates");
    expect(writer!).not.toMatch(/postJournalEntry|journal_entries/);
  });

  it("the shared createBillingCandidate writer uses ON CONFLICT for idempotency", () => {
    const writer = FLEET_ENGINE.match(/async createBillingCandidate\([\s\S]*?\n\s\s\}\n/)?.[0]!;
    expect(writer).toMatch(/ON CONFLICT[^)]*sourceType[^)]*sourceId/i);
  });

  it("postCargoDeliveryGL remains for accountant-side materialisation", () => {
    // Method still exists — the accountant route calls it after locking
    // the candidate row. Removing it would break the materialise leg.
    expect(FLEET_ENGINE).toMatch(/async postCargoDeliveryGL\(/);
  });
});

describe("#1733 — transport routes NEVER call postCargoDeliveryGL", () => {
  it("cargo.ts on `ready_for_invoice` calls createCargoBillingCandidate, never postCargoDeliveryGL", () => {
    // #1733 Foundation moved the handoff off `delivered` (driver tap)
    // onto `ready_for_invoice` (dispatcher gate) — until that flip
    // fires, no candidate is created and no JE can be posted.
    const handoffBlock = CARGO_ROUTE.match(
      /b\.status === "ready_for_invoice"[\s\S]{0,2400}?\n\s+\}/,
    )?.[0];
    expect(handoffBlock, "could not locate ready_for_invoice-transition block").toBeTruthy();
    expect(handoffBlock!).toContain("createCargoBillingCandidate");
    expect(handoffBlock!).not.toContain("postCargoDeliveryGL");
    // The OLD delivered-guarded handoff must be GONE — driver tap no
    // longer triggers anything financial.
    expect(CARGO_ROUTE).not.toMatch(
      /if \(b\.status === "delivered"[\s\S]{0,400}?createCargoBillingCandidate/,
    );
  });

  it("fleet.ts driver /me/cargo/:id/advance does NOT call createCargoBillingCandidate", () => {
    // After #1733 Foundation the driver-self advance route is purely
    // operational — no finance artefact gets created from the driver's
    // hands. Only the dispatcher's ready_for_invoice flip does.
    const driverAdvance = FLEET_ROUTE.match(
      /\/me\/cargo\/:id\/advance[\s\S]{0,6000}?Driver cargo-advance error:/,
    )?.[0];
    expect(driverAdvance, "could not locate /me/cargo/:id/advance").toBeTruthy();
    expect(driverAdvance!).not.toContain("createCargoBillingCandidate");
    expect(driverAdvance!).not.toContain("postCargoDeliveryGL");
  });
});

describe("#1733 — accountant-facing route + RBAC", () => {
  it("transport-billing-candidates router defines list / detail / materialise / reject", () => {
    expect(HANDOFF_ROUTE).toMatch(/\.get\(\s*["']\/transport-billing-candidates["']/);
    expect(HANDOFF_ROUTE).toMatch(/\.get\(\s*["']\/transport-billing-candidates\/:id["']/);
    expect(HANDOFF_ROUTE).toMatch(/\.post\(\s*["']\/transport-billing-candidates\/:id\/materialize["']/);
    expect(HANDOFF_ROUTE).toMatch(/\.post\(\s*["']\/transport-billing-candidates\/:id\/reject["']/);
  });

  it("materialise endpoint locks the row FOR UPDATE before posting GL", () => {
    // The transaction must SELECT … FOR UPDATE before calling
    // fleetEngine.postCargoDeliveryGL so a concurrent double-click can't
    // post two journals against the same candidate.
    const mi = HANDOFF_ROUTE.indexOf('/materialize"');
    const materialiseBlock = HANDOFF_ROUTE.slice(mi, mi + 7000);
    expect(materialiseBlock).toContain("FOR UPDATE");
    expect(materialiseBlock).toContain("fleetEngine.postCargoDeliveryGL");
    // FOR UPDATE must precede the GL post (now a per-source-type branch:
    // maintenance / fuel / insurance expense + cargo billing).
    expect(materialiseBlock.indexOf("FOR UPDATE"))
      .toBeLessThan(materialiseBlock.indexOf("fleetEngine.postCargoDeliveryGL"));
    // Must reject a row that's not pending — covers re-materialise and
    // re-reject paths.
    expect(materialiseBlock).toMatch(/status !== ['"]pending['"]/);
  });

  it("router is mounted under /finance with module + financial guards", () => {
    expect(ROUTES_INDEX).toContain("transportBillingCandidatesRouter");
    expect(ROUTES_INDEX).toMatch(
      /router\.use\("\/finance",\s*requireModule\("finance"\),\s*requireGuards\("financial"\),\s*transportBillingCandidatesRouter\)/,
    );
  });

  it("feature catalog defines finance.transport_billing with approve + reject actions", () => {
    expect(FEATURE_CATALOG).toContain("finance.transport_billing");
    const block = FEATURE_CATALOG.match(
      /finance\.transport_billing[\s\S]{0,500}displayOrder/,
    )?.[0];
    expect(block).toBeTruthy();
    expect(block!).toMatch(/approve/);
    expect(block!).toMatch(/reject/);
  });
});

describe("#1733 — migration + schema dump", () => {
  it("migration 261 exists and declares transport_billing_candidates", () => {
    const migPath = join(
      apiSrc,
      "migrations",
      "261_transport_billing_candidates.sql",
    );
    expect(existsSync(migPath), "migration 261 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.transport_billing_candidates/);
    expect(sql).toMatch(/uq_billing_candidate_source/);
  });

  it("schema dump (schema_pre + schema_post) carries the table for CI test DB", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    expect(pre).toContain("CREATE TABLE public.transport_billing_candidates");
    expect(post).toContain("transport_billing_candidates_pkey");
    expect(post).toContain("uq_billing_candidate_source");
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioural test — mocks rawQuery so createCargoBillingCandidate is
// exercised end-to-end without a DB. Locks in:
//   1. Zero-revenue + zero-cost manifest returns null (no handoff needed).
//   2. The INSERT SQL contains exactly the #1733 field set.
//   3. The function maps the row-existed marker to { created: false }.
// ────────────────────────────────────────────────────────────────────

vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(),
  rawExecute: vi.fn(),
}));
vi.mock("../../src/lib/eventBus.js", () => ({
  eventBus: { emit: vi.fn() },
}));
vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(),
    postJournalEntry: vi.fn(),
  },
}));

describe("#1733 — createCargoBillingCandidate behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null for a zero-revenue + zero-cost manifest (no handoff needed)", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    const { fleetEngine } = await import("../../src/lib/engines/fleetEngine.js");
    rawQuery.mockReset();

    const result = await fleetEngine.createCargoBillingCandidate(
      { companyId: 1, branchId: 1, createdBy: 7 },
      { id: 100, manifestNumber: "BL-100", freightRevenue: 0, freightCost: 0 },
    );

    expect(result).toBeNull();
    expect(rawQuery).not.toHaveBeenCalled();
  });

  it("inserts a candidate carrying every #1733 field; reports created=true on first call", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    const { fleetEngine } = await import("../../src/lib/engines/fleetEngine.js");
    rawQuery.mockReset();
    rawQuery.mockResolvedValueOnce([{ id: 42, existed: false }]);

    const result = await fleetEngine.createCargoBillingCandidate(
      { companyId: 1, branchId: 2, createdBy: 7 },
      {
        id: 100,
        manifestNumber: "BL-100",
        freightRevenue: 500,
        freightCost: 200,
        customerId: 9,
        vehicleId: 3,
        driverId: 4,
        fromLocation: "الرياض",
        toLocation: "جدة",
        totalWeight: 1500,
        deliveryDate: "2026-06-07",
        notes: "بدون ملاحظات",
      },
    );

    expect(result).toEqual({ id: 42, created: true });
    expect(rawQuery).toHaveBeenCalledOnce();
    const [sql] = rawQuery.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO transport_billing_candidates/);
    // Must NOT touch finance tables on the transport path.
    expect(sql).not.toMatch(/journal_entries|invoices/i);
    // Idempotency guard.
    expect(sql).toMatch(/ON CONFLICT[^)]*"sourceType"[^)]*"sourceId"/i);
  });

  it("reports created=false when the row already existed (idempotent re-run)", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    const { fleetEngine } = await import("../../src/lib/engines/fleetEngine.js");
    rawQuery.mockReset();
    rawQuery.mockResolvedValueOnce([{ id: 42, existed: true }]);

    const result = await fleetEngine.createCargoBillingCandidate(
      { companyId: 1, branchId: 2, createdBy: 7 },
      { id: 100, manifestNumber: "BL-100", freightRevenue: 500, freightCost: 0 },
    );

    expect(result).toEqual({ id: 42, created: false });
  });
});

// البند ٤ شريحة ٢ — costBearer لصيانة المركبة يصل من واجهة المحاسب حتى توجيه القيد.
describe("البند ٤ — costBearer للصيانة عبر المادْيَلة (خلفية + واجهة)", () => {
  const INTAKE_FE = readFileSync(
    join(apiSrc, "../../ghayth-erp/src/pages/finance/finance-intake-center.tsx"), "utf8");

  it("materialize schema accepts costBearer (نفس enum تقييم الحادث canonical)", () => {
    expect(HANDOFF_ROUTE).toMatch(/costBearer: z\.enum\(\["company", "driver", "insurance", "warranty", "customer", "tenant", "third_party"\]\)\.optional\(\)/);
  });

  it("فرع الصيانة يمرّر costBearer إلى postMaintenanceGL", () => {
    const mi = HANDOFF_ROUTE.indexOf('sourceType === "maintenance"');
    expect(mi).toBeGreaterThan(0);
    expect(HANDOFF_ROUTE.slice(mi, mi + 320)).toMatch(/costBearer: overrides\.costBearer/);
  });

  it("واجهة مركز التلقّي تُظهر منتقي «مَن يتحمّل» للصيانة وترسله فقط لها", () => {
    expect(INTAKE_FE).toMatch(/مَن يتحمّل التكلفة/);
    // المنتقي مشروط بكون الترشيح صيانة.
    expect(INTAKE_FE).toMatch(/dialog\.row\.sourceType === "maintenance" && \(/);
    // يُرسَل costBearer فقط لترشيح الصيانة (الخلفية تتجاهله لغيره).
    expect(INTAKE_FE).toMatch(/sourceType === "maintenance" \? \{ costBearer \} : \{\}/);
  });
});

// البند ٤ ج-٥ — التقاط costBearer تشغيليًّا عند إكمال الصيانة (يصل المحاسب كافتراض).
describe("البند ٤ ج-٥ — costBearer مُلتقَط على الترشيح (تشغيلي → افتراض المحاسب)", () => {
  const INTAKE_FE = readFileSync(
    join(apiSrc, "../../ghayth-erp/src/pages/finance/finance-intake-center.tsx"), "utf8");
  const MAINT_DETAIL_FE = readFileSync(
    join(apiSrc, "../../ghayth-erp/src/pages/details/maintenance-detail.tsx"), "utf8");
  const MIG = readFileSync(join(apiSrc, "migrations/428_maintenance_candidate_cost_bearer.sql"), "utf8");

  it("هجرة 428 تضيف عمود costBearer (additive، nullable، @rollback)", () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "costBearer" TEXT/);
    expect(MIG).toMatch(/@rollback/);
    expect(MIG).toMatch(/DROP COLUMN IF EXISTS "costBearer"/);
  });

  it("completeMaintenanceSchema يقبل costBearer ويُمرَّر للترشيح", () => {
    const i = FLEET_ROUTE.indexOf("completeMaintenanceSchema = z.object(");
    expect(FLEET_ROUTE.slice(i, i + 260)).toMatch(/costBearer: z\.enum\(/);
    expect(FLEET_ROUTE).toMatch(/createMaintenanceExpenseCandidate\([\s\S]{0,400}costBearer: b\.costBearer/);
  });

  it("الكاتب المشترك يُدرج costBearer في transport_billing_candidates", () => {
    expect(FLEET_ENGINE).toMatch(/notes, "createdBy", "costBearer"/);
    expect(FLEET_ENGINE).toMatch(/c\.costBearer \?\? null/);
  });

  it("المادْيَلة: تجاوز المحاسب أولًا ثم قيمة الترشيح ثم الافتراض", () => {
    expect(HANDOFF_ROUTE).toMatch(/"suggestedRevenue", "suggestedCost", "costBearer", status/);
    expect(HANDOFF_ROUTE).toMatch(/costBearer: overrides\.costBearer \?\? candidate\.costBearer \?\? undefined/);
  });

  it("واجهة المحاسب تُهيّئ المنتقي على اختيار المُكمِل (row.costBearer)", () => {
    expect(INTAKE_FE).toMatch(/setCostBearer\(row\.costBearer \?\? "company"\)/);
  });

  it("شاشة تفاصيل الصيانة: المُكمِل يختار مَن يتحمّل ويُرسَل في جسم الإكمال", () => {
    expect(MAINT_DETAIL_FE).toMatch(/data-testid="maint-complete-cost-bearer"/);
    expect(MAINT_DETAIL_FE).toMatch(/costBearer: completeCostBearer/);
  });
});

// البند ٤ ج-٦ — رمز costBearer «warranty» صريح، مستردّ مثل التأمين في كل المواضع.
describe("البند ٤ ج-٦ — costBearer «warranty» (مستردّ، مُعمَّم)", () => {
  it("محرّك الأسطول: warranty في قائمة المستردّ (صيانة + حادث)", () => {
    const hits = FLEET_ENGINE.match(/\["insurance", "warranty", "customer", "tenant", "third_party"\]/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2); // postMaintenanceGL + postAccidentGL
  });
  it("enums الصيانة/الحادث/المادْيَلة تقبل warranty", () => {
    expect(FLEET_ROUTE).toMatch(/z\.enum\(\["company", "driver", "insurance", "warranty", "customer", "tenant", "third_party"\]\)/);
    expect(HANDOFF_ROUTE).toMatch(/"insurance", "warranty", "customer", "tenant", "third_party"/);
  });
  it("واجهتا الصيانة (مركز التلقّي + تفاصيل الصيانة) تعرضان خيار الضمان", () => {
    const INTAKE = readFileSync(join(apiSrc, "../../ghayth-erp/src/pages/finance/finance-intake-center.tsx"), "utf8");
    const DETAIL = readFileSync(join(apiSrc, "../../ghayth-erp/src/pages/details/maintenance-detail.tsx"), "utf8");
    expect(INTAKE).toMatch(/value="warranty"/);
    expect(DETAIL).toMatch(/value="warranty"/);
  });
});
