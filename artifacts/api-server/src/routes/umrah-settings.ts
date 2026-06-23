// ─────────────────────────────────────────────────────────────────────────────
// umrah-settings.ts — UMRAH SETTINGS POLICIES (U-07 Phase 18)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(settingsRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/settings/policies...).
//
// Pure code move — handlers + RBAC are carried over VERBATIM (no behaviour
// change). Audit calls converted to auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not use the
// legacy direct audit helper.
//
// Ledger-free: the GET reads the shared key-value `settings` table; the PUT
// persists per-category policy values through the `upsertSetting` SERVICE
// helper (the settings track owns the table — this is a service contract call,
// not a raw cross-domain write). No GL posting, no journal lines.
//
// Routes owned here:
//   GET /settings/policies
//   PUT /settings/policies/:categoryId
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  zodParse,
} from "../lib/errorHandler.js";
import { auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { UMRAH_POLICY_CATEGORIES, ALL_POLICY_IDS } from "../lib/umrahSettingsPoliciesCatalog.js";
import { upsertSetting } from "../lib/settings.js";

const router = Router();

// §8 Phase 2 of #1870 — Settings Policies Catalog (11 categories).
// Surfaces every umrah policy + its current value in one payload.
// Companion PUT handles per-category saves through the existing
// `settings` table (key pattern `umrah.<categoryId>.<fieldKey>`).
router.get("/settings/policies", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    // Resolve all umrah.* settings in one round-trip. The shared
    // resolveSettings helper takes one key at a time + handles
    // precedence on its own; for this catalog (dozens of keys per
    // call) we'd rather do a single SELECT. Same precedence rule
    // (system < company) reproduced inline so the read stays
    // consistent with the rest of the platform.
    const keys: string[] = [];
    for (const cat of UMRAH_POLICY_CATEGORIES) {
      for (const f of cat.fields) {
        keys.push(`umrah.${cat.id}.${f.key}`);
      }
    }
    const settingsRows = await rawQuery<{ key: string; scope: string; value: unknown }>(
      `SELECT key, scope, value FROM settings
        WHERE key = ANY($1::text[])
          AND (
            (scope = 'system' AND "scopeId" IS NULL)
            OR (scope = 'company' AND "scopeId" = $2)
          )
        ORDER BY CASE scope WHEN 'system' THEN 1 WHEN 'company' THEN 2 END`,
      [keys, scope.companyId],
    );
    const current: Record<string, unknown> = {};
    for (const r of settingsRows) current[r.key] = r.value;

    const data = UMRAH_POLICY_CATEGORIES.map((cat) => {
      const fields = cat.fields.map((f) => {
        const fullKey = `umrah.${cat.id}.${f.key}`;
        const raw = current[fullKey];
        return {
          ...f,
          fullKey,
          // null → operator hasn't set; effective value falls back to
          // the catalog default so the FE renders a populated input.
          currentValue: raw === undefined ? null : raw,
          effectiveValue: raw === undefined ? (f.defaultValue ?? null) : raw,
        };
      });
      const configuredCount = fields.filter((f) => f.currentValue !== null).length;
      const status: "configured" | "default" | "missing" =
        configuredCount === 0 ? "default"
        : configuredCount === fields.length ? "configured"
        : "missing";
      return { ...cat, fields, status, configuredCount };
    });
    res.json({ data });
  } catch (err) { handleRouteError(err, res, "Settings policies catalog"); }
});

const savePolicySchema = z.object({
  values: z.record(z.string(), z.union([
    z.number(), z.boolean(), z.string(), z.null(),
  ])),
});

router.put("/settings/policies/:categoryId", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const categoryId = String(req.params.categoryId);
    if (!ALL_POLICY_IDS.includes(categoryId)) {
      throw new NotFoundError("الفئة غير موجودة");
    }
    const cat = UMRAH_POLICY_CATEGORIES.find((c) => c.id === categoryId)!;
    const b = zodParse(savePolicySchema.safeParse(req.body));
    // Whitelist guard — only keys that exist in the category's
    // schema are accepted. An unknown key would land as a dead
    // settings row otherwise.
    const knownKeys = new Set(cat.fields.map((f) => f.key));
    for (const k of Object.keys(b.values)) {
      if (!knownKeys.has(k)) {
        throw new ValidationError(`الحقل "${k}" غير معروف في فئة "${cat.title}"`, { field: k });
      }
    }
    // Save each provided value. Null means "clear the override and
    // fall back to the system default" — upsertSetting persists the
    // null and resolveSettings treats it as undefined on read.
    for (const [k, v] of Object.entries(b.values)) {
      await upsertSetting("company", scope.companyId, `umrah.${categoryId}.${k}`, v);
    }
    auditFromRequest(req, "update", "umrah_settings_policies", 0, {
      after: { categoryId, keys: Object.keys(b.values) },
    }).catch((e) => logger.error(e, "policy save audit failed"));
    res.json({ ok: true, categoryId, updated: Object.keys(b.values).length });
  } catch (err) { handleRouteError(err, res, "Save policy"); }
});

export default router;
