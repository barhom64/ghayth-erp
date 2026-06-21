/**
 * #2140 slice 1 — umrah refund-requests UI smoke.
 *
 * The backend refund cycle (request → approve/reject → pay → close,
 * umrahRefundWorkflow.ts) shipped with NO page — classified "خدمة
 * ناقصة" in docs/UNUSED_API_CLASSIFICATION_2026-06-11.md. This pins
 * the first UI over it: every endpoint wired, workflow mirror in sync
 * with the backend state machine, and the page reachable from both
 * the umrah tabs nav and the sidebar registry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PAGE = read("artifacts/ghayth-erp/src/pages/umrah/refund-requests.tsx");
const STATUS_LIB = read("artifacts/ghayth-erp/src/lib/umrah-refund-status.ts");
const ROUTES = read("artifacts/ghayth-erp/src/routes/umrahRoutes.tsx");
const TABS = read("artifacts/ghayth-erp/src/components/layout/navigation.registry.ts");
const SIDEBAR = read("artifacts/ghayth-erp/src/components/layout/navigation.registry.ts");
const BACKEND_WF = read("artifacts/api-server/src/lib/umrahRefundWorkflow.ts");

describe("refund-requests page — all six endpoints wired", () => {
  it("lists via GET /umrah/refund-requests", () => {
    expect(PAGE).toContain('"/umrah/refund-requests"');
    expect(PAGE).toContain('useApiQuery<{ data: RefundRow[] }>(["umrah-refund-requests"]');
  });
  it("creates via POST /umrah/refund-requests with the pilgrim-or-agent contract", () => {
    expect(PAGE).toMatch(/useApiMutation<unknown, \{\s*pilgrimId\?: number; agentId\?: number; grossAmount: number;/);
    expect(PAGE).toContain('"أدخل رقم المعتمر أو رقم الوكيل"');
  });
  it("drives all four workflow transitions", () => {
    for (const action of ["approve", "reject", "pay", "close"]) {
      expect(PAGE).toContain(`/umrah/refund-requests/\${b.id}/${action}`);
    }
  });
  it("reject requires rejectionReason; pay requires amount + treasury + reference", () => {
    expect(PAGE).toContain("rejectionReason: string");
    expect(PAGE).toContain('"سبب الرفض مطلوب"');
    expect(PAGE).toMatch(/settledAmount: number; treasuryId: number; paymentReference: string;/);
    expect(PAGE).toContain('"مرجع الدفع مطلوب"');
  });
  it("treasuries come from posting asset accounts (same source as the import wizard)", () => {
    expect(PAGE).toContain('"/finance/accounts?type=asset&postingOnly=true"');
  });
});

describe("frontend workflow mirror agrees with the backend state machine", () => {
  it("UMRAH_REFUND_NEXT matches REFUND_TRANSITIONS state for state", () => {
    // Parse both transition tables and compare — a backend workflow
    // change must be reflected in the UI mirror (buttons per row).
    const grab = (src: string, name: string) => {
      const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
      expect(m, `${name} table not found`).toBeTruthy();
      const table: Record<string, string[]> = {};
      for (const line of m![1].split("\n")) {
        const lm = line.match(/^\s*(\w+):\s*\[([^\]]*)\]/);
        if (lm) table[lm[1]] = lm[2].split(",").map((s) => s.replace(/["'\s]/g, "")).filter(Boolean);
      }
      return table;
    };
    const fe = grab(STATUS_LIB, "UMRAH_REFUND_NEXT");
    const be = grab(BACKEND_WF, "REFUND_TRANSITIONS");
    expect(Object.keys(fe).sort()).toEqual(Object.keys(be).sort());
    for (const k of Object.keys(be)) {
      expect(fe[k].sort(), `transition mismatch for "${k}"`).toEqual(be[k].sort());
    }
  });
  it("every backend status has an Arabic label", () => {
    for (const s of ["requested", "approved", "rejected", "paid", "closed", "cancelled"]) {
      expect(STATUS_LIB).toMatch(new RegExp(`value: "${s}",\\s*label: "[\\u0600-\\u06FF]`));
    }
  });
});

describe("navigation — reachable, no orphan", () => {
  it("route mounted under the operations module", () => {
    expect(ROUTES).toContain('{ path: "/umrah/refund-requests", component: UmrahRefundRequests, module: "operations" }');
  });
  it("umrah tabs nav carries the tab next to الغرامات", () => {
    expect(TABS).toContain('path: "/umrah/refund-requests"');
    expect(TABS).toContain('label: "طلبات الاسترداد"');
  });
  it("sidebar registry carries the entry", () => {
    expect(SIDEBAR).toContain('path: "/umrah/refund-requests"');
  });
});
