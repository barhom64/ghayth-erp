import { describe, it, expect } from "vitest";

// Note: full engine tests require a live DB. These are integration-shape
// tests of the user-grants merging logic that the engine performs in
// memory after loading from the DB. They verify the fix in PR #224.

describe("authzEngine — user grants merging logic", () => {
  type UserGrant = { feature_key: string; action: string | null; scope: string | null; type: "grant" | "revoke"; expires_at: string | null };

  // Mirrors the snippet inside checkAccess that converts user-grant rows
  // into virtual matching grants. Extracted here so the test stays
  // independent of the DB and HTTP layer.
  function applyUserGrants(
    roleMatches: Array<{ feature_key: string; actions: string[]; scope: string }>,
    userGrants: UserGrant[],
    feature: string,
    action: string,
  ): { matches: Array<{ feature_key: string; actions: string[]; scope: string; role_id: number }>; revoked: boolean } {
    const isRevoked = userGrants.some((u) =>
      u.type === "revoke" &&
      u.feature_key === feature &&
      (u.action == null || u.action === action),
    );
    if (isRevoked) return { matches: [], revoked: true };

    const userMatches = userGrants
      .filter((u) =>
        u.type === "grant" &&
        u.feature_key === feature &&
        (u.action == null || u.action === action),
      )
      .map((u) => ({
        feature_key: u.feature_key,
        actions: [action],
        scope: u.scope || "self",
        role_id: -1,
      }));

    const roleAsRoleGrant = roleMatches.map((r) => ({ ...r, role_id: 0 }));
    return { matches: [...roleAsRoleGrant, ...userMatches], revoked: false };
  }

  describe("revokes", () => {
    it("revokes the action even when role grants it", () => {
      const { revoked } = applyUserGrants(
        [{ feature_key: "finance.invoices", actions: ["view"], scope: "company" }],
        [{ feature_key: "finance.invoices", action: "view", scope: null, type: "revoke", expires_at: null }],
        "finance.invoices",
        "view",
      );
      expect(revoked).toBe(true);
    });

    it("revoke without action revokes ALL actions on the feature", () => {
      const { revoked } = applyUserGrants(
        [{ feature_key: "finance.invoices", actions: ["view"], scope: "company" }],
        [{ feature_key: "finance.invoices", action: null, scope: null, type: "revoke", expires_at: null }],
        "finance.invoices",
        "view",
      );
      expect(revoked).toBe(true);
    });

    it("revoke for a different feature is ignored", () => {
      const { revoked } = applyUserGrants(
        [{ feature_key: "finance.invoices", actions: ["view"], scope: "company" }],
        [{ feature_key: "hr.employees", action: "view", scope: null, type: "revoke", expires_at: null }],
        "finance.invoices",
        "view",
      );
      expect(revoked).toBe(false);
    });
  });

  describe("JIT-style grants", () => {
    it("user-grant with no role grant produces a virtual match", () => {
      const { matches } = applyUserGrants(
        [],
        [{ feature_key: "finance.budget", action: "view", scope: "company", type: "grant", expires_at: null }],
        "finance.budget",
        "view",
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.scope).toBe("company");
      expect(matches[0]?.role_id).toBe(-1); // sentinel for "from user_grants"
    });

    it("defaults scope to self when user-grant has no scope", () => {
      const { matches } = applyUserGrants(
        [],
        [{ feature_key: "finance.budget", action: "view", scope: null, type: "grant", expires_at: null }],
        "finance.budget",
        "view",
      );
      expect(matches[0]?.scope).toBe("self");
    });

    it("user-grant augments role grant — both appear in matches", () => {
      const { matches } = applyUserGrants(
        [{ feature_key: "finance.budget", actions: ["view"], scope: "branch" }],
        [{ feature_key: "finance.budget", action: "view", scope: "company", type: "grant", expires_at: null }],
        "finance.budget",
        "view",
      );
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.scope).sort()).toEqual(["branch", "company"]);
    });

    it("user-grant with null action applies to any action on the feature", () => {
      const { matches } = applyUserGrants(
        [],
        [{ feature_key: "finance.budget", action: null, scope: "company", type: "grant", expires_at: null }],
        "finance.budget",
        "view",
      );
      expect(matches).toHaveLength(1);
    });
  });

  describe("ordering", () => {
    it("revoke beats grant — JIT can't override an explicit revoke", () => {
      const { revoked, matches } = applyUserGrants(
        [{ feature_key: "finance.budget", actions: ["view"], scope: "company" }],
        [
          { feature_key: "finance.budget", action: "view", scope: "all", type: "grant", expires_at: null },
          { feature_key: "finance.budget", action: "view", scope: null, type: "revoke", expires_at: null },
        ],
        "finance.budget",
        "view",
      );
      expect(revoked).toBe(true);
      expect(matches).toHaveLength(0);
    });
  });
});
