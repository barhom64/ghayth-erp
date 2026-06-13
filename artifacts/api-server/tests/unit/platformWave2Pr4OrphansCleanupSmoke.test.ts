/**
 * PR-4 (#2163) — Smoke pin: Orphans Cleanup
 *
 * يحرس البنود الأربعة:
 * 1. /umrah/commission-plans/new — deep-link-only (لا nav item مستقل)
 * 2. /my/work-queue — back-compat redirect إلى /work-inbox (لا صفحة كاملة)
 * 3. /umrah/transport-requests — nav item موجود في العمرة
 * 4. admin attendance/scoring — back-compat redirects (لم يعودا orphan)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FRONTEND  = join(REPO_ROOT, "artifacts/ghayth-erp/src");

function read(rel: string): string {
  return readFileSync(join(FRONTEND, rel), "utf-8");
}

describe("PR-4 — /umrah/commission-plans/new (deep-link-only)", () => {
  it("commission-plans/new is NOT a standalone nav item", () => {
    const nav = read("components/layout/navigation.registry.ts");
    // يجب ألا يظهر كـ path مباشر في nav — يُفتح فقط من زر في الصفحة الأم
    expect(nav).not.toContain('"/umrah/commission-plans/new"');
  });

  it("commission-plans list page has a link to /new (confirms deep-link via parent)", () => {
    const page = read("pages/umrah/commission-plans.tsx");
    expect(page).toContain("/umrah/commission-plans/new");
  });
});

describe("PR-4 — /my/work-queue (back-compat redirect)", () => {
  it("work-queue page is a redirect shell (no PageShell)", () => {
    const content = read("pages/my/work-queue.tsx");
    expect(content).not.toContain("PageShell");
    expect(content).toContain("/work-inbox");
  });

  it("work-queue redirects to /work-inbox", () => {
    const content = read("pages/my/work-queue.tsx");
    expect(content).toContain("setLocation");
    expect(content).toContain("/work-inbox");
  });

  it("/my/work-queue route still exists in miscRoutes (back-compat not deleted)", () => {
    const routes = read("routes/miscRoutes.tsx");
    expect(routes).toContain('"/my/work-queue"');
  });
});

describe("PR-4 — /umrah/transport-requests (nav-add)", () => {
  it("transport-requests has a nav entry in the registry", () => {
    const nav = read("components/layout/navigation.registry.ts");
    expect(nav).toContain('"/umrah/transport-requests"');
  });

  it("transport-requests nav entry has correct perm (umrah:list)", () => {
    const nav = read("components/layout/navigation.registry.ts");
    const idx = nav.indexOf('"/umrah/transport-requests"');
    const surrounding = nav.slice(Math.max(0, idx - 200), idx + 200);
    expect(surrounding).toContain("umrah:list");
  });

  it("transport-requests is placed inside the umrah section (not fleet or other)", () => {
    const nav = read("components/layout/navigation.registry.ts");
    const umrahStart = nav.indexOf("// 9. العمرة");
    const idx = nav.indexOf('"/umrah/transport-requests"');
    expect(umrahStart).toBeGreaterThan(0);
    expect(idx).toBeGreaterThan(umrahStart);
  });
});

describe("PR-4 — admin attendance/scoring are back-compat (not orphan)", () => {
  it("admin/attendance-categories is a redirect (confirmed back-compat after PR-3)", () => {
    const content = read("pages/admin/attendance-categories.tsx");
    expect(content).not.toContain("PageShell");
    expect(content).toContain("/hr/attendance-categories");
  });

  it("admin/scoring-weights is a redirect (confirmed back-compat after PR-3)", () => {
    const content = read("pages/admin/scoring-weights.tsx");
    expect(content).not.toContain("PageShell");
    expect(content).toContain("/hr/scoring-weights");
  });
});
