// ─────────────────────────────────────────────────────────────────────────────
// umrah-letters.ts — UMRAH LETTERS (U-07 Phase 12)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(lettersRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/letters/...).
//
// Pure code move — handlers, RBAC are carried over VERBATIM (no behaviour
// change). Audit calls converted to auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not use the
// legacy direct audit helper.
//
// Reads + dispatch-marks letters in the central official_letters table (the
// same table HR / legal / contracts use — no parallel storage). No ledger
// posting; the dispatch UPDATE only flips sentAt/dispatchedVia/status='sent'.
// official_letters is not a DOMAIN_TABLES-owned table, so this is not a
// cross-domain write (verbatim-preserved from the parent).
//
// Routes owned here:
//   GET  /letters/:id/pdf
//   POST /letters/:id/dispatch
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { renderPrint } from "../lib/print/printService.js";

const router = Router();

// ============================================================================
// LETTERS — PDF rendering + dispatch (closes spec §14 dispatch gap)
// ============================================================================

// Download a generated umrah letter as a printable Arabic PDF. Reads
// from the central official_letters table — same table HR / legal /
// contracts use — so there's no parallel storage.
router.get("/letters/:id/pdf", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ValidationError("معرّف الخطاب غير صالح");
    }
    // Scope check — letter belongs to the user's company AND is umrah-typed.
    // The dataLoader will refetch the full row inside renderPrint; we still
    // do the gate here so the failure mode is a clean 404 instead of an
    // empty document.
    const [letter] = await rawQuery<{ id: number; type: string }>(
      `SELECT id, type FROM official_letters
        WHERE id=$1 AND "companyId"=$2
          AND (type LIKE 'umrah_%' OR type = 'umrah')`,
      [id, scope.companyId]
    );
    if (!letter) throw new NotFoundError("الخطاب غير موجود");

    const result = await renderPrint(
      {
        companyId: scope.companyId, branchId: scope.branchId ?? null,
        userId: scope.userId, role: scope.role, isOwner: scope.isOwner,
      },
      { entityType: "official_letter", entityId: String(id), format: "a4" },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="umrah-letter-${id}.${result.mime.includes("html") ? "html" : "pdf"}"`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) { handleRouteError(err, res, "Letter PDF"); }
});

// Mark an umrah letter as dispatched. Sets sentAt + dispatchedVia + flips
// status='sent'. Idempotent: re-dispatch returns 409 (typed ConflictError).
router.post("/letters/:id/dispatch", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const body = z.object({
      dispatchedVia: z.enum(["print", "email", "whatsapp", "courier", "hand_delivery"]),
      recipient: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ValidationError("معرّف الخطاب غير صالح");
    }
    const [letter] = await rawQuery<{ id: number; status: string; sentAt: string | null; type: string }>(
      `SELECT id, status, "sentAt", type FROM official_letters
        WHERE id=$1 AND "companyId"=$2
          AND (type LIKE 'umrah_%' OR type = 'umrah')`,
      [id, scope.companyId]
    );
    if (!letter) throw new NotFoundError("الخطاب غير موجود");
    if (letter.sentAt) {
      throw new ConflictError("الخطاب مُرسل سابقاً", {
        meta: { sentAt: letter.sentAt, currentStatus: letter.status },
      });
    }
    if (letter.status === "draft") {
      throw new ConflictError("لا يمكن إرسال خطاب في حالة draft — يحتاج اعتماد أولاً", {
        meta: { currentStatus: letter.status, fix: "اعتمد الخطاب من /official-letters/:id/approve" },
      });
    }

    await rawExecute(
      `UPDATE official_letters
          SET "sentAt"=NOW(), "dispatchedVia"=$1, status='sent'
        WHERE id=$2 AND "companyId"=$3`,
      [body.dispatchedVia, id, scope.companyId]
    );

    await auditFromRequest(req, "dispatch", "umrah_letter", id, {
      after: { dispatchedVia: body.dispatchedVia, recipient: body.recipient ?? null },
    });

    await emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId ?? undefined,
      userId: scope.userId,
      action: "umrah.letter.dispatched",
      entity: "official_letters",
      entityId: id,
      details: JSON.stringify({
        dispatchedVia: body.dispatchedVia,
        recipient: body.recipient,
      }),
    });

    res.json({ id, status: "sent", dispatchedVia: body.dispatchedVia, sentAt: new Date().toISOString() });
  } catch (err) { handleRouteError(err, res, "Letter dispatch"); }
});

export default router;
