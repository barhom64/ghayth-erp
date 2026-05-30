import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Visibility / authorization hardening smoke — Ghaith Operating Foundation
//
// Two additive backend hardenings that close documented gaps:
//   - FND-005: /events/log + /events/log/stats were mounted with
//     authMiddleware only — any authenticated user could read the company's
//     full event-bus log. Now gated by admin:view (like /events/catalog).
//   - RBAC-007 (#1413 §10): the user's roles are now ordered is_primary
//     first so the frontend's default active role honors the primary role.
//
// Static source scan (matching rbacAdminCompletionSmoke / umrahReportsSmoke).
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const EVENTS = readFileSync(join(root, "src/routes/events.ts"), "utf8");
const AUTH = readFileSync(join(root, "src/routes/auth.ts"), "utf8");

describe("FND-005 — /events/log is no longer readable by any authenticated user", () => {
  it("GET /events/log is gated by admin:view", () => {
    expect(EVENTS).toMatch(/router\.get\("\/log",\s*authorize\(\{ feature: "admin", action: "view" \}\)/);
  });

  it("GET /events/log/stats is gated by admin:view", () => {
    expect(EVENTS).toMatch(/router\.get\("\/log\/stats",\s*authorize\(\{ feature: "admin", action: "view" \}\)/);
  });

  it("no /events route is left mounted without an authorize() gate", () => {
    // Every `router.get("/...")` in events.ts must carry an authorize() on the
    // same line. (catalog/log/log-stats are the three GET routes.)
    const getRoutes = [...EVENTS.matchAll(/router\.get\("([^"]+)",\s*([^\n]*)/g)];
    expect(getRoutes.length).toBeGreaterThanOrEqual(3);
    for (const m of getRoutes) {
      expect(m[2]).toContain("authorize(");
    }
  });
});

describe("RBAC-007 — primary role is the default active role (#1413 §10)", () => {
  it("the login role query orders by is_primary before level", () => {
    expect(AUTH).toMatch(/ORDER BY ur\.is_primary DESC, r\.level DESC/);
  });

  it("the role query still exposes isPrimary to the frontend", () => {
    expect(AUTH).toMatch(/ur\.is_primary AS "isPrimary"/);
  });
});
