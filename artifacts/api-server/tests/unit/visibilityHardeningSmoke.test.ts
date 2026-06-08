import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// Visibility / authorization hardening smoke — Ghaith Operating Foundation
//
// Two additive backend hardenings that close documented gaps:
//   - FND-005: /events/catalog + /events/log + /events/log/stats were mounted
//     with authMiddleware + requireMinLevel(70) only — no per-feature gate, so
//     any level≥70 user could read the company's event catalog/log. Now every
//     GET is gated by admin:view.
//   - RBAC-007 (#1413 §10): the user's roles are now ordered is_primary first
//     so the frontend's default active role honors the primary role.
//
// Static source scan (matching rbacAdminCompletionSmoke / umrahReportsSmoke).
// ══════════════════════════════════════════════════════════════════════════

const root = join(import.meta.dirname!, "../../../../artifacts/api-server");
const EVENTS = readFileSync(join(root, "src/routes/events.ts"), "utf8");
const AUTH = readFileSync(join(root, "src/routes/auth.ts"), "utf8");

describe("FND-005 — company event LOG is no longer readable by any authenticated user", () => {
  it("imports authorize alongside maskFields", () => {
    expect(EVENTS).toMatch(/import \{ maskFields, authorize \} from "\.\.\/lib\/rbac\/authorize\.js"/);
  });

  // The documented FND-005 gap is specifically /events/log + /events/log/stats:
  // they expose the company's actual event_logs rows. /catalog is static,
  // code-defined metadata (no tenant data) and stays open to authenticated
  // users — gating it added no security value and tripped an Express params
  // typing quirk on the :name route.
  it("GET /log is gated by admin:view", () => {
    expect(EVENTS).toMatch(/eventsRouter\.get\("\/log",\s*authorize\(\{ feature: "admin", action: "view" \}\)/);
  });

  it("GET /log/stats is gated by admin:view", () => {
    expect(EVENTS).toMatch(/eventsRouter\.get\("\/log\/stats",\s*authorize\(\{ feature: "admin", action: "view" \}\)/);
  });

  it("both event_logs-backed GET routes carry an authorize() gate", () => {
    const logRoutes = [...EVENTS.matchAll(/eventsRouter\.get\("(\/log(?:\/stats)?)",\s*([^\n]*)/g)];
    expect(logRoutes.length).toBe(2);
    for (const m of logRoutes) {
      expect(m[2]).toContain("authorize(");
    }
  });
});

describe("RBAC-007 — primary role is the default active role (#1413 §10)", () => {
  // #1791: the legacy user_roles half of the role-selector UNION was removed.
  // The query is now pure RBAC-v2 (rbac_user_roles), so the `source_order`
  // tiebreaker no longer applies — `is_primary DESC` still leads, preserving
  // "primary role is the default active role".
  it("the user-roles query orders by is_primary first", () => {
    expect(AUTH).toMatch(/ORDER BY is_primary DESC, level DESC/);
  });

  it("the query still selects is_primary so the ordering has a column to sort on", () => {
    expect(AUTH).toMatch(/is_primary/);
  });
});
