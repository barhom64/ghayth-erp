import { ForbiddenError } from "./errorHandler.js";

/**
 * Role gate for route handlers.
 *
 * Throws `ForbiddenError` when the active scope's role is not in the
 * allowlist, so the error flows through `handleRouteError` and reaches
 * the client as `{ error, code: "FORBIDDEN", fix, meta }` — matching the
 * typed-error contract every other route uses.
 *
 * Usage:
 *
 *   import { assertRole } from "../lib/roleGuards.js";
 *   assertRole(scope, ["finance_manager", "owner"]);
 *
 * This replaces the older `requireRole(scope, allowedRoles, res): boolean`
 * pattern that wrote a bare 403 directly to the response and bypassed
 * the typed-error pipeline. The shared helper prevents the regression
 * we hit during the Phase C.7 batch conversion where individual files
 * ended up calling an undefined `assertRole` at runtime.
 */
export function assertRole(scope: any, allowedRoles: readonly string[]): void {
  if (!allowedRoles.includes(scope.role)) {
    throw new ForbiddenError("ليس لديك الصلاحية للقيام بهذا الإجراء", {
      fix: `الأدوار المسموحة: ${allowedRoles.join(", ")}`,
      meta: { requiredRoles: Array.from(allowedRoles), yourRole: scope.role },
    });
  }
}
