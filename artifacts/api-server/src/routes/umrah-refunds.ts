// ─────────────────────────────────────────────────────────────────────────────
// umrah-refunds.ts — UMRAH REFUND REQUESTS (migration 268)
//
// U-07 (umrah-entities.ts split, Phase 3): the 6 refund-request routes
// live in a dedicated module so the parent `umrah-entities.ts` keeps
// shrinking. The sub-router is mounted from umrah-entities.ts via
// `router.use(refundsRouter)` so the API surface stays identical
// (paths still resolve at /umrah/refund-requests/...).
//
// Pure code move — handlers, schemas, RBAC, event emission are carried
// over VERBATIM from the parent (no behaviour change).
// Audit calls use auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not
// use the legacy audit helper.
//
// Routes owned here:
//   GET  /refund-requests
//   POST /refund-requests
//   POST /refund-requests/:id/approve
//   POST /refund-requests/:id/reject
//   POST /refund-requests/:id/pay
//   POST /refund-requests/:id/close
//
// Domain notes (verbatim from the parent banner):
//   Pilgrim cancels → file refund request → approve/reject → pay through
//   treasury → close once credit memo lands. State machine in
//   `lib/umrahRefundWorkflow.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const createRefundSchema = z.object({
  pilgrimId: z.coerce.number().int().positive().optional(),
  agentId: z.coerce.number().int().positive().optional(),
  salesInvoiceId: z.coerce.number().int().positive().optional(),
  nuskInvoiceId: z.coerce.number().int().positive().optional(),
  grossAmount: z.coerce.number().positive(),
  mofaRetention: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  reason: z.string().min(1, "السبب مطلوب"),
  notes: z.string().optional(),
}).refine(
  (d) => d.pilgrimId || d.agentId,
  { message: "إما المعتمر أو الوكيل مطلوب", path: ["pilgrimId"] },
);

router.get("/refund-requests", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as Record<string, string | undefined>;
    let where = `r."companyId" = $1 AND r."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (status) {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    const rows = await rawQuery(
      `SELECT r.*,
              p."fullName" AS "pilgrimName",
              p."passportNumber",
              a.name        AS "agentName"
         FROM umrah_refund_requests r
    LEFT JOIN umrah_pilgrims p
           ON p.id = r."pilgrimId"
          AND p."companyId" = r."companyId"
          AND p."deletedAt" IS NULL
    LEFT JOIN umrah_agents a
           ON a.id = r."agentId"
          AND a."companyId" = r."companyId"
          AND a."deletedAt" IS NULL
        WHERE ${where}
        ORDER BY r."requestedAt" DESC
        LIMIT 500`,
      params,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List refund requests"); }
});

router.post("/refund-requests", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createRefundSchema.safeParse(req.body));
    if (b.pilgrimId) {
      const [hit] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.pilgrimId, scope.companyId],
      );
      if (!hit) throw new ValidationError("المعتمر غير موجود في النظام", { field: "pilgrimId" });
    }
    if (b.agentId) {
      const [hit] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.agentId, scope.companyId],
      );
      if (!hit) throw new ValidationError("الوكيل غير موجود في النظام", { field: "agentId" });
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_refund_requests
       ("companyId","pilgrimId","agentId","salesInvoiceId","nuskInvoiceId",
        "grossAmount","mofaRetention",currency,reason,notes,"requestedBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        scope.companyId,
        b.pilgrimId ?? null,
        b.agentId ?? null,
        b.salesInvoiceId ?? null,
        b.nuskInvoiceId ?? null,
        b.grossAmount,
        b.mofaRetention ?? 0,
        b.currency ?? "SAR",
        b.reason,
        b.notes ?? null,
        scope.userId,
      ],
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء طلب الاسترداد");
    auditFromRequest(req, "create", "umrah_refund_requests", rows[0].id as number, {
      after: { grossAmount: b.grossAmount, pilgrimId: b.pilgrimId, agentId: b.agentId },
    }).catch((e) => logger.error(e, "umrah-refunds background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.requested", entity: "umrah_refund_requests", entityId: rows[0].id as number,
      details: JSON.stringify({ grossAmount: b.grossAmount }),
    }).catch((e) => logger.error(e, "umrah-refunds background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create refund request"); }
});

router.post("/refund-requests/:id/approve", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "approved")) {
      throw new ConflictError(`لا يمكن الموافقة على طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='approved',
              "approvedBy"=$1, "approvedAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$2 AND "companyId"=$3`,
      [scope.userId, id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.approved", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({ approvedBy: scope.userId }),
    }).catch((e) => logger.error(e, "umrah-refunds background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Approve refund"); }
});

const rejectRefundSchema = z.object({
  rejectionReason: z.string().min(1, "سبب الرفض مطلوب"),
});

router.post("/refund-requests/:id/reject", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(rejectRefundSchema.safeParse(req.body));
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "rejected")) {
      throw new ConflictError(`لا يمكن رفض طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='rejected',
              "rejectionReason"=$1, "rejectedBy"=$2, "rejectedAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$3 AND "companyId"=$4`,
      [b.rejectionReason, scope.userId, id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.rejected", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({ reason: b.rejectionReason }),
    }).catch((e) => logger.error(e, "umrah-refunds background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Reject refund"); }
});

const payRefundSchema = z.object({
  settledAmount: z.coerce.number().positive(),
  treasuryId: z.coerce.number().int().positive(),
  paymentReference: z.string().min(1, "مرجع الدفع مطلوب"),
});

router.post("/refund-requests/:id/pay", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(payRefundSchema.safeParse(req.body));
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "paid")) {
      throw new ConflictError(`لا يمكن صرف طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='paid',
              "settledAmount"=$1, "treasuryId"=$2, "paymentReference"=$3,
              "paidBy"=$4, "paidAt"=NOW(), "updatedAt"=NOW()
        WHERE id=$5 AND "companyId"=$6`,
      [b.settledAmount, b.treasuryId, b.paymentReference, scope.userId, id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.paid", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({ settledAmount: b.settledAmount, treasuryId: b.treasuryId }),
    }).catch((e) => logger.error(e, "umrah-refunds background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Pay refund"); }
});

router.post("/refund-requests/:id/close", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { canTransition } = await import("../lib/umrahRefundWorkflow.js");
    const [current] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_refund_requests WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("طلب الاسترداد غير موجود");
    if (!canTransition(current.status, "closed")) {
      throw new ConflictError(`لا يمكن إغلاق طلب بحالة "${current.status}"`);
    }
    await rawExecute(
      `UPDATE umrah_refund_requests
          SET status='closed', "updatedAt"=NOW()
        WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId],
    );
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.refund.closed", entity: "umrah_refund_requests", entityId: id,
      details: JSON.stringify({}),
    }).catch((e) => logger.error(e, "umrah-refunds background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Close refund"); }
});

export default router;
