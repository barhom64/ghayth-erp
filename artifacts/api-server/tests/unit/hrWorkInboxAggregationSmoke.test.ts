/**
 * PR-5 (#2077) — Unified Work Inbox aggregation smoke.
 *
 * Pins the structural contract of the new /work-inbox page so a future
 * PR can't silently drop the 4 product-owner-mandated sections or
 * regress to a single «notifications only» view.
 *
 * The product owner spelled out exactly four sections + a scope filter
 * inside section 4. No new backend, no new engine, no new workflow —
 * the page is pure aggregation over existing endpoints. These pins
 * confirm that promise.
 *
 *   1. يحتاج إجراء مني   — pendingApprovals from /my-space (role-gated).
 *   2. مهامي              — tasks split into 4 urgency buckets
 *                           (overdue / today / week / month).
 *   3. إشعارات مهمة       — notifications filtered to ACTIONABLE types
 *                           or high/critical priority.
 *   4. متابعاتي          — my requests + team requests + dept requests,
 *                           selected via a scope filter (mine | team |
 *                           department), with team + dept fetched
 *                           lazily on demand.
 *
 * Source-only test, matching the project convention for structural
 * pins (no DB, no render).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/work-inbox.tsx"),
  "utf8",
);
const ROUTES_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/routes/miscRoutes.tsx"),
  "utf8",
);
const NAV_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("PR-5 (#2077) — the page exists, is routed, and is in the sidebar", () => {
  it("page module exists at the canonical path", () => {
    expect(PAGE_SRC).toMatch(/export default function WorkInboxPage\(/);
  });
  it("route /work-inbox is registered (miscRoutes)", () => {
    expect(ROUTES_SRC).toMatch(/const WorkInbox = lazy\(\(\) => import\("@\/pages\/work-inbox"\)\)/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/work-inbox", component: WorkInbox \}/);
  });
  it("sidebar exposes «صندوق الأعمال» at the top of «الرئيسية»", () => {
    expect(NAV_SRC).toMatch(/label: "صندوق الأعمال", path: "\/work-inbox"/);
  });
  it("the experimental /my/work-queue route stays as a back-compat alias", () => {
    // The legacy «ما ينتظر إجراءاتي» entry must now point at /work-inbox
    // (the canonical page) while the /my/work-queue ROUTE is still
    // mounted in miscRoutes so old bookmarks/notification action urls
    // resolve. This avoids a 404 storm on existing deep-links.
    expect(NAV_SRC).toMatch(/label: "ما ينتظر إجراءاتي", path: "\/work-inbox"/);
    expect(ROUTES_SRC).toMatch(/\{ path: "\/my\/work-queue", component: WorkQueue \}/);
  });
});

describe("PR-5 (#2077) — 4 sections match the product owner's spec", () => {
  // The four section labels MUST appear verbatim in the source — they
  // are the contract with the product owner. A future refactor that
  // renames «متابعاتي» to «نشاطي» (or similar) needs the operator's
  // explicit ack, hence the pin.
  for (const label of ["يحتاج إجراء مني", "مهامي", "إشعارات مهمة", "متابعاتي"]) {
    it(`section «${label}» rendered verbatim`, () => {
      expect(PAGE_SRC).toContain(label);
    });
  }

  it("four TabsTriggers wired with data-testid pins", () => {
    expect(PAGE_SRC).toMatch(/data-testid="tab-actions"/);
    expect(PAGE_SRC).toMatch(/data-testid="tab-tasks"/);
    expect(PAGE_SRC).toMatch(/data-testid="tab-notifs"/);
    expect(PAGE_SRC).toMatch(/data-testid="tab-followups"/);
  });
});

describe("PR-5 (#2077) — sources are existing endpoints only (no new backend)", () => {
  // Each api fetch must be an EXISTING endpoint. We pin each by URL
  // pattern so a refactor that silently swaps a source for a new
  // backend (which the doctrine forbids) fails the smoke.
  it("section 1 reads /my-space (mySpace.pendingApprovals)", () => {
    expect(PAGE_SRC).toMatch(/useApiQuery<[\s\S]{0,150}pendingApprovals[\s\S]{0,150}\(\[[^\]]*\],\s*"\/my-space"\)/);
  });
  it("section 2 reads /tasks?…assignedToMe=1 with open statuses", () => {
    expect(PAGE_SRC).toMatch(/"\/tasks\?limit=100&status=pending,in_progress&assignedToMe=1"/);
  });
  it("section 3 reads /notifications?unreadOnly=true", () => {
    expect(PAGE_SRC).toMatch(/"\/notifications\?limit=100&unreadOnly=true"/);
  });
  it("section 4 reads /hr/leave-requests filtered by branch (team) and department (lazy)", () => {
    expect(PAGE_SRC).toMatch(/\/hr\/leave-requests\?branchId=[\s\S]{0,200}status=pending`,\s*\{ enabled: wantTeam/);
    expect(PAGE_SRC).toMatch(/\/hr\/leave-requests\?scope=department[\s\S]{0,150}status=pending`,\s*\{ enabled: wantDept/);
  });
});

describe("PR-5 (#2077) — section 2 («مهامي») splits into 4 urgency buckets", () => {
  it("classifyTaskUrgency returns the 4 buckets in date order", () => {
    expect(PAGE_SRC).toMatch(/function classifyTaskUrgency[\s\S]{0,400}"overdue"[\s\S]{0,200}"today"[\s\S]{0,200}"week"[\s\S]{0,200}"month"/);
  });
  it("the page renders the 4 buckets with the canonical Arabic labels", () => {
    for (const title of ["مهام متأخرة", "مهام اليوم", "مهام هذا الأسبوع", "مهام هذا الشهر"]) {
      expect(PAGE_SRC).toContain(title);
    }
  });
  it("overdue bucket gets the error tone (red badge) so it's hard to miss", () => {
    expect(PAGE_SRC).toMatch(/title="مهام متأخرة"\s*tone="error"/);
  });
});

describe("PR-5 (#2077) — section 4 («متابعاتي») has the scope filter", () => {
  it("FollowupScope union is exactly mine | team | department", () => {
    expect(PAGE_SRC).toMatch(/type FollowupScope = "mine" \| "team" \| "department"/);
  });
  it("scope filter renders 3 buttons with explicit testids (template literal per scope)", () => {
    // The testids are built from a template literal
    // (`followups-scope-${opt.k}`) over the 3 scope keys. We pin the
    // template + the wrapping div's static testid, which together
    // guarantee 3 emitted testids: mine, team, department.
    expect(PAGE_SRC).toMatch(/data-testid="followups-scope-filter"/);
    expect(PAGE_SRC).toMatch(/data-testid=\{`followups-scope-\$\{opt\.k\}`\}/);
    // And the three options list MUST include the three scope keys.
    expect(PAGE_SRC).toMatch(/\{ k: "mine"[\s\S]{0,200}\{ k: "team"[\s\S]{0,200}\{ k: "department"/);
  });
  it("the 3 Arabic labels match the product spec verbatim", () => {
    for (const label of ["طلباتي", "طلبات فريقي", "طلبات إدارتي"]) {
      expect(PAGE_SRC).toContain(label);
    }
  });
  it("team/department queries are gated on the chosen scope (enabled: …)", () => {
    // The page must NOT eagerly fetch /hr/leaves for every operator
    // (that doubles request load). Gating on enabled: wantTeam /
    // enabled: wantDept keeps the «mine» default cheap.
    expect(PAGE_SRC).toMatch(/enabled:\s*wantTeam[\s\S]{0,80}\)\s*;[\s\S]{0,300}enabled:\s*wantDept/);
  });
});

describe("PR-5 (#2077) — actionable notifications filter (section 3)", () => {
  it("ACTIONABLE_NOTIF_TYPES contains the spec's four anchor types", () => {
    // The product owner named four: مخالفة حضور / تقييم / انتهاء عقد /
    // انتهاء إقامة. These map to attendance_violation +
    // performance_evaluation + contract_expiry + iqama_expiry.
    expect(PAGE_SRC).toMatch(/"attendance_violation"/);
    expect(PAGE_SRC).toMatch(/"performance_evaluation"/);
    expect(PAGE_SRC).toMatch(/"contract_expiry"/);
    expect(PAGE_SRC).toMatch(/"iqama_expiry"/);
  });
  it("high/critical priority is treated as actionable even if the type isn't in the set", () => {
    // Catches the «we forgot a notification type» edge case — anything
    // marked high or critical priority always reaches the page.
    expect(PAGE_SRC).toMatch(/n\.priority === "high" \|\| n\.priority === "critical"/);
  });
});

describe("PR-5 (#2077) — doctrine: no new backend, page is aggregation-only", () => {
  it("imports useApiQuery but NOT useApiMutation (read-only page)", () => {
    // The doctrine forbids new workflows. The work inbox MUST be
    // strictly read-only — every action a card surfaces is a deep
    // link to the existing screen that owns that action. If a future
    // PR added a useApiMutation here, it would mean approvals are
    // happening on this page, which is out of scope.
    expect(PAGE_SRC).toMatch(/import \{[\s\S]{0,100}useApiQuery[\s\S]{0,100}\} from "@\/lib\/api"/);
    expect(PAGE_SRC).not.toMatch(/useApiMutation/);
  });
  it("every queue item exposes a deep link via the ItemCard.href prop", () => {
    // The href is declared on the ItemCardProps interface (above the
    // function) — pin both.
    expect(PAGE_SRC).toMatch(/interface ItemCardProps[\s\S]{0,300}href:\s*string/);
    expect(PAGE_SRC).toMatch(/href=\{href\}/);
  });
  it("approvalDeepLink covers the 10 approval types in /my-space.pendingApprovals", () => {
    for (const t of ["leave", "loan", "overtime", "exit", "expense", "purchase_order", "custody", "official_letter", "hr_transfer", "umrah_booking"]) {
      expect(PAGE_SRC).toContain(`"${t}"`);
    }
  });
});

describe("PR-5 (#2077) — total-count footer proves the aggregation is real", () => {
  it("footer renders «إجمالي ما ينتظر إجراءاتك» with the 3 counts breakdown", () => {
    expect(PAGE_SRC).toMatch(/إجمالي ما ينتظر إجراءاتك/);
    expect(PAGE_SRC).toMatch(/data-testid="work-inbox-total"/);
  });
});
