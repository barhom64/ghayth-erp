import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-assertion test: the auto-migrate backfill runs against a live DB at
// boot, so we lock in the structural guarantees that make existing/legacy
// users actually usable under RBAC v2 (no live DB needed to verify intent).
const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/rbac/autoMigrate.ts"),
  "utf8",
);

describe("autoMigrate — existing-user RBAC backfill", () => {
  it("standard role defaults cover the common functional roles", () => {
    for (const key of ["owner", "general_manager", "hr_manager", "finance_manager", "employee", "driver"]) {
      expect(SRC).toContain(`role: "${key}"`);
    }
  });

  it("exposes a users.role safety-net backfill (bindUsersFromUserRole)", () => {
    expect(SRC).toContain("export async function bindUsersFromUserRole");
  });

  it("the safety-net only binds users who currently have ZERO rbac_user_roles rows", () => {
    const idx = SRC.indexOf("export async function bindUsersFromUserRole");
    const body = SRC.slice(idx, idx + 1800);
    // Targets users.role (not just assignment.role) ...
    expect(body).toContain("u.role IS NOT NULL");
    // ... and never overrides an existing assignment.
    expect(body).toContain("NOT EXISTS");
    expect(body).toContain("rbac_user_roles");
    expect(body).toContain("ON CONFLICT");
    expect(body).toContain("DO NOTHING");
  });

  it("syncLegacyToV2 invokes the safety-net and counts it in usersBound", () => {
    const idx = SRC.indexOf("export async function syncLegacyToV2");
    const body = SRC.slice(idx, idx + 1600);
    expect(body).toContain("bindUsersFromUserRole(");
    expect(body).toContain("usersBound + usersBoundByRole");
  });
});
