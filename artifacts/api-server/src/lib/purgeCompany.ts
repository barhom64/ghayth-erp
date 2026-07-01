import type { PoolClient } from "pg";

/**
 * Hard-delete one or more entire companies (tenants) and EVERY row that belongs
 * to them, across the whole schema, in a single caller-supplied transaction.
 *
 * Why this exists:
 *   `DELETE FROM companies WHERE id=$1` (the plain settings delete) fails the
 *   moment a company has any child data, because ~half of the FKs that point at
 *   `companies` are ON DELETE NO ACTION (not CASCADE). Old/duplicate companies
 *   that have been used at all therefore cannot be removed through the normal
 *   route. This module clears the dependent rows in FK-safe order first, then
 *   removes the company row itself.
 *
 * How it works (schema-driven, adapts to the live DB — no hardcoded table list):
 *   1. Enumerate every table with a `companyId` column.
 *   2. Enumerate every NO-`companyId` child table whose single-column FK points
 *      at one of those companyId tables (these would otherwise block the parent
 *      delete, e.g. journal_lines → journal_entries).
 *   3. Run all the DELETEs in a retry loop: each statement is wrapped in a
 *      SAVEPOINT, and a foreign-key violation (23503) just defers that table to
 *      the next pass. The loop keeps going until everything is gone or no pass
 *      makes progress (a genuine cycle → throw, nothing committed).
 *   4. Finally remove the `companies` rows.
 *
 * Safety:
 *   - Company id 1 (the holding/group company) is hard-protected and can never
 *     be purged.
 *   - Only ids passed explicitly by the caller are touched; everything is
 *     scoped by `"companyId" = ANY($ids)` so sibling companies are never hit.
 *   - Runs inside ONE transaction supplied by the caller, so a failure leaves
 *     the database exactly as it was.
 */

const PROTECTED_COMPANY_IDS = new Set<number>([1]);

// Identifiers come from the system catalogs (trusted), but we still assert a
// strict shape before interpolating them into SQL — defence in depth.
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`identifier rejected: ${name}`);
  }
  return `"${name}"`;
}

export function assertPurgeable(companyIds: unknown): number[] {
  const arr = Array.isArray(companyIds) ? companyIds : [];
  const ids = Array.from(new Set(arr.map((x) => Number(x))));
  if (ids.length === 0) throw new Error("لم تُحدَّد أي شركة للحذف");
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`معرّف شركة غير صالح: ${id}`);
    if (PROTECTED_COMPANY_IDS.has(id)) {
      throw new Error(`الشركة رقم ${id} محميّة (المجموعة الأم) ولا يمكن حذفها`);
    }
  }
  return ids;
}

async function companyIdTables(client: PoolClient): Promise<string[]> {
  // relkind='r' → ordinary base tables only (excludes views/matviews, which
  // also surface a companyId column but cannot be deleted from).
  const r = await client.query<{ table_name: string }>(
    `SELECT c.relname AS table_name
     FROM pg_attribute att
     JOIN pg_class c ON c.oid = att.attrelid
     WHERE att.attname = 'companyId'
       AND att.attnum > 0 AND NOT att.attisdropped
       AND c.relkind = 'r'
       AND c.relnamespace = 'public'::regnamespace
     ORDER BY c.relname`,
  );
  return r.rows.map((x) => x.table_name);
}

interface BlockerChild {
  child: string;
  fkcol: string;
  parent: string;
  parentpk: string;
}

async function blockingChildren(
  client: PoolClient,
  companyTables: string[],
): Promise<BlockerChild[]> {
  const r = await client.query<BlockerChild>(
    `SELECT child.relname AS child,
            ca.attname  AS fkcol,
            parent.relname AS parent,
            pa.attname  AS parentpk
     FROM pg_constraint con
     JOIN pg_class child  ON child.oid  = con.conrelid
     JOIN pg_class parent ON parent.oid = con.confrelid
     JOIN pg_attribute ca ON ca.attrelid = con.conrelid  AND ca.attnum = con.conkey[1]
     JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
     WHERE con.contype = 'f'
       AND array_length(con.conkey, 1) = 1
       AND child.relnamespace = 'public'::regnamespace
       AND parent.relname = ANY($1::text[])
       AND NOT (child.relname = ANY($1::text[]))`,
    [companyTables],
  );
  return r.rows;
}

