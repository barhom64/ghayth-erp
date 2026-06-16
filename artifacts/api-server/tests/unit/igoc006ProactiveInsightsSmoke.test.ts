/**
 * IGOC-006 — Role-adaptive proactive insights smoke.
 *
 * The IGOC governing principle says the system surface must adapt to
 * the ACTIVE context (role + company + branch + scope) — not to the
 * user identity. /me/proactive-insights is the unified entry point that
 * makes that adaptation visible: same endpoint, same envelope, but a
 * different CONTENT slice depending on the active role.
 *
 * This smoke pins the structure so future PRs can't:
 *  1. Drop or rename categories silently.
 *  2. Remove the role gate that prevents an employee from seeing
 *     manager-only signals (team approvals, company iqama, unposted
 *     journals, overdue invoices, due obligations).
 *  3. Strip the active-context envelope from the response.
 *  4. Switch off the `authorize({ feature: "my_space", action: "view" })`
 *     authorization (which the authzEngine wires into audit_logs +
 *     resolvedScope under IGOC-001).
 *
 * The tests read the route source file directly — no DB, no live
 * Express — so they run in <100ms and never flake under guard.sh.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/meInsights.ts"),
  "utf8",
);
const INDEX_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"),
  "utf8",
);

describe("IGOC-006 — endpoint registration", () => {
  it("router is mounted at /me", () => {
    expect(INDEX_SRC).toMatch(/import meInsightsRouter from "\.\/meInsights\.js"/);
    expect(INDEX_SRC).toMatch(/router\.use\("\/me", meInsightsRouter\)/);
  });

  it("exposes GET /proactive-insights", () => {
    expect(ROUTE_SRC).toMatch(/router\.get\(\s*"\/proactive-insights"/);
  });

  it("wired through authorize() so authzEngine writes resolvedScope into audit_logs", () => {
    expect(ROUTE_SRC).toMatch(/authorize\(\{\s*feature: "my_space",\s*action: "view"\s*\}\)/);
  });
});

describe("IGOC-006 — 9 categories aggregated in one Promise.all", () => {
  // The whole point of the surface is that ONE call returns the
  // full role-adapted set. Splitting into per-category calls would
  // fan-out to N requests and break the latency / dedupe contract.
  const expectedCategories = [
    "my_documents_expiring",
    "my_official_docs_expiring",
    "my_pending_requests",
    "team_pending_leaves",
    "company_iqama_expiring",
    "company_unposted_journals",
    "company_overdue_invoices",
    "company_due_obligations",
    "critical_notifications",
  ];

  for (const cat of expectedCategories) {
    it(`emits category "${cat}"`, () => {
      expect(ROUTE_SRC).toContain(`category: "${cat}"`);
    });
  }

  it("uses Promise.all to fan-out the 9 source queries", () => {
    expect(ROUTE_SRC).toMatch(/await Promise\.all\(\[/);
  });

  it("each insight carries a deepLink so the UI can route the user", () => {
    expect(ROUTE_SRC).toMatch(/deepLink: "\/my-space\/documents"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/profile\/personal"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/my-space\/requests"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/action-center"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/hr\/employees\?filter=iqama_expiring"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/finance\/journal\?status=draft"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/finance\/invoices\?filter=overdue"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/obligations\?status=pending"/);
    expect(ROUTE_SRC).toMatch(/deepLink: "\/notifications\?priority=urgent"/);
  });
});

describe("IGOC-006 — role-adaptive content gating", () => {
  it("team approvals are gated on LEAVE_APPROVAL_ROLES (manager-only)", () => {
    expect(ROUTE_SRC).toMatch(/ifRole\(\s*LEAVE_APPROVAL_ROLES,\s*role,/);
  });

  it("company iqama expiring is gated on HR_ROLES (HR-only)", () => {
    expect(ROUTE_SRC).toMatch(/ifRole\(\s*HR_ROLES,\s*role,[\s\S]*?"companyIqamaExpiring"/);
  });

  it("unposted journals + overdue invoices are gated on FINANCE_ROLES (finance-only)", () => {
    expect(ROUTE_SRC).toMatch(/ifRole\(\s*FINANCE_ROLES,\s*role,[\s\S]*?"companyUnpostedJournals"/);
    expect(ROUTE_SRC).toMatch(/ifRole\(\s*FINANCE_ROLES,\s*role,[\s\S]*?"companyOverdueInvoices"/);
  });

  it("due obligations are gated on MGR_ROLES (managers + above)", () => {
    expect(ROUTE_SRC).toMatch(/ifRole\(\s*MGR_ROLES,\s*role,[\s\S]*?"companyDueObligations"/);
  });

  it("my-side categories (docs/iqama/requests) gate on employeeId / assignmentId presence, NOT on role", () => {
    // Employee CAN always see their own data. The role gate is only
    // applied to company-level surfaces. An owner with no employee
    // record still gets the manager surface — but no personal surface.
    expect(ROUTE_SRC).toMatch(/employeeId\s*\?\s*safe[\s\S]*?"myDocsExpiring"/);
    expect(ROUTE_SRC).toMatch(/employeeId\s*\?\s*safe[\s\S]*?"myIqama"/);
    expect(ROUTE_SRC).toMatch(/assignmentId\s*\?\s*safe[\s\S]*?"myPendingRequests"/);
  });
});

describe("IGOC-006 — tenant isolation on every company-level query", () => {
  it("companyIqamaExpiring filters by companyId", () => {
    const block = ROUTE_SRC.match(/companyIqamaExpiring[\s\S]*?\[companyId\]/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"companyId"\s*=\s*\$1/);
  });

  it("companyUnpostedJournals filters by companyId", () => {
    const block = ROUTE_SRC.match(/companyUnpostedJournals[\s\S]*?\[companyId\]/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"companyId"\s*=\s*\$1/);
  });

  it("companyOverdueInvoices filters by companyId", () => {
    const block = ROUTE_SRC.match(/companyOverdueInvoices[\s\S]*?\[companyId\]/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"companyId"\s*=\s*\$1/);
  });

  it("companyDueObligations filters by companyId", () => {
    const block = ROUTE_SRC.match(/companyDueObligations[\s\S]*?\[companyId\]/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"companyId"\s*=\s*\$1/);
  });

  it("teamPendingLeaves filters by allowedCompanies (owner-aware)", () => {
    const block = ROUTE_SRC.match(/teamPendingLeaves[\s\S]*?\[cc, role, assignmentId\]/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"companyId"\s*=\s*ANY\(\$1::int\[\]\)/);
  });

  it("critical notifications scoped to (assignmentId, companyId) — never leaks across tenants", () => {
    const block = ROUTE_SRC.match(/criticalNotifications[\s\S]*?\[assignmentId, companyId\]/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/"assignmentId"\s*=\s*\$1/);
    expect(block![0]).toMatch(/"companyId"\s*=\s*\$2/);
  });
});

describe("IGOC-006 — IGOC-001 context surfaces in the response envelope", () => {
  it("response includes active role / company / branch / assignment", () => {
    expect(ROUTE_SRC).toMatch(/role,\s*\n\s*companyId,\s*\n\s*branchId: scope\.branchId,/);
    expect(ROUTE_SRC).toMatch(/activeAssignmentId: assignmentId/);
  });

  it("response includes selectedRoleKey + resolvedScope (header role-picker echo)", () => {
    expect(ROUTE_SRC).toMatch(/selectedRoleKey: scope\.selectedRoleKey/);
    expect(ROUTE_SRC).toMatch(/resolvedScope: scope\.resolvedScope \?\? null/);
  });

  it("response includes generatedAt timestamp (auditable freshness)", () => {
    expect(ROUTE_SRC).toMatch(/generatedAt: new Date\(\)\.toISOString\(\)/);
  });
});

describe("IGOC-006 — severity sort guarantees critical-first ordering", () => {
  it("sort uses critical → warning → info rank", () => {
    expect(ROUTE_SRC).toMatch(/severityRank:\s*Record<Severity, number>\s*=\s*\{\s*critical: 0,\s*warning: 1,\s*info: 2\s*\}/);
    expect(ROUTE_SRC).toMatch(/insights\.sort\(\(a, b\) => severityRank\[a\.severity\] - severityRank\[b\.severity\]\)/);
  });

  it("severityFromDays(): ≤7 critical, ≤30 warning, otherwise info", () => {
    expect(ROUTE_SRC).toMatch(/if \(daysLeft <= 7\) return "critical"/);
    expect(ROUTE_SRC).toMatch(/if \(daysLeft <= 30\) return "warning"/);
    expect(ROUTE_SRC).toMatch(/return "info"/);
  });
});

describe("IGOC-006 — frontend widget surfaces the response on the daily workspace", () => {
  const CARD_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/proactive-insights-card.tsx"),
    "utf8",
  );
  const WORKSPACE_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/workspace.tsx"),
    "utf8",
  );

  it("workspace.tsx imports and renders <ProactiveInsightsCard />", () => {
    expect(WORKSPACE_SRC).toMatch(/import \{ ProactiveInsightsCard \} from "@\/components\/shared\/proactive-insights-card"/);
    expect(WORKSPACE_SRC).toMatch(/<ProactiveInsightsCard \/>/);
  });

  it("card reads from /me/proactive-insights via useApiQuery", () => {
    expect(CARD_SRC).toMatch(/useApiQuery<InsightsResponse>\(/);
    expect(CARD_SRC).toMatch(/"\/me\/proactive-insights"/);
  });

  it("React Query cache key includes the active role so the picker invalidates it", () => {
    // Without this the surface would never refresh when the user
    // switches role from the header — same payload would stick.
    expect(CARD_SRC).toMatch(/\["proactive-insights", roleKey\]/);
    expect(CARD_SRC).toMatch(/const roleKey = selectedRole\?\.roleKey \?\? "default"/);
  });

  it("renders deepLink CTA per insight (the user can act on the surface)", () => {
    expect(CARD_SRC).toMatch(/<Link href=\{insight\.deepLink\}>/);
  });

  it("severity styling exists for all three buckets", () => {
    expect(CARD_SRC).toMatch(/SEVERITY_STYLE: Record<Severity, \{/);
    expect(CARD_SRC).toMatch(/critical:\s*\{/);
    expect(CARD_SRC).toMatch(/warning:\s*\{/);
    expect(CARD_SRC).toMatch(/info:\s*\{/);
  });

  it("category icons cover all 9 server-side categories", () => {
    expect(CARD_SRC).toMatch(/my_documents_expiring:/);
    expect(CARD_SRC).toMatch(/my_official_docs_expiring:/);
    expect(CARD_SRC).toMatch(/my_pending_requests:/);
    expect(CARD_SRC).toMatch(/team_pending_leaves:/);
    expect(CARD_SRC).toMatch(/company_iqama_expiring:/);
    expect(CARD_SRC).toMatch(/company_unposted_journals:/);
    expect(CARD_SRC).toMatch(/company_overdue_invoices:/);
    expect(CARD_SRC).toMatch(/company_due_obligations:/);
    expect(CARD_SRC).toMatch(/critical_notifications:/);
  });

  it("data-category + data-severity attributes are emitted for E2E selectors", () => {
    expect(CARD_SRC).toMatch(/data-category=\{insight\.category\}/);
    expect(CARD_SRC).toMatch(/data-severity=\{insight\.severity\}/);
  });
});

describe("IGOC-006 — caps + safe wrapper guarantee bounded latency", () => {
  it("every category caps at LIMIT 5 (consistent envelope size)", () => {
    const limits = ROUTE_SRC.match(/LIMIT 5/g) ?? [];
    // 8 category queries use LIMIT 5; myIqama returns at most 1 row by
    // primary key. Total: 8 occurrences.
    expect(limits.length).toBeGreaterThanOrEqual(8);
  });

  it("safe() wraps fan-out queries so one bad category doesn't blank the whole dashboard", () => {
    expect(ROUTE_SRC).toMatch(/const safe = <T>\(p: Promise<T\[\]>, label: string, fallback: T\[\] = \[\]\)/);
    expect(ROUTE_SRC).toMatch(/\.catch\(\(e\) => \{[\s\S]*?logger\.error\(e, `\[me\/insights\] \$\{label\} failed`\)/);
  });
});
