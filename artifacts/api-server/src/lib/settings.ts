import { rawQuery, rawExecute } from "./rawdb.js";

export type SettingScope = "system" | "company" | "branch";

export interface Setting {
  id: number;
  scope: SettingScope;
  scopeId: number | null;
  key: string;
  value: unknown;
  updatedAt: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeObjects(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (isPlainObject(v) && isPlainObject(result[k])) {
      result[k] = mergeObjects(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export async function resolveSettings(
  key: string,
  companyId?: number,
  branchId?: number
): Promise<unknown> {
  const rows = await rawQuery<Setting>(
    `SELECT scope, "scopeId", value FROM settings WHERE key = $1
     AND (
       (scope = 'system' AND "scopeId" IS NULL)
       OR (scope = 'company' AND "scopeId" = $2)
       OR (scope = 'branch' AND "scopeId" = $3)
     )
     ORDER BY CASE scope WHEN 'system' THEN 1 WHEN 'company' THEN 2 WHEN 'branch' THEN 3 END`,
    [key, companyId ?? null, branchId ?? null]
  );

  if (rows.length === 0) return undefined;

  let merged: unknown = rows[0].value;
  for (let i = 1; i < rows.length; i++) {
    const next = rows[i].value;
    if (isPlainObject(merged) && isPlainObject(next)) {
      merged = mergeObjects(merged, next);
    } else {
      merged = next;
    }
  }
  return merged;
}

export async function getSettingsByScope(
  scope: SettingScope,
  scopeId: number | null
): Promise<Setting[]> {
  if (scopeId === null) {
    return rawQuery<Setting>(
      `SELECT * FROM settings WHERE scope = $1 AND "scopeId" IS NULL ORDER BY key`,
      [scope]
    );
  }
  return rawQuery<Setting>(
    `SELECT * FROM settings WHERE scope = $1 AND "scopeId" = $2 ORDER BY key`,
    [scope, scopeId]
  );
}

export async function upsertSetting(
  scope: SettingScope,
  scopeId: number | null,
  key: string,
  value: unknown
): Promise<void> {
  if (scopeId === null) {
    await rawExecute(
      `INSERT INTO settings (scope, "scopeId", key, value)
       VALUES ($1, NULL, $2, $3::jsonb)
       ON CONFLICT (scope, key) WHERE "scopeId" IS NULL
       DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [scope, key, JSON.stringify(value)]
    );
  } else {
    await rawExecute(
      `INSERT INTO settings (scope, "scopeId", key, value)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (scope, "scopeId", key) WHERE "scopeId" IS NOT NULL
       DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [scope, scopeId, key, JSON.stringify(value)]
    );
  }
}

export async function deleteSetting(
  scope: SettingScope,
  scopeId: number | null,
  key: string
): Promise<void> {
  if (scopeId === null) {
    await rawExecute(
      `DELETE FROM settings WHERE scope = $1 AND "scopeId" IS NULL AND key = $2`,
      [scope, key]
    );
  } else {
    await rawExecute(
      `DELETE FROM settings WHERE scope = $1 AND "scopeId" = $2 AND key = $3`,
      [scope, scopeId, key]
    );
  }
}
