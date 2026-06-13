import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { invalidatePermissionCache } from "../middlewares/permissionMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { projectGrantsToFine } from "../lib/rbac/flatProjection.js";
import { getActiveDelegationsFor, delegationCoversFeature } from "../lib/rbac/delegationService.js";
import { auditLog } from "../lib/audit.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import {
  ROLE_MODULE_DEFAULTS,
  canonicalizeModules,
} from "../lib/rbac/roleModulesCatalog.js";

const router = Router();

interface RoleSummaryRow {
  roleKey: string;
  label: string;
  modules: unknown;
  level: number;
}

interface PermissionNameRow {
  permission: string;
}

interface UserPermissionRow {
  permission: string;
  type: "grant" | "revoke";
}

interface RolePermissionRow {
  id: number;
  role: string;
  permission: string;
  companyId: number | null;
  createdAt: string;
  updatedAt: string | null;
}

interface UserPermissionFullRow {
  id: number;
  userId: number;
  permission: string;
  type: "grant" | "revoke";
  companyId: number | null;
  grantedBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  userName: string | null;
}

interface UserIdRow {
  id: number;
}

const PERMISSION_PATTERN = /^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$/;

const rolePermissionSchema = z.object({
  role: z.string().min(1, "الدور مطلوب"),
  permission: z.string().min(1, "الصلاحية مطلوبة").regex(PERMISSION_PATTERN, "صيغة الصلاحية غير صالحة — يجب أن تكون module:action"),
});

const userPermissionCreateSchema = z.object({
  userId: z.coerce.number().int().positive("معرف المستخدم مطلوب"),
  permission: z.string().min(1, "الصلاحية مطلوبة").regex(PERMISSION_PATTERN, "صيغة الصلاحية غير صالحة — يجب أن تكون module:action"),
  type: z.enum(["grant", "revoke"]).optional(),
});

const userPermissionDeleteSchema = z.object({
  userId: z.coerce.number().int().positive("معرف المستخدم مطلوب"),
  permission: z.string().min(1, "الصلاحية مطلوبة"),
});

// PR-2 / #2163 — re-export from the single source so this map and
// roleGuard's ROLE_DEFAULT_MODULES can never drift apart again. The
// old duplicate-by-hand layout was the FU-1-style root cause from the
// audit (#2166 §8): PR-9a added two roles here in roleGuard but the
// hand-copy here didn't keep up — sidebar fallback fell back to the
// stale map.
const PREDEFINED_ROLE_DEFAULTS = ROLE_MODULE_DEFAULTS;

function parseModules(raw: unknown, roleKey?: string): string[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as any).all === true) {
    const predefined = PREDEFINED_ROLE_DEFAULTS[roleKey || "owner"];
    return predefined ? predefined.modules : PREDEFINED_ROLE_DEFAULTS.owner.modules;
  }
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.all === true) {
        const predefined = PREDEFINED_ROLE_DEFAULTS[roleKey || "owner"];
        return predefined ? predefined.modules : PREDEFINED_ROLE_DEFAULTS.owner.modules;
      }
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) { logger.warn(e, "failed to parse permission modules JSON"); return []; }
  }
  return [];
}

