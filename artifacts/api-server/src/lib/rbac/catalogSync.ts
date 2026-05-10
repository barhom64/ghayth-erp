/**
 * catalogSync — pushes the in-code FEATURE_CATALOG into the
 * feature_catalog DB table on boot so the admin UI can render the
 * tree without re-reading the source. Idempotent UPSERT.
 */

import { rawExecute } from "../rawdb.js";
import { FEATURE_CATALOG } from "./featureCatalog.js";

export async function syncFeatureCatalog(): Promise<{ upserted: number }> {
  let upserted = 0;
  for (const f of FEATURE_CATALOG) {
    await rawExecute(
      `INSERT INTO feature_catalog
         (feature_key, parent_key, module_key, label_ar, label_en, description_ar, icon,
          available_actions, available_scopes, sensitive_fields, approvable_actions,
          display_order, is_self_service, is_system_critical)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (feature_key) DO UPDATE SET
         parent_key = EXCLUDED.parent_key,
         module_key = EXCLUDED.module_key,
         label_ar = EXCLUDED.label_ar,
         label_en = EXCLUDED.label_en,
         description_ar = EXCLUDED.description_ar,
         icon = EXCLUDED.icon,
         available_actions = EXCLUDED.available_actions,
         available_scopes = EXCLUDED.available_scopes,
         sensitive_fields = EXCLUDED.sensitive_fields,
         approvable_actions = EXCLUDED.approvable_actions,
         display_order = EXCLUDED.display_order,
         is_self_service = EXCLUDED.is_self_service,
         is_system_critical = EXCLUDED.is_system_critical
       RETURNING id`,
      [
        f.key,
        f.parentKey ?? null,
        f.moduleKey,
        f.labelAr,
        f.labelEn ?? null,
        f.descriptionAr ?? null,
        f.icon ?? null,
        f.availableActions,
        f.availableScopes,
        f.sensitiveFields ?? [],
        f.approvableActions ?? [],
        f.displayOrder ?? 100,
        f.selfService ?? false,
        f.systemCritical ?? false,
      ]
    ).catch(() => undefined);
    upserted++;
  }
  return { upserted };
}
