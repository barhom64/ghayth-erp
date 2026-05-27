/**
 * retention — prune old PDF/Excel artifacts from object storage.
 *
 * Every printed document is uploaded to GCS and the storage key is recorded
 * in print_jobs.pdfStorageKey. Without a retention policy this grows
 * unbounded — a company doing 50 prints/day accumulates ~18k objects/year.
 *
 * This module deletes the BLOB but keeps the print_jobs audit row, so the
 * audit trail (who printed what, when, with which template) stays intact
 * — only the rendered bytes are evicted. Re-prints generate fresh PDFs
 * with the same jobId.
 *
 * Default policy: keep 90 days. Configurable via the runner caller.
 *
 * Safe to run repeatedly — `deletePrintArtifact` ignores missing objects.
 *
 * LEGAL HOLD — documents that fall under Saudi tax/commercial-record
 * retention obligations (ZATCA: 6 years for VAT, Commercial Court Law:
 * 10 years for accounting records) are NEVER pruned regardless of age.
 * Their PDFs are the legal artifact — a regenerated PDF with the current
 * template + current data is NOT an acceptable substitute for an audit,
 * because both can drift after the fact. Keeping the original bytes is
 * the only defensible answer when ZATCA shows up two years later.
 */

import { rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";
import { deletePrintArtifact } from "./printStorage.js";

// Document types where the rendered PDF IS the legal record. These never
// expire from object storage. Anything not on this list (e.g. internal
// memos, label sheets, list-page exports) follows the normal retention
// window. Adding a new type here is a one-way decision — once exempted,
// storage cost climbs forever for that type.
export const LEGAL_RETENTION_ENTITY_TYPES: readonly string[] = [
  "invoice",
  "credit_note",
  "credit_memo",
  "debit_note",
  "debit_memo",
  "pos_receipt",
  "receipt_voucher",
  "payment_voucher",
  "journal_entry",
  "delivery_note",
  "purchase_order",
  "goods_receipt",
  "payroll",
];

export interface PruneResult {
  scanned: number;
  deleted: number;
  failed: number;
  /** Rows whose pdfStorageKey was already null (skipped). */
  alreadyEmpty: number;
  /** Rows skipped because their entityType is under legal hold. */
  legalHoldSkipped: number;
}

export interface PruneOptions {
  /** Retention window in days. Rows older than this are eligible. */
  daysToKeep: number;
  /** Soft cap so a runaway run can't drop a million objects in one go. */
  maxPerRun?: number;
  /** Optional per-company filter — useful for self-service "purge my
   *  history" admin UI. Omit to prune across all companies. */
  companyId?: number;
  /** When true, log which keys would be deleted without actually deleting. */
  dryRun?: boolean;
}

export async function prunePrintArtifacts(opts: PruneOptions): Promise<PruneResult> {
  const days = Math.max(1, Math.floor(opts.daysToKeep));
  const cap = Math.max(1, Math.min(opts.maxPerRun ?? 1000, 10_000));
  const params: unknown[] = [days, LEGAL_RETENTION_ENTITY_TYPES];
  let whereCompany = "";
  if (opts.companyId) {
    params.push(opts.companyId);
    whereCompany = ` AND "companyId" = $${params.length}`;
  }

  // Pull eligible rows. We only touch rows that still have a storage key
  // — rows whose key has been cleared (manual cleanup, previous run)
  // shouldn't count as "scanned" again. ORDER BY oldest-first so a
  // capped run nibbles from the tail consistently. The NOT = ANY clause
  // pushes the legal-hold filter into the index scan instead of pulling
  // rows just to skip them — relevant when ~80% of prints are invoices.
  const rows = await rawQuery<{ id: number; pdfStorageKey: string | null; entityType: string }>(
    `SELECT id, "pdfStorageKey", "entityType"
       FROM print_jobs
      WHERE "pdfStorageKey" IS NOT NULL
        AND "createdAt" < NOW() - ($1::int || ' days')::interval
        AND NOT ("entityType" = ANY($2::text[]))
        ${whereCompany}
      ORDER BY "createdAt" ASC
      LIMIT ${cap}`,
    params,
  ).catch((err) => {
    if ((err as { code?: string })?.code === "42P01") {
      logger.warn("[print/retention] print_jobs table missing — nothing to prune");
      return [];
    }
    throw err;
  });

  const result: PruneResult = {
    scanned: rows.length,
    deleted: 0,
    failed: 0,
    alreadyEmpty: 0,
    legalHoldSkipped: 0,
  };

  for (const row of rows) {
    if (!row.pdfStorageKey) {
      result.alreadyEmpty++;
      continue;
    }
    // Defence-in-depth: if the SQL filter above is ever changed and a
    // legal-hold row leaks through, the per-row check still catches it.
    if (LEGAL_RETENTION_ENTITY_TYPES.includes(row.entityType)) {
      result.legalHoldSkipped++;
      continue;
    }
    if (opts.dryRun) {
      logger.info({ id: row.id, key: row.pdfStorageKey }, "[print/retention] dry-run would delete");
      result.deleted++;
      continue;
    }
    const ok = await deletePrintArtifact({ storageKey: row.pdfStorageKey });
    if (!ok) {
      result.failed++;
      continue;
    }
    // Clear the column so a future call doesn't re-scan this row. We do
    // this AFTER the storage delete so a failed delete leaves the column
    // intact and the next run can retry.
    await rawQuery(
      `UPDATE print_jobs SET "pdfStorageKey" = NULL WHERE id = $1`,
      [row.id],
    ).catch((err) => {
      logger.warn(err as Error, "[print/retention] failed to clear pdfStorageKey");
    });
    result.deleted++;
  }

  logger.info(result, "[print/retention] prune complete");
  return result;
}
