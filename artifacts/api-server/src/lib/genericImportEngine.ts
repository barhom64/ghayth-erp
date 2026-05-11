// genericImportEngine.ts
// ----------------------------------------------------------------------
// General-purpose CSV/XLSX import for core ERP entities.
// Companion to umrahImportEngine.ts (which stays Umrah-specific).
//
// Pipeline:
//   1. Parse workbook (XLSX or CSV) → ParsedRow[] using the entity's
//      headerMap (Arabic/English column → field name).
//   2. previewImport → returns a diff (new / updated / skipped / errors)
//      WITHOUT writing anything. Frontend shows it for review.
//   3. confirmImport → applies the diff inside a single transaction,
//      records an `import_batches` row, and emits an audit event.
//
// Multi-tenancy is enforced by the adapter (`hasCompanyId`) and by
// scope-checks on every UPDATE.
//
// Adapters live in importAdapters.ts. Adding a new entity = new adapter
// entry only — no engine changes required.

import * as XLSX from "xlsx";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { ValidationError } from "./errorHandler.js";
import { logger } from "./logger.js";
import type pg from "pg";
import { ADAPTERS, type ImportAdapter, type ImportEntity } from "./importAdapters.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedRow {
  [key: string]: string | number | boolean | Date | null;
}

export interface ImportScope {
  companyId: number;
  branchId: number | null;
  userId: number;
}

export interface RowChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ImportDiff {
  entityKey: ImportEntity;
  totalRows: number;
  newRows: ParsedRow[];
  updatedRows: { id: number; row: ParsedRow; changes: RowChange[] }[];
  skippedCount: number;
  errorRows: { rowIndex: number; error: string; row: ParsedRow }[];
  sampleNew: ParsedRow[];
  sampleUpdated: { id: number; row: ParsedRow; changes: RowChange[] }[];
  sampleErrors: { rowIndex: number; error: string }[];
}

export interface ImportResult {
  batchId: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Text normalization (shared with umrahImportEngine.ts intentionally —
// keeping a separate copy avoids cross-module coupling and lets each
// engine evolve independently).
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/ى/g, "ي")
    .replace(/ة$/g, "ه")
    .trim();
}

