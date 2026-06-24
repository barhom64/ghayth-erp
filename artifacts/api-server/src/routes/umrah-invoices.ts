// ─────────────────────────────────────────────────────────────────────────────
// umrah-invoices.ts — UMRAH SALES INVOICES (U-07 Phase 21)
//
// Routes carved VERBATIM out of umrah-entities.ts into this dedicated
// sub-router. Mounted via `router.use(invoicesRouter)` in umrah-entities.ts so
// the API surface stays identical (paths still resolve at /umrah/invoices,
// /umrah/invoices/generate, /umrah/sales-wizard/uninvoiced-groups and
// /umrah/invoices/:id).
//
// LEDGER-TOUCHING — but the GL posting logic is NOT here:
//   • POST /invoices/generate → the invoice + its revenue/AR journal entries
//                              are produced by the `generateSalesInvoice` ENGINE
//                              (lib/umrahInvoicingEngine.ts).
//   • GET  /sales-wizard/...   → uninvoiced-group scan + price suggestions live
//                              in the `listUninvoicedGroups` ENGINE.
// Neither engine is touched by this carve. Per the constitution (GL +
// account-mapping helpers stay inside engines, not routes), the generate route
// is a thin invoker; the contract is pinned by umrahInvoicesSplitSmoke.test.ts (§F).
//
// PATCH /invoices/:id is metadata-only (status / notes / dueDate) — it never
// posts GL; §F asserts it stays free of journal writes.
//
// Audit calls converted to auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not use the
// legacy direct createAuditLog helper.
//
// Routes owned here:
//   GET   /invoices
//   POST  /invoices/generate               (generateSalesInvoice engine)
//   GET   /sales-wizard/uninvoiced-groups   (listUninvoicedGroups engine)
//   PATCH /invoices/:id                     (metadata-only, no GL)
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, parseId, zodParse } from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { generateSalesInvoice, listUninvoicedGroups } from "../lib/umrahInvoicingEngine.js";

const router = Router();

const generateInvoiceSchema = z.object({
  subAgentId: z.coerce.number({ required_error: "الوكيل الفرعي مطلوب" }),
  groupIds: z.array(z.coerce.number()).min(1, "المجموعات مطلوبة"),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  /** groupId → manual price per mutamer (overrides pricing rules). */
  manualPrices: z.record(z.coerce.number(), z.coerce.number().positive()).optional(),
});

const updateInvoiceSchema = z.object({
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

router.get("/invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, subAgentId, status } = req.query as Record<string, string | undefined>;
    let where = `si."companyId" = $1 AND si."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND si."seasonId" = $${params.length}`; }
    if (subAgentId) { params.push(subAgentId); where += ` AND si."subAgentId" = $${params.length}`; }
    if (status) { params.push(status); where += ` AND si.status = $${params.length}`; }
    const rows = await rawQuery(
      // Defence-in-depth on the sub-agents JOIN — it previously matched
      // only on id, so a stale FK could lift another tenant's name into
      // the response. Matches the pattern PR #1425 added to GET
      // /umrah/pilgrims/:id. Selecting si.* surfaces the costBasis +
      // marginBase columns (populated by umrahInvoicingEngine since
      // PR #1457) so the UI can display gross profit per row.
      `SELECT si.*, sa.name AS "subAgentName", c.name AS "clientName"
       FROM umrah_sales_invoices si
       LEFT JOIN umrah_sub_agents sa
              ON sa.id = si."subAgentId"
             AND sa."companyId" = si."companyId"
             AND sa."deletedAt" IS NULL
       LEFT JOIN clients c
              ON c.id = si."clientId"
             AND c."companyId" = si."companyId"
             AND c."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY si."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List umrah invoices"); }
});

router.post("/invoices/generate", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(generateInvoiceSchema.safeParse(req.body));
    const { subAgentId, groupIds, seasonId, manualPrices } = parsed;
    const result = await generateSalesInvoice(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      { subAgentId, groupIds, seasonId, manualPrices }
    );
    auditFromRequest(req, "create", "umrah_sales_invoices", result.invoiceId, { after: { subAgentId, groupIds, seasonId, manualPrices: manualPrices ? Object.keys(manualPrices).length : 0 } }).catch((e) => logger.error(e, "umrah-invoices background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.generated", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { ref: result.ref, total: result.total, subAgentId } }).catch((e) => logger.error(e, "umrah-invoices background task failed"));
    // §10 of #1870 — canonical name (see eventCatalog).
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sales_invoice.created", entity: "umrah_sales_invoices", entityId: result.invoiceId, after: { ref: result.ref, total: result.total, subAgentId } }).catch((e) => logger.error(e, "umrah-invoices background task failed"));
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Generate umrah invoice"); }
});

// Sales-invoice wizard: lists uninvoiced groups for a sub-agent + smart
// per-group price suggestions (last invoice → pricing rule →
// sub-agent default → none). The UI pre-fills the suggested price and
// the operator types only for exceptional cases. Pairs with the
// `manualPrices` payload on POST /invoices/generate above.
router.get("/sales-wizard/uninvoiced-groups", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const subAgentId = parseId(String(req.query.subAgentId ?? ""), "subAgentId");
    const seasonRaw = req.query.seasonId;
    const seasonId = seasonRaw != null && String(seasonRaw) !== "" ? Number(seasonRaw) : null;
    const result = await listUninvoicedGroups(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      subAgentId,
      seasonId,
    );
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "List uninvoiced groups for sales wizard"); }
});

router.patch("/invoices/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateInvoiceSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: unknown[] = [];
    const sets: string[] = [];
    for (const key of ["status","notes","dueDate"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    await rawExecute(
      `UPDATE umrah_sales_invoices SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
      params
    );
    const [row] = await rawQuery(
      `SELECT * FROM umrah_sales_invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    auditFromRequest(req, "update", "umrah_sales_invoices", id, { after: b }).catch((e) => logger.error(e, "umrah-invoices background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.invoice.updated", entity: "umrah_sales_invoices", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah-invoices background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update umrah invoice"); }
});

export default router;
