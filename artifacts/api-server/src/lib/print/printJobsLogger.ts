/**
 * printJobsLogger — writes a print_jobs row + mirrors a 'print' action into
 * audit_logs so reports/print-log and the generic audit view both surface
 * the event.
 */

import { pool, rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";

export interface PrintJobInput {
  companyId: number;
  branchId: number | null;
  userId: number;
  entityType: string;
  entityId: string;
  templateId: number | null;
  format: string;
  paperSize: string | null;
  copyNumber: number;
  isReprint: boolean;
  watermark?: string | null;
  pdfStorageKey?: string | null;
  pdfBytes?: number | null;
  status: "rendering" | "done" | "failed" | "awaiting_approval";
  approvedBy?: number | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PrintJobRow extends PrintJobInput {
  id: number;
  jobId: string;
  createdAt: Date;
}

export async function writePrintJob(input: PrintJobInput): Promise<PrintJobRow | null> {
  try {
    const rows = await rawQuery<PrintJobRow>(
      // Every nullable parameter needs an explicit cast — pg's parameter
      // inference fails with "could not determine data type of parameter $N"
      // when a NULL is passed without a type hint AND the same param appears
      // in multiple expression positions (the approvedAt CASE below used $15
      // both as value and as predicate, which broke type resolution and
      // silently dropped every print_jobs row → audit trail blank).
      `INSERT INTO print_jobs (
         "companyId", "branchId", "userId", "entityType", "entityId", "templateId",
         "format", "paperSize", "copyNumber", "isReprint", "watermark",
         "pdfStorageKey", "pdfBytes", "status", "approvedBy", "approvedAt",
         "errorMessage", "ipAddress", "userAgent"
       )
       VALUES ($1::integer,$2::integer,$3::integer,$4::varchar,$5::varchar,$6::integer,
               $7::varchar,$8::varchar,$9::integer,$10::boolean,$11::varchar,
               $12::text,$13::integer,$14::varchar,$15::integer,
               CASE WHEN $15::integer IS NOT NULL THEN NOW() ELSE NULL END,
               $16::text,$17::varchar,$18::text)
       RETURNING id, "jobId", "createdAt", *`,
      [
        input.companyId,
        input.branchId,
        input.userId,
        input.entityType,
        input.entityId,
        input.templateId,
        input.format,
        input.paperSize,
        input.copyNumber,
        input.isReprint,
        input.watermark ?? null,
        input.pdfStorageKey ?? null,
        input.pdfBytes ?? null,
        input.status,
        input.approvedBy ?? null,
        input.errorMessage ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ]
    );
    const row = rows[0];

    // Mirror to audit_logs (best-effort)
    try {
      await pool.query(
        `INSERT INTO audit_logs (entity, "entityId", action, "before", "after", "userId", "companyId", "branchId", "ipAddress", "userAgent")
         VALUES ($1,$2,$3,NULL,$4::jsonb,$5,$6,$7,$8,$9)`,
        [
          input.entityType,
          input.entityId,
          input.isReprint ? "print.reprint" : "print",
          JSON.stringify({
            jobId: row?.jobId,
            format: input.format,
            copyNumber: input.copyNumber,
            templateId: input.templateId,
          }),
          input.userId,
          input.companyId,
          input.branchId,
          input.ipAddress ?? null,
          input.userAgent ?? null,
        ]
      );
    } catch (e) {
      logger.warn(e as Error, "[print] audit mirror failed");
    }

    return row ?? null;
  } catch (err) {
    logger.error(err as Error, "[print] writePrintJob failed");
    return null;
  }
}

export async function countCopies(opts: {
  companyId: number;
  entityType: string;
  entityId: string;
}): Promise<number> {
  // Reprint detection is a nice-to-have, not a precondition for printing.
  // If the print_jobs table is missing (fresh install before migration) or
  // the query fails for any other reason, default to 0 so the user still
  // gets their document. The audit row in writePrintJob is the source of
  // truth for "did this print happen"; counting copies is just decoration.
  try {
    const rows = await rawQuery<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM print_jobs
       WHERE "companyId" = $1 AND "entityType" = $2 AND "entityId" = $3
         AND "status" = 'done'`,
      [opts.companyId, opts.entityType, opts.entityId]
    );
    return rows[0] ? Number(rows[0].c) : 0;
  } catch (err) {
    logger.warn(err as Error, "[print/countCopies] query failed, defaulting to 0");
    return 0;
  }
}
