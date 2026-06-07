// ─────────────────────────────────────────────────────────────────────────────
// flatProjection — RBAC v2 grants (feature.action) → flat permission keys.
//
// The single source of truth for authorization is RBAC v2 (rbac_role_grants).
// The frontend `can()` reads a flat permission set from GET /permissions/my.
// These pure helpers project a user's RBAC v2 grants so the RBAC v2 role editor
// drives UI visibility too (#1413, الخطة الجذرية §3 م1).
//
//   - projectGrantsToFine:   `feature_key:action` (e.g. finance.invoices:approve)
//   - projectGrantsToCoarse: `module:action`      (e.g. finance:approve)
//   - projectGrantsToFlat:   both (kept for callers that want the union)
//
// The bridge emits the FINE form so the frontend matcher (permission-match.ts)
// can keep coarse gates working (prefix-match) while fine gates stay precise —
// no spurious coarse key to leak across a module's features. Kept pure +
// dependency-free so they are unit-tested directly (parity gate).
// ─────────────────────────────────────────────────────────────────────────────

export interface RbacGrantLike {
  feature_key: string;
  actions: string[] | null | undefined;
}

/** Iterate (featureKey, moduleKey, action) over well-formed grant/action pairs. */
function eachGrantAction(grants: readonly RbacGrantLike[], fn: (featureKey: string, moduleKey: string, action: string) => void): void {
  for (const g of grants ?? []) {
    const featureKey = (g?.feature_key ?? "").trim();
    if (!featureKey) continue;
    const moduleKey = featureKey.split(".")[0];
    const actions = Array.isArray(g?.actions) ? g.actions : [];
    for (const raw of actions) {
      const action = String(raw ?? "").trim();
      if (!action) continue;
      fn(featureKey, moduleKey, action);
    }
  }
}

/** Fine keys only: `feature_key:action`. */
export function projectGrantsToFine(grants: readonly RbacGrantLike[]): string[] {
  const out = new Set<string>();
  eachGrantAction(grants, (featureKey, _m, action) => out.add(`${featureKey}:${action}`));
  return [...out];
}

/** Coarse keys only: `module:action`. */
export function projectGrantsToCoarse(grants: readonly RbacGrantLike[]): string[] {
  const out = new Set<string>();
  eachGrantAction(grants, (_f, moduleKey, action) => { if (moduleKey) out.add(`${moduleKey}:${action}`); });
  return [...out];
}

/** Both coarse `module:action` and fine `feature_key:action`, de-duplicated. */
export function projectGrantsToFlat(grants: readonly RbacGrantLike[]): string[] {
  const out = new Set<string>();
  eachGrantAction(grants, (featureKey, moduleKey, action) => {
    if (moduleKey) out.add(`${moduleKey}:${action}`);
    out.add(`${featureKey}:${action}`);
  });
  return [...out];
}