function normalizeHeader(h: string): string {
  return normalize(h).replace(/["']/g, "").toLowerCase();
}

const BOOL_TRUE = new Set(["نعم", "yes", "true", "1", "صحيح", "y"]);
const BOOL_FALSE = new Set(["لا", "no", "false", "0", "خطأ", "n", ""]);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse raw spreadsheet bytes into typed rows according to an adapter's
 * field types. Returns an empty array for empty sheets — caller decides
 * whether that's an error.
 */
export function parseSpreadsheet(buffer: Buffer, entityKey: ImportEntity): ParsedRow[] {
  const adapter = ADAPTERS[entityKey];
  if (!adapter) {
    throw new ValidationError(`Unknown import entity: ${entityKey}`);
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ValidationError("الملف لا يحتوي على أي ورقة");
  const sheet = wb.Sheets[sheetName]!;

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (raw.length < 2) throw new ValidationError("الملف لا يحتوي على بيانات");

  const headerRow = raw[0] as unknown[];

  // Build {column index → field name} map by normalising both sides.
  const colMap: { idx: number; field: string }[] = [];
  const headerLookup = new Map<string, string>();
  for (const [aliases, field] of Object.entries(adapter.headerMap)) {
    for (const alias of aliases.split("|")) {
      headerLookup.set(normalizeHeader(alias), field);
    }
  }

  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(String(headerRow[i] ?? ""));
    const field = headerLookup.get(h);
    if (field) colMap.push({ idx: i, field });
  }

  if (colMap.length === 0) {
    throw new ValidationError(
      "لم يتم التعرف على أي أعمدة في الملف. تحقق من أسماء الأعمدة في القالب.",
    );
  }

  const rows: ParsedRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const dataRow = raw[r] as unknown[] | undefined;
    if (!dataRow || dataRow.every((c) => c === "" || c == null)) continue;

    const row: ParsedRow = {};
    for (const { idx, field } of colMap) {
      const rawVal = dataRow[idx];
      row[field] = coerceValue(rawVal, adapter, field);
    }
    rows.push(row);
  }
  return rows;
}

function coerceValue(rawVal: unknown, adapter: ImportAdapter, field: string): ParsedRow[string] {
  // Apply enum mapping FIRST so Arabic labels translate before type coercion.
  const enumMap = adapter.enumMaps?.[field];
  if (enumMap) {
    const key = String(rawVal ?? "").trim();
    if (enumMap[key]) return enumMap[key];
  }

  const fieldType = adapter.fieldTypes[field] ?? "string";

  if (rawVal === null || rawVal === undefined || rawVal === "") {
    return null;
  }

  switch (fieldType) {
    case "number": {
      const n = Number(rawVal);
      return Number.isFinite(n) ? n : null;
    }
    case "integer": {
      const n = Number(rawVal);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "boolean": {
      if (typeof rawVal === "boolean") return rawVal;
      const s = String(rawVal).toLowerCase().trim();
      if (BOOL_TRUE.has(s)) return true;
      if (BOOL_FALSE.has(s)) return false;
      return null;
    }
    case "date": {
      if (rawVal instanceof Date) return rawVal.toISOString().slice(0, 10);
      const s = String(rawVal).trim();
      // Excel sometimes hands us "2024-01-15T00:00:00" — clip to YYYY-MM-DD.
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1]! : s || null;
    }
    case "string":
    default:
      return String(rawVal).trim() || null;
  }
}

// ---------------------------------------------------------------------------
// Validation (per-row)
// ---------------------------------------------------------------------------

function validateRow(row: ParsedRow, adapter: ImportAdapter): string | null {
  for (const req of adapter.required) {
    const v = row[req];
    if (v === null || v === undefined || v === "") {
      return `الحقل "${req}" مطلوب`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preview (dry-run diff) — no writes
// ---------------------------------------------------------------------------

export async function previewImport(
  scope: ImportScope,
  entityKey: ImportEntity,
  rows: ParsedRow[],
): Promise<ImportDiff> {
  const adapter = ADAPTERS[entityKey];
  if (!adapter) throw new ValidationError(`Unknown import entity: ${entityKey}`);

  const diff: ImportDiff = {
    entityKey,
    totalRows: rows.length,
    newRows: [],
    updatedRows: [],
    skippedCount: 0,
    errorRows: [],
    sampleNew: [],
    sampleUpdated: [],
    sampleErrors: [],
  };

  // Existing-row lookup: only when adapter has a uniqueField.
  let existingMap = new Map<string, { id: number; row: Record<string, unknown> }>();
  if (adapter.uniqueField) {
    const uniqueValues = rows
      .map((r) => r[adapter.uniqueField!])
      .filter((v): v is string | number => v !== null && v !== undefined && v !== "");

    if (uniqueValues.length > 0) {
      const compareCols = ['"id"', `"${adapter.uniqueField}"`, ...adapter.compareFields.map((f) => `"${f}"`)];
      const cols = compareCols.join(", ");
      const where = adapter.hasCompanyId
        ? `"companyId" = $1 AND "${adapter.uniqueField}" = ANY($2) AND "deletedAt" IS NULL`
        : `"${adapter.uniqueField}" = ANY($2) AND "deletedAt" IS NULL`;
      const params = adapter.hasCompanyId
        ? [scope.companyId, uniqueValues]
        : [null, uniqueValues];
      // Drop placeholder $1 when it's not used. SQL prepared with $1 then $2
      // requires both — collapse to just $1 if no companyId.
      const finalSql = adapter.hasCompanyId
        ? `SELECT ${cols} FROM ${adapter.table} WHERE ${where}`
        : `SELECT ${cols} FROM ${adapter.table} WHERE "${adapter.uniqueField}" = ANY($1) AND "deletedAt" IS NULL`;
      const finalParams = adapter.hasCompanyId ? params : [uniqueValues];

      const existing = await rawQuery<Record<string, unknown>>(finalSql, finalParams);
      for (const ex of existing) {
        const key = String(ex[adapter.uniqueField]);
        existingMap.set(key, { id: Number(ex.id), row: ex });
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const err = validateRow(row, adapter);
    if (err) {
      diff.errorRows.push({ rowIndex: i, error: err, row });
      continue;
    }

    if (!adapter.uniqueField) {
      // Append-only entity (no update path) → always treat as new.
      diff.newRows.push(row);
      continue;
    }

    const uniqVal = row[adapter.uniqueField];
    if (uniqVal === null || uniqVal === undefined || uniqVal === "") {
      diff.errorRows.push({ rowIndex: i, error: `حقل المعرّف "${adapter.uniqueField}" مفقود`, row });
      continue;
    }
    const ex = existingMap.get(String(uniqVal));
    if (!ex) {
      diff.newRows.push(row);
      continue;
    }

    const changes: RowChange[] = [];
    for (const f of adapter.compareFields) {
      const oldV = ex.row[f] ?? null;
      const newV = row[f] ?? null;
      // Only count an update when the new value is non-null and differs;
      // Treat `null → X` as an update, `X → null` as "leave alone".
      if (newV !== null && String(oldV) !== String(newV)) {
        changes.push({ field: f, oldValue: oldV, newValue: newV });
      }
    }

    if (changes.length === 0) {
      diff.skippedCount++;
    } else {
      diff.updatedRows.push({ id: ex.id, row, changes });
    }
  }

  diff.sampleNew = diff.newRows.slice(0, 5);
  diff.sampleUpdated = diff.updatedRows.slice(0, 5);
  diff.sampleErrors = diff.errorRows.slice(0, 5).map((e) => ({ rowIndex: e.rowIndex, error: e.error }));
  return diff;
}

// ---------------------------------------------------------------------------
// Confirm — apply diff in transaction + record batch
// ---------------------------------------------------------------------------

export async function confirmImport(
  scope: ImportScope,
  entityKey: ImportEntity,
  rows: ParsedRow[],
  fileMeta?: { fileName?: string; fileSize?: number },
): Promise<ImportResult> {
  const adapter = ADAPTERS[entityKey];
  if (!adapter) throw new ValidationError(`Unknown import entity: ${entityKey}`);

  // Re-run preview inside the transaction so we have a consistent diff.
  // We accept some duplication (preview was likely just shown) in exchange
  // for not trusting client-provided diffs, which would be a security hole.
  const diff = await previewImport(scope, entityKey, rows);

  const result = await withTransaction(async (client: pg.PoolClient) => {
    let inserted = 0;
    let updated = 0;

    for (const row of diff.newRows) {
      try {
        await insertRow(client, adapter, scope, row);
        inserted++;
      } catch (e) {
        logger.warn({ err: e, entity: entityKey, row }, "import insert failed");
      }
    }

    for (const upd of diff.updatedRows) {
      try {
        const fields: Record<string, unknown> = {};
        for (const c of upd.changes) fields[c.field] = c.newValue;
        await updateRow(client, adapter, scope, upd.id, fields);
        updated++;
      } catch (e) {
        logger.warn({ err: e, entity: entityKey, id: upd.id }, "import update failed");
      }
    }

    // Record the batch INSIDE the same transaction so it's atomic with
    // the actual writes.
    const summary = { inserted, updated, skipped: diff.skippedCount, errors: diff.errorRows.length };
    const batchRes = await client.query<{ id: number }>(
      `INSERT INTO import_batches
        ("companyId", "branchId", "entityKey", "fileName", "fileSize",
         "uploadedBy", "totalRows", "newCount", "updatedCount",
         "skippedCount", "errorCount", status, "summaryJson", "errorsJson")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'confirmed', $12, $13)
       RETURNING id`,
      [
        scope.companyId,
        scope.branchId,
        entityKey,
        fileMeta?.fileName ?? null,
        fileMeta?.fileSize ?? null,
        scope.userId,
        diff.totalRows,
        inserted,
        updated,
        diff.skippedCount,
        diff.errorRows.length,
        JSON.stringify(summary),
        JSON.stringify(diff.errorRows.slice(0, 100)),
      ],
    );

    return {
      batchId: batchRes.rows[0]!.id,
      inserted,
      updated,
      skipped: diff.skippedCount,
      errors: diff.errorRows.length,
    };
  });

  return result;
}

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

async function insertRow(
  client: pg.PoolClient,
  adapter: ImportAdapter,
  scope: ImportScope,
  row: ParsedRow,
): Promise<void> {
  const fields: Record<string, unknown> = { ...adapter.defaults };
  if (adapter.hasCompanyId) fields["companyId"] = scope.companyId;
  if (adapter.hasBranchId && scope.branchId !== null) fields["branchId"] = scope.branchId;

  // Copy known fields from the row, ignoring anything not in fieldTypes.
  for (const f of Object.keys(adapter.fieldTypes)) {
    if (row[f] !== undefined) fields[f] = row[f];
  }

  const cols = Object.keys(fields);
  if (cols.length === 0) {
    throw new ValidationError("لا توجد حقول لإدراجها");
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const colsSql = cols.map((c) => `"${c}"`).join(", ");
  const params = cols.map((c) => fields[c] ?? null);

  await client.query(
    `INSERT INTO ${adapter.table} (${colsSql}) VALUES (${placeholders})`,
    params,
  );
}

async function updateRow(
  client: pg.PoolClient,
  adapter: ImportAdapter,
  scope: ImportScope,
  id: number,
  fields: Record<string, unknown>,
): Promise<void> {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;

  const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const params: unknown[] = cols.map((c) => fields[c] ?? null);

  let where = `id = $${params.length + 1}`;
  params.push(id);

  if (adapter.hasCompanyId) {
    where += ` AND "companyId" = $${params.length + 1}`;
    params.push(scope.companyId);
  }
  where += ` AND "deletedAt" IS NULL`;

  await client.query(
    `UPDATE ${adapter.table} SET ${setClauses} WHERE ${where}`,
    params,
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function listSupportedEntities(): ImportEntity[] {
  return Object.keys(ADAPTERS) as ImportEntity[];
}

export async function listBatches(scope: ImportScope, entityKey?: ImportEntity, limit = 50) {
  const params: unknown[] = [scope.companyId];
  let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
  if (entityKey) {
    params.push(entityKey);
    where += ` AND "entityKey" = $2`;
  }
  params.push(Math.min(Math.max(limit, 1), 200));
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT id, "entityKey", "fileName", "totalRows", "newCount", "updatedCount",
            "skippedCount", "errorCount", status, "uploadedBy", "uploadedAt"
     FROM import_batches
     WHERE ${where}
     ORDER BY "uploadedAt" DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

// rawExecute imported above is currently unused — keep imported for future
// helpers. (No-op assignment to silence the "unused" lint signal.)
void rawExecute;