export interface PurgePreview {
  rows: { table: string; count: number }[];
  total: number;
}

export async function previewCompanyPurge(
  client: PoolClient,
  companyIds: unknown,
): Promise<PurgePreview> {
  const ids = assertPurgeable(companyIds);
  const tables = await companyIdTables(client);
  const blockers = await blockingChildren(client, tables);

  const parts: string[] = [];
  for (const t of tables) {
    parts.push(`SELECT '${t}' AS t, count(*) AS c FROM ${ident(t)} WHERE "companyId" = ANY($1::int[])`);
  }
  for (const b of blockers) {
    parts.push(
      `SELECT '${b.child}' AS t, count(*) AS c FROM ${ident(b.child)} ` +
        `WHERE ${ident(b.fkcol)} IN (SELECT ${ident(b.parentpk)} FROM ${ident(b.parent)} WHERE "companyId" = ANY($1::int[]))`,
    );
  }
  const sql = `SELECT t, sum(c)::bigint AS c FROM (${parts.join(" UNION ALL ")}) x GROUP BY t HAVING sum(c) > 0 ORDER BY c DESC, t`;
  const r = await client.query<{ t: string; c: string }>(sql, [ids]);
  const rows = r.rows.map((x) => ({ table: x.t, count: Number(x.c) }));
  const total = rows.reduce((a, b) => a + b.count, 0);
  return { rows, total };
}

export interface PurgeResult {
  companyIds: number[];
  deleted: Record<string, number>;
  total: number;
  passes: number;
}

export async function purgeCompanies(
  client: PoolClient,
  companyIds: unknown,
): Promise<PurgeResult> {
  const ids = assertPurgeable(companyIds);
  const tables = await companyIdTables(client);
  const blockers = await blockingChildren(client, tables);

  interface Op { table: string; key: string; sql: string }
  const ops: Op[] = [];
  for (const t of tables) {
    ops.push({ table: t, key: `co:${t}`, sql: `DELETE FROM ${ident(t)} WHERE "companyId" = ANY($1::int[])` });
  }
  for (const b of blockers) {
    ops.push({
      table: b.child,
      key: `fk:${b.child}.${b.fkcol}->${b.parent}`,
      sql:
        `DELETE FROM ${ident(b.child)} WHERE ${ident(b.fkcol)} IN ` +
        `(SELECT ${ident(b.parentpk)} FROM ${ident(b.parent)} WHERE "companyId" = ANY($1::int[]))`,
    });
  }

  const deleted: Record<string, number> = {};
  let remaining = ops.slice();
  let pass = 0;
  const MAX_PASSES = 40;

  while (remaining.length > 0 && pass < MAX_PASSES) {
    pass++;
    const next: Op[] = [];
    let progressed = false;
    for (const op of remaining) {
      await client.query("SAVEPOINT pp");
      try {
        const r = await client.query(op.sql, [ids]);
        await client.query("RELEASE SAVEPOINT pp");
        if (r.rowCount && r.rowCount > 0) {
          deleted[op.table] = (deleted[op.table] ?? 0) + r.rowCount;
        }
        progressed = true;
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT pp");
        const code = (e as { code?: string })?.code;
        if (code === "23503") {
          next.push(op); // FK violation → a child still references these rows; retry next pass
        } else if (code === "42P01" || code === "42703") {
          // table or column not present in this DB — skip silently
        } else {
          throw e;
        }
      }
    }
    remaining = next;
    if (!progressed && remaining.length > 0) {
      throw new Error(
        `تعذّر إكمال الحذف — علاقات متبقّية بعد ${pass} محاولات: ` +
          remaining.map((o) => o.key).slice(0, 20).join(", "),
      );
    }
  }
  if (remaining.length > 0) {
    throw new Error(`تجاوز الحد الأقصى للمحاولات (${MAX_PASSES})`);
  }

  await client.query("SAVEPOINT ppc");
  try {
    const r = await client.query(`DELETE FROM companies WHERE id = ANY($1::int[])`, [ids]);
    await client.query("RELEASE SAVEPOINT ppc");
    if (r.rowCount && r.rowCount > 0) deleted["companies"] = r.rowCount;
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT ppc");
    throw e;
  }

  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  return { companyIds: ids, deleted, total, passes: pass };
}
