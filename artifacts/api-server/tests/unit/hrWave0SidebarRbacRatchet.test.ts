/**
 * HR-Wave-0 / 0.2 — Sidebar RBAC ratchet (regression pin).
 *
 * The mandate's «القائمة الجانبية تُبنى من الصلاحيات الفعّالة» rule
 * (along with «حماية الوصول على الـbackend، لا بإخفاء الرابط») is
 * already implemented by `useFilteredNavSections()` in
 * sidebar-layout.tsx. This smoke pins the filter pipeline so a future
 * PR can't silently:
 *
 *   1. Drop the `canAccessModule` check — every module-tagged item
 *      must be gated.
 *   2. Drop the `canAccessSubPage` check — sub-page gates are how
 *      we hide e.g. /hr/payroll from a role that has /hr access but
 *      no payroll permission.
 *   3. Drop the `isFeatureEnabled` check — company-level feature
 *      flags must still be able to hide a whole module from the
 *      sidebar.
 *   4. Drop the `effectiveRoleLevel < minRoleLevel` floor check —
 *      this is the level-based monotonicity gate.
 *   5. Drop the fine-grained `can()` permission check (itemPermAllowed)
 *      — required for menu items that need an explicit grant.
 *   6. Switch from `return null` + `.filter(x !== null)` to a CSS-hide
 *      pattern (which would render the items in the DOM and only
 *      visually hide them — the doctrine forbids this).
 *   7. Drop the `isRegisteredRoute` check — required so the sidebar
 *      can't link to a path the router doesn't actually serve.
 *   8. Drop the empty-section strip — sections whose items all
 *      filtered away must not render as ghost headers.
 *   9. Stop exporting the hook — other surfaces (services hub,
 *      command palette, breadcrumb generators) reuse it and would
 *      silently re-implement the filter inconsistently.
 *
 * Source-only smoke (no React render, no DOM). Runs in <100ms.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SIDEBAR_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx"),
  "utf8",
);

describe("HR-Wave-0 / 0.2 — useFilteredNavSections export contract", () => {
  it("is exported so other surfaces can reuse the same filter pipeline", () => {
    // /services hub + command palette + breadcrumb generators all call
    // this — if it goes from `export function` to plain `function`
    // they will silently fall back to their own filters, drift, and
    // break the «single filter pipeline» invariant.
    expect(SIDEBAR_SRC).toMatch(/export function useFilteredNavSections\(\): NavSection\[\] \{/);
  });

  it("pulls all 5 gate inputs from useAppContext (canAccessModule + canAccessSubPage + isFeatureEnabled + can + effectiveRoleLevel)", () => {
    expect(SIDEBAR_SRC).toMatch(/const \{\s*canAccessModule,\s*canAccessSubPage,\s*isFeatureEnabled,\s*can,\s*effectiveRoleLevel,\s*\} = useAppContext\(\)/);
  });
});

describe("HR-Wave-0 / 0.2 — filterItems pipeline gates", () => {
  it("module gate: forbidden modules return null (item is dropped, not hidden)", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(item\.module && !canAccessModule\(item\.module\)\) return null;/);
  });

  it("feature-flag gate: disabled modules return null", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(item\.module && !isFeatureEnabled\(item\.module\)\) return null;/);
  });

  it("level-floor gate: items below the user's effectiveRoleLevel return null", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(item\.minRoleLevel && effectiveRoleLevel < item\.minRoleLevel\) return null;/);
  });

  it("sub-page gate: subKey-tagged items honour canAccessSubPage(mod, subKey)", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(item\.subKey && mod && !canAccessSubPage\(mod, item\.subKey\)\) return null;/);
  });

  it("fine-grained permission gate: items with `perm` honour itemPermAllowed (calls can())", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(!itemPermAllowed\(item\)\) return null;/);
    expect(SIDEBAR_SRC).toMatch(/return item\.permMode === "any" \? list\.some\(can\) : list\.every\(can\)/);
  });

  it("route-registry gate: leaf items must resolve to a registered route", () => {
    // Prevents the sidebar from advertising a path the router doesn't
    // serve — without this, a stale menu entry survives a route
    // removal as a dead link.
    expect(SIDEBAR_SRC).toMatch(/if \(!isRegisteredRoute\(item\.path\)\) return null;/);
  });

  it("recursion: children inherit parent module and are filtered the same way", () => {
    expect(SIDEBAR_SRC).toMatch(/const filteredChildren = filterItems\(item\.children, mod\)/);
    expect(SIDEBAR_SRC).toMatch(/if \(filteredChildren\.length === 0\) return null;/);
  });
});

describe("HR-Wave-0 / 0.2 — filter is REAL (no CSS-hide cheat)", () => {
  it("uses .filter((x): x is NavItem => x !== null) — items are removed from the array, not hidden", () => {
    // The doctrine: «حماية الوصول على الـbackend، لا بإخفاء الرابط».
    // The frontend half of that promise is that forbidden items NEVER
    // make it into the rendered tree — not even invisibly. The
    // pipeline must therefore filter nulls out, not render them
    // with `display:none`.
    expect(SIDEBAR_SRC).toMatch(/\.filter\(\(x\): x is NavItem => x !== null\)/);
  });

  it("does NOT use a CSS-hide pattern in the filter pipeline", () => {
    // Heuristic regression guard: if someone adds `className="hidden"`
    // or `style={{ display: 'none' }}` to the filterItems map, it
    // would be a sign the doctrine is being broken. We don't
    // forbid those globally (other components use them) — we just
    // forbid them inside the filter pipeline block specifically.
    const filterBlock = SIDEBAR_SRC.match(/const filterItems = \(items: NavItem\[\], parentModule\?: ModuleType\): NavItem\[\] =>[\s\S]*?\.filter\(\(x\): x is NavItem => x !== null\);/);
    expect(filterBlock).not.toBeNull();
    expect(filterBlock![0]).not.toMatch(/className="hidden"/);
    expect(filterBlock![0]).not.toMatch(/display:\s*['"]?none/);
  });

  it("empty sections are stripped — no ghost headers when all items filtered away", () => {
    expect(SIDEBAR_SRC).toMatch(/\.filter\(\(section\) => section\.items\.length > 0\)/);
  });
});

describe("HR-Wave-0 / 0.2 — itemPermAllowed handles 'any' vs 'all' modes", () => {
  it("default (all): every permission in the array must be granted", () => {
    expect(SIDEBAR_SRC).toMatch(/list\.every\(can\)/);
  });

  it("opt-in (any): at least one permission in the array must be granted", () => {
    expect(SIDEBAR_SRC).toMatch(/list\.some\(can\)/);
  });

  it("no perm tag = always allowed (the gate is opt-in per item)", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(!item\.perm\) return true;/);
  });
});

describe("HR-Wave-0 / 0.2 — section-level wiring stays consistent", () => {
  it("allNavSections is the single source of truth (no per-role hardcoded lists)", () => {
    // If a future PR adds e.g. `if (role === 'owner') return ownerSections`,
    // the «one menu, role-filtered» invariant is dead. We catch that
    // by asserting only ONE input to the filter — `allNavSections`.
    expect(SIDEBAR_SRC).toMatch(/return allNavSections\s*\.map\(\(section\) => \(\{/);
  });

  it("section spreads only `items` from filterItems — no role-specific branches", () => {
    expect(SIDEBAR_SRC).toMatch(/items: filterItems\(section\.items\),/);
  });
});
