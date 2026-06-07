// ─────────────────────────────────────────────────────────────────────────────
// flatProjection — RBAC v2 grants (feature.action) → flat module:action keys.
//
// The single source of truth for authorization is RBAC v2 (rbac_role_grants).
// The frontend `can()` reads a flat `module:action` set from GET /permissions/my.
// This pure helper projects a user's RBAC v2 grants into that flat vocabulary so
// the RBAC v2 role editor drives UI visibility too (#1413, الخطة الجذرية §3 م1).
//
// For each grant it emits BOTH:
//   - coarse `module:action`  (lights existing module-level gates)
//   - fine   `feature.action:action` written as `feature_key:action`
// so both legacy coarse gates and future fine gates resolve. Kept pure +
// dependency-free so it is unit-tested directly (parity gate).
// ─────────────────────────────────────────────────────────────────────────────

export interface RbacGrantLike {
  feature_key: string;
  actions: string[] | null | undefined;
}

/**
 * Project RBAC v2 grants into the flat `module:action` + `feature:action`
 * vocabulary, de-duplicated. Malformed rows (missing key/actions) are skipped.
 */
export function projectGrantsToFlat(grants: readonly RbacGrantLike[]): string[] {
  const out = new Set<string>();
  for (const g of grants ?? []) {
    const featureKey = (g?.feature_key ?? "").trim();
    if (!featureKey) continue;
    const moduleKey = featureKey.split(".")[0];
    const actions = Array.isArray(g?.actions) ? g.actions : [];
    for (const raw of actions) {
      const action = String(raw ?? "").trim();
      if (!action) continue;
      if (moduleKey) out.add(`${moduleKey}:${action}`); // coarse
      out.add(`${featureKey}:${action}`);               // fine
    }
  }
  return [...out];
}
