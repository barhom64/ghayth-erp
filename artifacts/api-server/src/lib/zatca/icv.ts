/**
 * Invoice Counter Value (ICV) — monotonically-increasing per-company
 * counter required by ZATCA Phase 2. Each invoice (Standard or
 * Simplified) gets the next number; the counter NEVER resets, even
 * across years or after the seller's CSID rotates.
 *
 * Concurrency: read+update inside a transaction with row-level lock
 * (`FOR UPDATE`) so two concurrent invoice creations don't both grab
 * the same number. The unique index on (companyId, zatcaIcv) catches
 * any drift if a future caller forgets the lock.
 *
 * Storage: `zatca_icv_counters` table (created in migration 139).
 */
import { rawQuery, rawExecute } from "../rawdb.js";

/**
 * Reserve the next ICV for a company and return it. Must run inside a
 * transaction (the caller is responsible for the BEGIN/COMMIT) so the
 * SELECT FOR UPDATE actually serializes.
 *
 * Usage:
 *   await withTransaction(async () => {
 *     const icv = await reserveNextIcv(scope.companyId);
 *     // … build XML using icv …
 *     // … insert invoice with zatcaIcv = icv …
 *   });
 */
export async function reserveNextIcv(companyId: number): Promise<bigint> {
  // First read+lock the existing counter, or insert a fresh one at 0.
  const rows = await rawQuery<{ lastIcv: string }>(
    `SELECT "lastIcv"::text AS "lastIcv" FROM zatca_icv_counters WHERE "companyId" = $1 FOR UPDATE`,
    [companyId],
  );

  if (rows.length === 0) {
    // First-ever invoice for this company: insert a row at 1 in one
    // step. ON CONFLICT DO NOTHING + a re-read covers the rare race
    // where another tx inserted the same row between SELECT and INSERT.
    await rawExecute(
      `INSERT INTO zatca_icv_counters ("companyId", "lastIcv", "updatedAt")
       VALUES ($1, 1, NOW())
       ON CONFLICT ("companyId") DO UPDATE
         SET "lastIcv" = zatca_icv_counters."lastIcv" + 1,
             "updatedAt" = NOW()`,
      [companyId],
    );
    const [row] = await rawQuery<{ lastIcv: string }>(
      `SELECT "lastIcv"::text AS "lastIcv" FROM zatca_icv_counters WHERE "companyId" = $1`,
      [companyId],
    );
    return BigInt(row.lastIcv);
  }

  // Existing counter: bump and return.
  const next = BigInt(rows[0].lastIcv) + 1n;
  await rawExecute(
    `UPDATE zatca_icv_counters SET "lastIcv" = $1, "updatedAt" = NOW() WHERE "companyId" = $2`,
    [next.toString(), companyId],
  );
  return next;
}

/**
 * Read the current ICV without bumping. Useful for diagnostics and
 * for the onboarding screen ("you have issued N invoices so far").
 */
export async function currentIcv(companyId: number): Promise<bigint> {
  const rows = await rawQuery<{ lastIcv: string }>(
    `SELECT "lastIcv"::text AS "lastIcv" FROM zatca_icv_counters WHERE "companyId" = $1`,
    [companyId],
  );
  if (rows.length === 0) return 0n;
  return BigInt(rows[0].lastIcv);
}
