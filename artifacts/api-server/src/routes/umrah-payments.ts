// ─────────────────────────────────────────────────────────────────────────────
// umrah-payments.ts — UMRAH PAYMENTS + REVENUE RECLASSIFICATION (U-07 Phase 20)
//
// Routes carved VERBATIM out of umrah-entities.ts into this dedicated
// sub-router. Mounted via `router.use(paymentsRouter)` in umrah-entities.ts so
// the API surface stays identical (paths still resolve at /umrah/payments and
// /umrah/reclassify-revenue).
//
// LEDGER-TOUCHING — but the GL posting logic is NOT here:
//   • POST /payments         → the receipt + its journal entry are produced by
//                              the `registerPayment` ENGINE (lib/umrahInvoicingEngine.ts).
//   • POST /reclassify-revenue → the invoice scan, resolver lookup, compensating
//                              JE posting + items update all live in the
//                              `reclassifyRevenueForInvoices` ENGINE
//                              (lib/umrahReclassifyEngine.ts).
// Neither engine is touched by this carve. Per the constitution (GL +
// account-mapping helpers stay inside engines, not routes), the route is a thin
// invoker; the contract is pinned by umrahPaymentsSplitSmoke.test.ts (§F).
//
// Audit calls converted to auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not use the
// legacy direct createAuditLog helper.
//
// Routes owned here:
//   GET  /payments
//   POST /payments              (registerPayment engine)
//   POST /reclassify-revenue     (reclassifyRevenueForInvoices engine)
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { registerPayment } from "../lib/umrahInvoicingEngine.js";
import { reclassifyRevenueForInvoices } from "../lib/umrahReclassifyEngine.js";

const router = Router();

const createPaymentSchema = z.object({
  subAgentId: z.coerce.number({ required_error: "الوكيل الفرعي مطلوب" }),
  sarAmount: z.coerce.number({ required_error: "المبلغ مطلوب" }),
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
  exchangeRate: z.coerce.number().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  invoiceIds: z.array(z.coerce.number()).optional(),
});

router.get("/payments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { subAgentId } = req.query as Record<string, string | undefined>;
    let where = `p."companyId" = $1 AND p."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (subAgentId) { params.push(subAgentId); where += ` AND p."subAgentId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT p.*, sa.name AS "subAgentName"
       FROM umrah_payments p
       LEFT JOIN umrah_sub_agents sa
         ON sa.id = p."subAgentId"
        AND sa."companyId" = p."companyId"
        AND sa."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY p."paymentDate" DESC, p.id DESC
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List umrah payments"); }
});

router.post("/payments", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createPaymentSchema.safeParse(req.body));
    const b = parsed;
    const result = await registerPayment(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      {
        subAgentId: b.subAgentId,
        amount: b.amount || b.sarAmount,
        currency: b.currency || "SAR",
        exchangeRate: b.exchangeRate,
        sarAmount: b.sarAmount,
        method: b.method || "bank_transfer",
        reference: b.reference,
        invoiceIds: b.invoiceIds,
      }
    );
    auditFromRequest(req, "create", "umrah_payments", result.paymentId, { after: { subAgentId: b.subAgentId, sarAmount: b.sarAmount } }).catch((e) => logger.error(e, "umrah-payments background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.payment.received", entity: "umrah_payments", entityId: result.paymentId, after: { ref: result.ref, sarAmount: b.sarAmount } }).catch((e) => logger.error(e, "umrah-payments background task failed"));
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Register umrah payment"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// RETROACTIVE REVENUE RECLASSIFICATION — answers the operator's «على القديم
// والجديد» half. The dimensional resolver (revenueAccountResolver.ts) handles
// NEW invoices automatically; this endpoint walks OLD invoices and shifts
// their revenue posting from the original product-default account to whatever
// the current subsidiary_accounts mapping resolves to for their dimension.
//
// Why we don't rewrite historical journal entries: auditable accounting
// requires that once a number is posted, it stays. The correction shape is
// a NEW journal entry that DR's the old revenue account and CR's the new
// one — net effect: revenue moves from old to new as of today, without
// touching last year's books. (Same pattern as commercial ERPs' "GL
// reclassification" feature.)
//
// Idempotency: we use sourceKey=`umrah_reclass_${invoiceId}_to_${target}` so
// re-running the endpoint with the same configuration is a no-op for already-
// aligned invoices. We also UPDATE umrah_sales_invoice_items.accountCode to
// reflect the new revenue account so subsequent runs see "already aligned"
// and skip the work cheaply. If the operator later changes the override AGAIN,
// the next run posts a fresh compensating entry from the current-effective
// account (read from items.accountCode) to the new target.
const reclassifyRevenueSchema = z.object({
  /** Limit to specific invoice ids; omit to reclassify every eligible one. */
  invoiceIds: z.array(z.coerce.number().int().positive()).optional(),
  /** Limit to invoices for a single sub-agent (dimension-narrow). */
  subAgentId: z.coerce.number().int().positive().optional(),
  /** Limit to invoices in a single season. */
  seasonId: z.coerce.number().int().positive().optional(),
  /** When true, report what WOULD change without posting anything. */
  dryRun: z.boolean().optional(),
});

router.post("/reclassify-revenue", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(reclassifyRevenueSchema.safeParse(req.body));
    // All business logic — invoice scan, resolver lookup, compensating
    // JE posting, items update — lives in the umrahReclassifyEngine.
    // The route is intentionally thin so the lint-patterns invariant
    // (GL + account-mapping helpers must stay inside engines, not
    // routes) holds at the seam.
    const result = await reclassifyRevenueForInvoices(scope, body);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Reclassify revenue error:"); }
});

export default router;
