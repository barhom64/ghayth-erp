/**
 * printService — orchestrator for Print Engine v2.
 *
 *   1. authz()                — confirms the user can print this entityType.
 *   2. countCopies()          — decides whether this is a reprint.
 *   3. resolveTemplate()      — finds the right template for branch+entity.
 *   4. loadEntityData()       — fetches the entity payload.
 *   5. buildLetterhead()      — branch logo / footer / tax number.
 *   6. getAdapter().render()  — produces the bytes.
 *   7. storePrintArtifact()   — persists the PDF (if storage configured).
 *   8. writePrintJob()        — audit row in print_jobs + audit_logs.
 */

import { logger } from "../logger.js";
import { userHasPermission } from "../../middlewares/permissionMiddleware.js";
import { getEntityPrintProfile } from "../entityRegistry.js";
import { resolveTemplate } from "./templateResolver.js";
import { loadEntityData } from "./dataLoader.js";
import { buildLetterhead } from "./branchContext.js";
import { getAdapter } from "./adapters/index.js";
import { makeWatermark } from "./watermark.js";
import { writePrintJob, countCopies } from "./printJobsLogger.js";
import { storePrintArtifact } from "./printStorage.js";
import type {
  AuditContext,
  PaperSize,
  PrintFormat,
  PrintRenderRequest,
  PrintRenderResult,
  RenderContext,
} from "./types.js";

export class PrintPermissionError extends Error {
  status = 403;
  constructor(msg: string) {
    super(msg);
    this.name = "PrintPermissionError";
  }
}
export class PrintApprovalRequiredError extends Error {
  status = 409;
  constructor(public copyNumber: number) {
    super(`reprint approval required (copy #${copyNumber})`);
    this.name = "PrintApprovalRequiredError";
  }
}
export class PrintTemplateMissingError extends Error {
  status = 404;
  constructor(public entityType: string) {
    super(`no print template available for ${entityType}`);
    this.name = "PrintTemplateMissingError";
  }
}

export interface PrintScope {
  companyId: number;
  branchId: number | null;
  userId: number;
  role: string;
  isOwner?: boolean;
}

export async function renderPrint(
  scope: PrintScope,
  req: PrintRenderRequest,
  audit: AuditContext = {}
): Promise<PrintRenderResult> {
  const profile = getEntityPrintProfile(req.entityType);
  const allowedFormats = new Set<PrintFormat>(profile.formats);
  const format: PrintFormat = req.format ?? profile.defaultFormat;
  if (!allowedFormats.has(format)) {
    throw new PrintPermissionError(
      `format ${format} is not enabled for entity ${req.entityType}`
    );
  }

  // 1. RBAC
  const permitted = await userHasPermission(scope, profile.permission);
  if (!permitted) {
    throw new PrintPermissionError(
      `missing permission ${profile.permission} for entity ${req.entityType}`
    );
  }

  // 2. Reprint detection
  let copyNumber = req.copyNumber ?? 1;
  let isReprint = Boolean(req.isReprint);
  if (!req.ephemeral) {
    const existing = await countCopies({
      companyId: scope.companyId,
      entityType: req.entityType,
      entityId: req.entityId,
    });
    if (existing >= 1 && copyNumber <= existing) {
      copyNumber = existing + 1;
      isReprint = true;
    }
  }

  if (isReprint && profile.requiresApprovalForReprint && !req.reprintApprovedBy) {
    const approver = await userHasPermission(scope, "print:reprint_approve");
    if (!approver) {
      throw new PrintApprovalRequiredError(copyNumber);
    }
  }

  // 3. Template
  const template =
    req.overrideTemplate ??
    (await resolveTemplate({
      companyId: scope.companyId,
      branchId: scope.branchId,
      entityType: req.entityType,
    }));
  if (!template) {
    throw new PrintTemplateMissingError(req.entityType);
  }

  // 4. Data
  const data = req.previewPayload ?? (await loadEntityData({
    companyId: scope.companyId,
    entityType: req.entityType,
    entityId: req.entityId,
  }));

  // 5. Letterhead
  const { branch, companyRow } = await buildLetterhead(scope.companyId, scope.branchId);

  const watermark = makeWatermark(copyNumber, isReprint);
  const paperSize: PaperSize = (req.paperSize ?? template.paperSize) as PaperSize;

  const ctx: RenderContext = {
    companyId: scope.companyId,
    branchId: scope.branchId,
    userId: scope.userId,
    branch,
    company: {
      id: companyRow?.id ?? scope.companyId,
      name: companyRow?.name ?? "",
      nameEn: companyRow?.nameEn ?? undefined,
      logoUrl: companyRow?.logoUrl ?? undefined,
    },
    template,
    entityType: req.entityType,
    entityId: req.entityId,
    data,
    format,
    paperSize,
    copyNumber,
    watermark,
  };

  // 6. Render
  const adapter = getAdapter(format);
  let bytes: Buffer;
  let mime: string;
  let filename: string;
  try {
    const out = await adapter.render(ctx);
    bytes = out.bytes;
    mime = out.mime;
    filename = out.filename;
  } catch (err) {
    logger.error(err as Error, "[print] adapter render failed");
    if (!req.ephemeral) {
      await writePrintJob({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        entityType: req.entityType,
        entityId: req.entityId,
        templateId: template.id,
        format,
        paperSize,
        copyNumber,
        isReprint,
        watermark: watermark ?? null,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }
    throw err;
  }

  // 7 & 8 — persist + audit (skipped for ephemeral previews)
  let storageKey: string | null = null;
  let jobId: string | null = null;
  if (!req.ephemeral) {
    storageKey = await storePrintArtifact({
      companyId: scope.companyId,
      jobId: cryptoUuid(),
      format,
      bytes,
      mime,
    });
    const row = await writePrintJob({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entityType: req.entityType,
      entityId: req.entityId,
      templateId: template.id,
      format,
      paperSize,
      copyNumber,
      isReprint,
      watermark: watermark ?? null,
      pdfStorageKey: storageKey,
      pdfBytes: bytes.byteLength,
      status: "done",
      approvedBy: req.reprintApprovedBy ?? null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    jobId = row?.jobId ?? null;
  }

  return {
    jobId,
    format,
    mime,
    filename,
    bytes,
    storageKey,
    copyNumber,
    isReprint,
    watermark: watermark ?? undefined,
  };
}

function cryptoUuid(): string {
  // Node 18+ has globalThis.crypto.randomUUID
  return (globalThis.crypto?.randomUUID?.() ?? require("node:crypto").randomUUID()) as string;
}
