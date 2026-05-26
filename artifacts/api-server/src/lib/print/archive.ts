/**
 * Print Archive — Phase 7 of the Print Platform.
 *
 * Every successful render auto-indexes into the `documents` table so
 * the entity-detail "Documents" tab surfaces every printed copy
 * (invoice, payslip, contract, …) alongside user-uploaded files.
 *
 * The `documents` row carries:
 *   • printJobId         → FK to print_jobs.jobId (Phase 6 verify URL)
 *   • storageKey         → same key used by storePrintArtifact
 *   • linkedEntityType   → "invoice" / "payslip" / …
 *   • linkedEntityId     → the row id
 *   • category="print"   → distinguishes from uploaded docs
 *   • mimeType / fileSize from the render result
 *
 * Errors are logged + swallowed. The Documents index is a nice-to-have
 * for users browsing entity history; if it fails, the print itself
 * still succeeds and the print_jobs audit row is the source of truth.
 */

import { rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";

export interface ArchiveLinkInput {
  companyId: number;
  jobId: string;
  entityType: string;
  entityId: string;
  filename: string;
  mime: string;
  bytes: number;
  storageKey: string | null;
  uploadedBy: number;
}

export async function linkPrintToDocuments(input: ArchiveLinkInput): Promise<{ id: number } | null> {
  try {
    const title = `${labelFor(input.entityType)} — ${input.entityId}`;
    const rows = await rawQuery<{ id: number }>(
      `INSERT INTO documents
         (title, "fileName", "fileSize", "mimeType", "uploadedBy",
          "companyId", category, status, "storageKey",
          "printJobId", "linkedEntityType", "linkedEntityId",
          "createdAt")
       VALUES ($1::varchar, $2::varchar, $3::integer, $4::varchar, $5::integer,
               $6::integer, 'print', 'archived', $7::text,
               $8::uuid, $9::varchar, $10::varchar,
               NOW())
       RETURNING id`,
      [
        title,
        input.filename,
        input.bytes,
        input.mime,
        input.uploadedBy,
        input.companyId,
        input.storageKey,
        input.jobId,
        input.entityType,
        input.entityId,
      ],
    );
    return rows[0] ?? null;
  } catch (err) {
    logger.warn(err as Error, "[print/archive] linkPrintToDocuments failed");
    return null;
  }
}

/** List documents that were auto-archived from prints of a given entity. */
export async function listEntityPrints(
  companyId: number,
  entityType: string,
  entityId: string,
): Promise<Array<{ id: number; title: string; createdAt: string; mimeType: string; fileSize: number; printJobId: string }>> {
  return await rawQuery(
    `SELECT id, title, "createdAt", "mimeType", "fileSize", "printJobId"
       FROM documents
      WHERE "companyId" = $1
        AND category = 'print'
        AND "linkedEntityType" = $2
        AND "linkedEntityId" = $3
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 200`,
    [companyId, entityType, entityId],
  ).catch(() => []);
}

const LABELS: Record<string, string> = {
  invoice: "فاتورة",
  sales_invoice: "فاتورة مبيعات",
  credit_note: "إشعار دائن",
  purchase_order: "أمر شراء",
  payroll: "كشف رواتب",
  payslip: "قسيمة راتب",
  official_letter: "خطاب رسمي",
  employee_contract: "عقد عمل",
  receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف",
};

function labelFor(entityType: string): string {
  return LABELS[entityType] ?? entityType;
}
