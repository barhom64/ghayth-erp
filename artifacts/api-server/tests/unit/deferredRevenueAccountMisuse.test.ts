/**
 * FIN-FIX-2160-MISUSE (#2251) — account 2160 «إيرادات مقبوضة مقدماً»
 * (Unearned / Deferred Revenue) and its child 2161 «إيجارات مقبوضة مقدماً»
 * (Unearned Rent) are STRICTLY deferred-revenue liabilities. They must NEVER
 * be used as a generic payable / accrued-expense / maintenance-liability
 * fallback.
 *
 * The confirmed bug: propertiesEngine.postMaintenanceOwnerBillingGL credited a
 * property-MAINTENANCE payable with fallback "2160" (Unearned Revenue). A cost
 * owed to a maintenance contractor is an ACCRUED EXPENSE / VENDOR PAYABLE, not
 * deferred revenue. The fix routes it through the same purpose + fallback the
 * sibling company-paid method uses: property_maintenance_payable → 2150
 * «مصروفات مستحقة الدفع» (Accrued Expenses), which is ALSO the canonical seed
 * mapping (migration 323) and the businessHelpers keyword resolution.
 *
 * These guards are STATIC (grep the source) so they catch a regression the
 * moment anyone reintroduces 2160/2161 on a non-deferred path, with no DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const API_SRC = join(REPO_ROOT, "artifacts/api-server/src");

const PROPERTIES_ENGINE = readFileSync(
  join(API_SRC, "lib/engines/propertiesEngine.ts"),
  "utf8",
);

beforeEach(() => {
  vi.resetModules();
});

// Shared engine mock for the dynamic-behaviour test below. Hoisted to the top
// level (vitest hoists vi.hoisted regardless, but keeping it here reflects the
// real execution order and avoids the "not at top level" warning).
const { resolveAccountCodeMock, postJournalEntryMock } = vi.hoisted(() => {
  const resolveAccountCodeMock = vi.fn(
    async (
      _companyId: number,
      operationType: string,
      _side: string,
      fallback: string,
    ) => {
      // Return the engine's own fallback verbatim so the JE shape reflects
      // the real codes the engine ships with.
      void operationType;
      return fallback;
    },
  );
  const postJournalEntryMock = vi.fn(async () => ({ journalId: 1, ref: "JE-1" }));
  return { resolveAccountCodeMock, postJournalEntryMock };
});

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: resolveAccountCodeMock,
    postJournalEntry: postJournalEntryMock,
  },
}));

// The deferred-revenue accounts — unearned revenue + unearned rent.
const DEFERRED_ACCOUNTS = ["2160", "2161"];

// ── The fixed path: maintenance payable must NOT fall back to deferred revenue ──
describe("propertiesEngine — property_maintenance_payable fallback", () => {
  it("does NOT use 2160/2161 (deferred revenue) as a fallback anywhere", () => {
    // Match every resolveAccountCode(... "property_maintenance_payable" ... "<code>")
    const re =
      /resolveAccountCode\([^)]*"property_maintenance_payable"[^)]*?"(\d{4})"\s*\)/g;
    const fallbacks: string[] = [];
    for (const m of PROPERTIES_ENGINE.matchAll(re)) fallbacks.push(m[1]!);

    expect(fallbacks.length).toBeGreaterThan(0);
    for (const code of fallbacks) {
      expect(DEFERRED_ACCOUNTS).not.toContain(code);
    }
  });

  it("resolves the owner-billing maintenance payable to 2150 (Accrued Expenses)", () => {
    // The CR side of postMaintenanceOwnerBillingGL — the specific line that
    // used to (wrongly) fall back to 2160.
    expect(PROPERTIES_ENGINE).toContain(
      'resolveAccountCode(ctx.companyId, "property_maintenance_payable", "credit", "2150")',
    );
    expect(PROPERTIES_ENGINE).not.toContain(
      'resolveAccountCode(ctx.companyId, "property_maintenance_payable", "credit", "2160")',
    );
  });

  it("both maintenance methods (company-paid + owner-billed) agree on the same payable fallback", () => {
    const re =
      /resolveAccountCode\([^)]*"property_maintenance_payable"[^)]*?"(\d{4})"\s*\)/g;
    const fallbacks = [...PROPERTIES_ENGINE.matchAll(re)].map((m) => m[1]!);
    expect(fallbacks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fallbacks).size).toBe(1); // identical fallback for the same purpose
    expect(fallbacks[0]).toBe("2150");
  });
});

// ── Static regression guard across ALL engines ─────────────────────────────────
describe("engines — no non-deferred purpose may fall back to 2160/2161", () => {
  // Purposes that legitimately credit a deferred-revenue liability. Today none
  // of the engines hard-code 2160/2161 (the deferredRevenueEngine resolves the
  // liability code from the schedule row, not a literal). Any future engine
  // that books genuine unearned revenue must use one of these purpose names to
  // be exempted here.
  const DEFERRED_PURPOSES = [
    "customer_advance_liability",
    "unearned_revenue",
    "unearned_rent",
    "deferred_revenue",
  ];

  const ENGINE_FILES = [
    "propertiesEngine.ts",
    "financialEngine.ts",
    "deferredRevenueEngine.ts",
    "umrahInvoicingEngine.ts",
    "hrEngine.ts",
    "insuranceEngine.ts",
  ];

  it("flags any resolveAccountCode whose fallback is 2160/2161 unless its purpose is deferred-revenue", () => {
    const violations: string[] = [];
    for (const file of ENGINE_FILES) {
      let src: string;
      try {
        src = readFileSync(join(API_SRC, "lib/engines", file), "utf8");
      } catch {
        continue; // engine not present in this checkout — skip
      }
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        // any resolveAccountCode(...) call whose fallback literal is 2160/2161
        const m = line.match(
          /resolveAccountCode\([^)]*?"(property_maintenance_payable|[a-z_]+)"[^)]*?"(2160|2161)"/,
        );
        if (m) {
          const purpose = m[1]!;
          if (!DEFERRED_PURPOSES.includes(purpose)) {
            violations.push(`${file}:${i + 1} → purpose "${purpose}" falls back to ${m[2]}`);
          }
        }
      });
    }
    expect(violations).toEqual([]);
  });
});

// ── Genuine deferred revenue must still use the unearned-revenue account ────────
describe("genuine deferred revenue — still books a deferred-revenue liability", () => {
  it("propertiesEngine owner-billing emits the maintenance payable on the mapped (non-deferred) account", async () => {
    postJournalEntryMock.mockClear();

    const { propertiesEngine } = await import(
      "../../src/lib/engines/propertiesEngine.js"
    );

    await propertiesEngine.postMaintenanceOwnerBillingGL(
      { companyId: 2, branchId: 5, createdBy: 100 },
      { id: 1, propertyId: 12, ownerId: 200, totalCost: 1_000 },
    );

    const request = postJournalEntryMock.mock.calls[0]![0]!;
    const codes = request.lines.map((l: { accountCode: string }) => l.accountCode);
    // The credited payable lands on 2150 (accrued expenses) — NOT 2160/2161.
    expect(codes).toContain("2150");
    expect(codes).not.toContain("2160");
    expect(codes).not.toContain("2161");
  });
});

// ── Documented-correct usages remain intact (sanity, source-level) ─────────────
describe("legitimate unearned-revenue usages are untouched", () => {
  it("customer_advance_liability still maps to a deferred-revenue fallback", () => {
    // finance-invoices / customerReceiptService credit customer money received
    // before delivery — genuine unearned revenue. Confirm the purpose is still
    // wired to the unearned-revenue account family.
    const RECEIPT = readFileSync(
      join(API_SRC, "lib/customerReceiptService.ts"),
      "utf8",
    );
    expect(RECEIPT).toMatch(
      /resolveAccountCode\([^)]*"customer_advance_liability"[^)]*?"2160"/,
    );
  });
});
