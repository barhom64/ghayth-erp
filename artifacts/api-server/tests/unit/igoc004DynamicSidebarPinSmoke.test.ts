/**
 * IGOC-004 — Dynamic sidebar filter pin.
 *
 * The original IGOC audit (docs/IGOC_IDENTITY_GOVERNANCE_TASK.md §1 item 11)
 * flagged the sidebar as "static + CSS-hidden". A re-read of the actual code
 * found this WRONG — the sidebar IS dynamic and filters items OUT of the
 * render tree (not CSS-hidden). This test pins the current behavior so a
 * future regression that re-introduces CSS-hide gets caught immediately.
 *
 * The 5 properties we lock in:
 *
 *  1. `apiData` re-fetches `/permissions/my` when `selectedRoleKey` changes
 *     (so switching roles re-renders the sidebar with the new role's
 *     allowed modules + permissions).
 *  2. `apiFetch` transmits the active role via the `x-selected-role`
 *     header (so the backend authMiddleware can narrow the scope).
 *  3. `filterItems()` returns `null` for items lacking module access,
 *     min role level, sub-page access, or permission gates — then
 *     `.filter(x !== null)` drops the nulls. Items NOT in the tree.
 *  4. Empty sections (every item filtered out) are themselves filtered out.
 *  5. `allowedModules` is computed from `selectedRole.modules` or
 *     `apiData.modules`, both of which reflect the ACTIVE role/picker
 *     not the user's max permissions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SIDEBAR_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx"),
  "utf8",
);
const APP_CTX_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/contexts/app-context.tsx"),
  "utf8",
);
const API_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/lib/api.ts"),
  "utf8",
);

describe("IGOC-004 — apiData reactivity to active role changes", () => {
  it("useEffect that fetches /permissions/my depends on selectedRoleKey", () => {
    // The effect at line ~232 fetches permissions; its dep array must
    // include selectedRoleKey so role-switcher clicks re-trigger it.
    expect(APP_CTX_SRC).toMatch(
      /apiFetch\("\/permissions\/my"\)[\s\S]*?\}, \[isAuthenticated[^\]]*selectedRoleKey\]/,
    );
  });

  it("apiFetch transmits the active role as x-selected-role header", () => {
    expect(API_SRC).toMatch(/headers\["x-selected-role"\]/);
  });
});

describe("IGOC-004 — filterItems removes forbidden items from the render tree", () => {
  it("returns null (not CSS-hide) when module not accessible", () => {
    expect(SIDEBAR_SRC).toMatch(
      /if \(item\.module && !canAccessModule\(item\.module\)\) return null/,
    );
  });

  it("returns null when feature flag disables the module", () => {
    expect(SIDEBAR_SRC).toMatch(
      /if \(item\.module && !isFeatureEnabled\(item\.module\)\) return null/,
    );
  });

  it("returns null when minRoleLevel not met", () => {
    expect(SIDEBAR_SRC).toMatch(
      /if \(item\.minRoleLevel && effectiveRoleLevel < item\.minRoleLevel\) return null/,
    );
  });

  it("returns null when sub-page not accessible", () => {
    expect(SIDEBAR_SRC).toMatch(
      /if \(item\.subKey && mod && !canAccessSubPage\(mod, item\.subKey\)\) return null/,
    );
  });

  it("returns null when permission gate (perm) fails", () => {
    expect(SIDEBAR_SRC).toMatch(/if \(!itemPermAllowed\(item\)\) return null/);
  });

  it("filters nulls AFTER the recursive map — items truly absent from output", () => {
    expect(SIDEBAR_SRC).toMatch(
      /\.filter\(\(x\): x is NavItem => x !== null\)/,
    );
  });

  it("drops sections whose items are all filtered out", () => {
    expect(SIDEBAR_SRC).toMatch(
      /\.filter\(\(section\) => section\.items\.length > 0\)/,
    );
  });
});

describe("IGOC-004 — no CSS-hide fallback", () => {
  it("does NOT use display:none or visibility:hidden to hide nav items", () => {
    // If a future PR adds CSS hiding for nav items, this test
    // catches it — CSS-hide is the anti-pattern IGOC-004 prevents.
    // (Other CSS-hide elsewhere in the file is fine — only the nav
    // section is sensitive.)
    const navSection = SIDEBAR_SRC.slice(0, SIDEBAR_SRC.indexOf("export function SidebarLayout"));
    expect(navSection).not.toMatch(/display:\s*['"]?none/);
    expect(navSection).not.toMatch(/visibility:\s*['"]?hidden/);
  });
});

describe("IGOC-004 — allowedModules sourced from active role / apiData", () => {
  it("when apiData null, falls back to selectedRole.modules", () => {
    expect(APP_CTX_SRC).toMatch(
      /if \(!selectedRole\) return \["home"[\s\S]*?const mods = selectedRole\.modules/,
    );
  });

  it("when apiData present, uses apiData.modules (which reflects the active role)", () => {
    expect(APP_CTX_SRC).toMatch(
      /if \(apiData !== null\) \{[\s\S]*?const mods = apiData\.modules/,
    );
  });

  it("useMemo dependency includes selectedRole + apiData (recomputes on switch)", () => {
    expect(APP_CTX_SRC).toMatch(
      /const allowedModules: ModuleType\[\] = useMemo\([\s\S]*?\}, \[selectedRole, apiData\]\)/,
    );
  });
});
