// Benchmarks for the RBAC catalog helpers. `isKnownPermission`
// runs on every authorize() call and on every permission seed
// validation; `getRolePermissions` is consulted whenever the
// middleware falls back to the in-memory default map (no
// `role_permissions` row in the DB for the role).
//
import { bench, describe } from "vitest";
import {
  isKnownPermission,
  getRolePermissions,
} from "../../src/lib/rbacCatalog.js";

describe("isKnownPermission", () => {
  bench("hot legacy permission (hr:read)", () => {
    isKnownPermission("hr:read");
  });

  bench("wildcard (\"*\")", () => {
    isKnownPermission("*");
  });

  bench("feature-catalog permission (finance.invoices:read)", () => {
    // Routed through FEATURE_PERMISSION_SET, not PERMISSION_SET.
    isKnownPermission("finance.invoices:read");
  });

  bench("unknown permission (cache miss / both sets)", () => {
    isKnownPermission("does-not-exist:nope");
  });
});

describe("getRolePermissions", () => {
  bench("owner (wildcard set)", () => {
    getRolePermissions("owner");
  });

  bench("branch_manager (~22 permissions, longest list)", () => {
    getRolePermissions("branch_manager");
  });

  bench("finance_manager (medium list)", () => {
    getRolePermissions("finance_manager");
  });

  bench("unknown role (empty array fallback)", () => {
    getRolePermissions("nonexistent_role");
  });
});