// `/my` returns the caller's own effective permission set — this is a
// self-introspection endpoint that every authenticated user must be
// able to call regardless of role. Gating it on `admin:list` broke the
// header role picker: switching to a non-admin role made this endpoint
// 403, the frontend `apiData` never refreshed, and the UI got stuck.
// authMiddleware already guarantees the caller is authenticated, and
// the response is scoped to `scope.userId` / `scope.companyId`.
router.get("/my", async (req, res) => {
  try {
    const scope = req.scope!;
    // Header "تغيير الصفة" picker — narrow to the picked role when set.
    const requestedRole = scope.selectedRoleKey
      ?? (typeof req.query.role === "string" && req.query.role.trim()
        ? req.query.role.trim()
        : null);

    // Roles now come from RBAC v2 (rbac_user_roles → rbac_roles) ONLY — the
    // legacy user_roles / role_permissions tables are no longer read here.
    // Falls back to the scope role's PREDEFINED defaults only when the user has
    // no RBAC roles, so navigation is never locked out. (#1413 — single system)
    let roles: RoleSummaryRow[] = [];
    try {
      const rr = await rawQuery<{ role_key: string; label_ar: string; level: number }>(
        `SELECT DISTINCT r.role_key, r.label_ar, r.level
           FROM rbac_user_roles ur JOIN rbac_roles r ON r.id = ur.role_id
          WHERE ur."userId" = $1 AND ur."companyId" = $2
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          ORDER BY r.level DESC`,
        [scope.userId, scope.companyId]
      );
      roles = rr.map((x) => ({ roleKey: x.role_key, label: x.label_ar || x.role_key, modules: [], level: Number(x.level) || 10 }));
    } catch (e) { logger.warn(e, "[permissions/my] RBAC roles load failed"); }

    if (roles.length === 0) {
      const roleKey = scope.role || "employee";
      const predefined = PREDEFINED_ROLE_DEFAULTS[roleKey];
      roles = [{ roleKey, label: roleKey, modules: predefined ? predefined.modules : ["home"], level: predefined ? predefined.level : 10 }];
    }

    if (requestedRole) {
      const picked = roles.filter((r) => r.roleKey === requestedRole);
      if (picked.length > 0) roles = picked;
    }

    // Sidebar modules = moduleKeys of the (picker-narrowed) roles' RBAC grants,
    // plus any PREDEFINED-fallback modules. Scoped to the selected roles so the
    // picker actually narrows the sidebar.
    const rbacModules: string[] = [];
    try {
      const gm = await rawQuery<{ feature_key: string }>(
        `SELECT DISTINCT g.feature_key
           FROM rbac_user_roles ur JOIN rbac_roles r ON r.id = ur.role_id
           JOIN rbac_role_grants g ON g.role_id = ur.role_id
          WHERE ur."userId" = $1 AND ur."companyId" = $2
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            AND r.role_key = ANY($3::text[])`,
        [scope.userId, scope.companyId, roles.map((r) => r.roleKey)]
      );
      const ALL_MODULES = PREDEFINED_ROLE_DEFAULTS.owner.modules;
      for (const x of gm) {
        if (x.feature_key === "*") { rbacModules.push(...ALL_MODULES); continue; }
        rbacModules.push(x.feature_key.split(".")[0]);
      }
    } catch (e) { logger.warn(e, "[permissions/my] RBAC modules derive skipped"); }

    const highestLevel = Math.max(0, ...roles.map((r) => Number(r.level) || 0));
    // PR-2 / #2163 — canonicalize the dynamic projection. The split_part
    // above yields feature-key first-segment names (e.g. "dashboard",
    // "properties", "projects", "communications") which differ from the
    // nav-registry vocabulary ("home", "property", "operations", "comms").
    // canonicalizeModules collapses them so the sidebar filter agrees
    // with requireModule. PR-0 §8 caught this drift live.
    const allModules = canonicalizeModules([
      ...roles.flatMap((r) => parseModules(r.modules, r.roleKey)),
      ...rbacModules,
    ]);

    // Per-user explicit overrides now live in RBAC v2 (rbac_user_grants),
    // enforced by authzEngine. Mirror them here as grant/revoke (feature.action
    // form) so UI button visibility matches enforcement. (#1791 — legacy
    // `permissions` table removed)
    const userPermRows = await rawQuery<{ feature_key: string; action: string; type: string }>(
      `SELECT feature_key, action, type FROM rbac_user_grants
        WHERE "userId" = $1 AND "companyId" = $2
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [scope.userId, scope.companyId]
    ).catch((e) => { logger.error(e, "permissions query failed"); return [] as { feature_key: string; action: string; type: string }[]; });
    const grants = userPermRows.filter((p) => p.type === "grant").map((p) => `${p.feature_key}.${p.action}`);
    const revokes = new Set(userPermRows.filter((p) => p.type === "revoke").map((p) => `${p.feature_key}.${p.action}`));

    // ── Unified authorization bridge (Ghaith Operating Foundation, #1413) ──
    // The backend ENFORCES with RBAC v2 (rbac_role_grants, feature.action) but
    // the frontend `can()` historically reads only the legacy flat set
    // (role_permissions, module:action) — two parallel sources of truth, the
    // root of "weak / inflexible roles". Here we project the caller's RBAC v2
    // grants (fine `feature.action` form) and UNION them in, so editing a role
    // in the RBAC v2 editor now also drives which buttons appear. The frontend
    // matcher keeps coarse gates working by prefix-matching the fine keys.
    // Strictly additive: it can only widen UI visibility to match what the
    // backend already allows (never hides a currently-shown action), and any
    // failure degrades silently to the legacy set — /permissions/my is
    // load-bearing for the whole UI, so it must never throw here.
    let rbacProjected: string[] = [];
    try {
      const grantRows = await rawQuery<{ feature_key: string; actions: string[] }>(
        `SELECT g.feature_key, g.actions
           FROM rbac_user_roles ur
           JOIN rbac_roles r ON r.id = ur.role_id
           JOIN rbac_role_grants g ON g.role_id = r.id
          WHERE ur."userId" = $1 AND ur."companyId" = $2
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            AND r.role_key = ANY($3::text[])`,
        [scope.userId, scope.companyId, roles.map((r) => r.roleKey)]
      );
      // Fine-only projection: the frontend matcher keeps coarse gates working
      // by prefix-matching these, while fine gates stay precise (no coarse key
      // to leak across a module). الخطة الجذرية §3 م4.
      rbacProjected = projectGrantsToFine(grantRows);
    } catch (e) {
      logger.warn(e, "[permissions/my] RBAC v2 projection skipped — using legacy set only");
    }

    // Delegation visibility: a delegate inherits the delegator's grants on the
    // COVERED features for the active window. The backend (authzEngine) already
    // ENFORCES this; here we surface it so the UI shows the delegated actions
    // too — otherwise the delegate's buttons would stay hidden while the action
    // is actually permitted ("الإظهار/الإخفاء حسب نظام التفويض", #1413). Additive
    // + best-effort: no active delegation ⇒ no-op; any failure degrades silently.
    const delegatedProjected: string[] = [];
    try {
      const delegations = await getActiveDelegationsFor(scope.companyId, scope.employeeId ?? null);
      for (const d of delegations) {
        if (!d.delegatorUserId) continue;
        const dGrants = await rawQuery<{ feature_key: string; actions: string[] }>(
          `SELECT g.feature_key, g.actions
             FROM rbac_user_roles ur
             JOIN rbac_roles r ON r.id = ur.role_id
             JOIN rbac_role_grants g ON g.role_id = r.id
            WHERE ur."userId" = $1 AND ur."companyId" = $2
              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
          [d.delegatorUserId, scope.companyId]
        );
        const covered = dGrants.filter((g) =>
          delegationCoversFeature(d.features, g.feature_key, (g.feature_key || "").split(".")[0]));
        delegatedProjected.push(...projectGrantsToFine(covered));
      }
    } catch (e) {
      logger.warn(e, "[permissions/my] delegation projection skipped");
    }

    const grantedPerms = Array.from(new Set([...grants, ...rbacProjected, ...delegatedProjected])).filter((p) => !revokes.has(p));

    // VIS-002 (Ghaith Operating Foundation): partial activation. Return the
    // company's explicitly DISABLED feature keys so the frontend can hide
    // unsubscribed tracks/services. Default-ON: any failure or empty table
    // yields [] ⇒ everything stays enabled (no behaviour change).
    const disabledRows = await rawQuery<{ feature_key: string }>(
      `SELECT feature_key FROM company_feature_flags WHERE "companyId" = $1 AND enabled = false`,
      [scope.companyId]
    ).catch(() => [] as { feature_key: string }[]);
    const disabledFeatures = disabledRows.map((r) => r.feature_key);

    res.json(maskFields(req, {
      userId: scope.userId,
      roles,
      highestLevel,
      modules: allModules,
      permissions: grantedPerms,
      disabledFeatures,
    }));
  } catch (err) {
    handleRouteError(err, res, "Get my permissions error:");
  }
});

// Legacy /role-permissions and /user-permissions CRUD removed in #1791.
// Role permissions are now RBAC v2 grants (rbac_role_grants) and per-user
// overrides are rbac_user_grants — both managed through the /api/admin/rbac/v2
// editor and enforced by authzEngine. The rolePermissionSchema /
// userPermission*Schema consts and RolePermissionRow / UserPermissionFullRow /
// UserIdRow types above are now unused (kept harmless; noUnusedLocals is off).

export default router;
