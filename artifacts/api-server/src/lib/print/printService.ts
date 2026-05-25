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
import { config } from "../config.js";
import { userHasPermission } from "../../middlewares/permissionMiddleware.js";
import { getEntityPrintProfile } from "../entityRegistry.js";
import { resolveTemplate } from "./templateResolver.js";
import { loadEntityData } from "./dataLoader.js";
import { buildLetterhead } from "./branchContext.js";
import { getAdapter } from "./adapters/index.js";
import { makeWatermark } from "./watermark.js";
import { writePrintJob, countCopies } from "./printJobsLogger.js";
import { storePrintArtifact } from "./printStorage.js";
import { buildVerifyContext } from "./verify.js";
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

  // 1. RBAC — wrapped because role_permissions/user_permissions queries
  // can fail on partial migrations and we'd rather show a clear 403 than
  // bubble a generic 500. The route's own `requirePermission("print:create")`
  // middleware has already gated the request; this inner check is the
  // per-entity refinement.
  let permitted = false;
  try {
    permitted = await userHasPermission(scope, profile.permission);
  } catch (err) {
    logger.warn(err as Error, "[print] userHasPermission failed — falling back to deny");
    permitted = false;
  }
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
    const approver = await userHasPermission(scope, "print:reprint:approve");
    if (!approver) {
      throw new PrintApprovalRequiredError(copyNumber);
    }
  }

  // 3. Template
  // entityId === "list" is the well-known signal that the caller wants a
  // list-view render (ListPage exports the visible rows as payload).
  // resolveTemplate then skips the single-entity bespoke preset and uses
  // universal so the items table auto-builds from arbitrary row shapes.
  const isListView = req.entityId === "list" || req.entityId === "_list";
  const template =
    req.overrideTemplate ??
    (await resolveTemplate({
      companyId: scope.companyId,
      branchId: scope.branchId,
      entityType: req.entityType,
      asList: isListView,
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

  // Allocate the audit jobId BEFORE we render — so the QR/verify URL we
  // embed in the document points at the exact same row that
  // writePrintJob() will insert below. For ephemeral previews we just
  // pass null and the adapter skips QR rendering. The DB column has a
  // gen_random_uuid() default, but we override it from JS so the
  // bytes-on-the-page match the audit row.
  const verifyCtx = req.ephemeral
    ? { jobId: null, verifyUrl: null, verifyQrDataUrl: null }
    : await buildVerifyContext({ baseUrl: config.publicBaseUrl ?? "" });

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
    jobId: verifyCtx.jobId,
    verifyUrl: verifyCtx.verifyUrl,
    verifyQrDataUrl: verifyCtx.verifyQrDataUrl,
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
        templateId: template.id > 0 ? template.id : null,
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
    // Use the pre-allocated jobId from verifyCtx — the QR that's now baked
    // into `bytes` points at /print/verify/<verifyCtx.jobId>, so the audit
    // row MUST share the same UUID for verification to resolve correctly.
    storageKey = await storePrintArtifact({
      companyId: scope.companyId,
      jobId: verifyCtx.jobId ?? cryptoUuid(),
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
      templateId: template.id > 0 ? template.id : null,
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
      jobIdOverride: verifyCtx.jobId ?? undefined,
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
