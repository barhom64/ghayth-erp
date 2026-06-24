// ─────────────────────────────────────────────────────────────────────────────
// umrah-entities.ts — COMMERCIAL/FINANCE entities for the umrah module
//
// Owns: group sub-resources (transport-requests, cost-breakdown),
//       employee-assignments.
//   (groups CRUD — list/get/create/update/delete — AND group ops (split/merge)
//    live in umrah-groups.ts — U-07 Phase 22)
//   (nusk-invoices — list/get/create/update/delete + AP journal posting —
//    live in umrah-nusk-invoices.ts — U-07 Phase 19)
//   (payments + revenue reclassification — register payment / reclassify —
//    live in umrah-payments.ts — U-07 Phase 20)
//   (sales-invoices — list/generate/sales-wizard/patch —
//    live in umrah-invoices.ts — U-07 Phase 21)
//   (letters PDF + dispatch live in umrah-letters.ts — U-07 Phase 12)
//   (operational reports — daily-runsheet, reconciliation, exempt-pilgrims,
//    group/season portfolio — live in umrah-reports.ts — U-07 Phase 11)
//   (attachments — polymorphic document storage — live in
//    umrah-attachments.ts — U-07 Phase 10)
//   (sub-agent statements JSON + PDF live in umrah-statements.ts — U-07 Phase 9)
//   (import-batches listing + unlinked-rows recovery live in
//    umrah-import-batches.ts — U-07 Phase 8)
//   (pricing CRUD lives in umrah-pricing.ts — U-07 Phase 7)
//   (sub-agents CRUD + linking live in umrah-sub-agents.ts — U-07 Phase 6)
//   (commission plans/calculations live in umrah-commission.ts — U-07 Phase 5)
//
// Sister file: umrah.ts — CORE DOMAIN (lifecycle + operational)
//   Owns: seasons, agents, packages, pilgrims, transport, import,
//         daily-status, penalties, violations, agent-invoices, bulk-assign.
//
// Both mounted at /umrah with requireModule("operations") + requireGuards("financial").
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  createTransportRequestFromUmrah,
  listTransportRequestsForGroup,
} from "../lib/umrahTransportContract.js";
// U-07 Phase 1 — journey + recovery reports moved to a dedicated
// sub-router so the parent file shrinks. The API surface is
// unchanged: the sub-router mounts on `/` here so its paths still
// resolve at /umrah/sub-agents/:id/journey, /umrah/groups/:id/journey,
// /umrah/reports/packages-vs-allocations-pricing-drift, and
// /umrah/reports/recovery-hub.
import journeyReportsRouter from "./umrah-journey-reports.js";
// U-07 Phase 2 — families CRUD moved to a dedicated sub-router so the
// parent file shrinks further. Paths still resolve at /umrah/families/...
import familiesRouter from "./umrah-families.js";
// U-07 Phase 4 — accommodation (hotels / room-blocks / allocations) moved to
// a dedicated sub-router. Paths still resolve at /umrah/hotels, /room-blocks…
import accommodationRouter from "./umrah-accommodation.js";
// U-07 Phase 5 — employee commission plans/calculations moved to a dedicated
// sub-router. Paths still resolve at /umrah/commission-plans, /umrah/commission-calculations…
import commissionRouter from "./umrah-commission.js";
// U-07 Phase 6 — sub-agents (CRUD + linking) moved to a dedicated sub-router.
// Paths still resolve at /umrah/sub-agents/...
import subAgentsRouter from "./umrah-sub-agents.js";
// U-07 Phase 7 — pricing (CRUD) moved to a dedicated sub-router.
// Paths still resolve at /umrah/pricing...
import pricingRouter from "./umrah-pricing.js";
// U-07 Phase 8 — import-batches (listing + unlinked-rows recovery) moved to a
// dedicated sub-router. Paths still resolve at /umrah/import/batches...
import importBatchesRouter from "./umrah-import-batches.js";
// U-07 Phase 9 — sub-agent statements (JSON + PDF) moved to a dedicated
// sub-router. Paths still resolve at /umrah/statements/...
import statementsRouter from "./umrah-statements.js";
// U-07 Phase 10 — attachments (polymorphic document storage) moved to a
// dedicated sub-router. Paths still resolve at /umrah/attachments...
import attachmentsRouter from "./umrah-attachments.js";
// U-07 Phase 11 — operational reports (daily-runsheet, reconciliation,
// exempt-pilgrims, group/season portfolio) moved to a dedicated sub-router.
// Paths still resolve at /umrah/reports/...
import reportsRouter from "./umrah-reports.js";
// U-07 Phase 12 — letters (PDF + dispatch) moved to a dedicated sub-router.
// Paths still resolve at /umrah/letters/...
import lettersRouter from "./umrah-letters.js";
// U-07 Phase 14 — refund requests (lifecycle: request → approve/reject → pay →
// close) moved to a dedicated sub-router. Paths still resolve at
// /umrah/refund-requests...
import refundsRouter from "./umrah-refunds.js";
// U-07 Phase 15 — operational calendar (layer-aware event aggregator) moved to
// a dedicated sub-router. Path still resolves at /umrah/calendar/events.
import calendarRouter from "./umrah-calendar.js";
// U-07 Phase 18 — settings policies (GET catalog + PUT per-category save) moved
// to a dedicated sub-router. Paths still resolve at /umrah/settings/policies...
import settingsRouter from "./umrah-settings.js";
// U-07 Phase 19 — nusk invoices (list/get/create/update/delete + AP journal
// posting via the postNuskJournalEntries engine) moved to a dedicated
// sub-router. Paths still resolve at /umrah/nusk-invoices...
import nuskInvoicesRouter from "./umrah-nusk-invoices.js";
// U-07 Phase 20 — payments (list + register via the registerPayment engine) and
// revenue reclassification (via the reclassifyRevenueForInvoices engine) moved
// to a dedicated sub-router. Paths still resolve at /umrah/payments and
// /umrah/reclassify-revenue.
import paymentsRouter from "./umrah-payments.js";
// U-07 Phase 21 — sales-invoices (list, generate via the generateSalesInvoice
// engine, sales-wizard via listUninvoicedGroups, metadata patch) moved to a
// dedicated sub-router. Paths still resolve at /umrah/invoices, /umrah/invoices/
// generate, /umrah/sales-wizard/uninvoiced-groups and /umrah/invoices/:id.
import invoicesRouter from "./umrah-invoices.js";
// U-07 Phase 22 — groups CRUD (list/get/create/update/delete) AND group ops
// (split/merge) moved to a dedicated sub-router. split/merge ship here too
// because POST /groups/:id/split INSERTs umrah_groups — keeping every
// umrah_groups INSERT beside the issueNumber call preserves the numbering-
// coverage relationship. Paths still resolve at /umrah/groups, /umrah/groups/:id,
// /umrah/groups/:id/split and /umrah/groups/merge.
import groupsRouter from "./umrah-groups.js";

const router = Router();
router.use(journeyReportsRouter);
router.use(familiesRouter);
router.use(accommodationRouter);
router.use(commissionRouter);
router.use(subAgentsRouter);
router.use(pricingRouter);
router.use(importBatchesRouter);
router.use(statementsRouter);
router.use(attachmentsRouter);
router.use(reportsRouter);
router.use(lettersRouter);
router.use(refundsRouter);
router.use(calendarRouter);
router.use(settingsRouter);
router.use(nuskInvoicesRouter);
router.use(paymentsRouter);
router.use(invoicesRouter);
router.use(groupsRouter);

// ============================================================================
// SERVICE CONTRACT — umrah → transport (§7 of #1870)
// ============================================================================
//
// Thin HTTP layer over `lib/umrahTransportContract.ts`. The engine
// library owns the schema knowledge + event emission; these routes
// just adapt the request/response shape.

const transportRequestSchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
  pilgrimsCount: z.coerce.number().int().nonnegative().optional(),
  dateTime: z.string().optional(),
  fromLocation: z.string().trim().min(1, "نقطة الانطلاق مطلوبة"),
  toLocation: z.string().trim().min(1, "الوجهة مطلوبة"),
  routeType: z.enum([
    "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
    "makkah_local", "madinah_local", "ziyarah", "custom",
  ]).optional(),
  requiredVehicleType: z.string().trim().optional(),
  flightNumber: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

router.post("/groups/:id/transport-requests", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const groupId = parseId(req.params.id, "id");
    const b = zodParse(transportRequestSchema.safeParse(req.body));
    const result = await createTransportRequestFromUmrah(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      {
        groupId,
        seasonId: b.seasonId ?? null,
        pilgrimsCount: b.pilgrimsCount ?? null,
        dateTime: b.dateTime ?? null,
        fromLocation: b.fromLocation,
        toLocation: b.toLocation,
        routeType: b.routeType ?? null,
        requiredVehicleType: b.requiredVehicleType ?? null,
        flightNumber: b.flightNumber ?? null,
        notes: b.notes ?? null,
      },
    );
    res.status(201).json(result);
  } catch (err) { handleRouteError(err, res, "Create transport request"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// تفصيل تكلفة المجموعة من فواتير نسك — §6 من شرائع #1870.
// المجموعة قد يكون لها فاتورة نسك واحدة أو أكثر (لو قُسِّمت). صفحة
// تفاصيل المجموعة حالياً تعرض المجموع فقط (netCost + refundAmount).
// هذا الـ endpoint يفتح الصندوق:
//   • تجميع per-category لكل العناصر (visa/transport/hotel/services/...)
//   • قائمة الفواتير الفردية مع روابط (id + nuskInvoiceNumber + status)
//   • مقارنة الإيراد (umrah_sales_invoices) مع التكلفة لإظهار الهامش الفعلي
//
// يجاوب: «هل المجموعة رابحة؟ ما توزيع التكلفة؟ هل في فواتير نسك ناقصة؟»
//
// قراءة فقط — tenant-scoped على companyId. ٣ تجميعات بالتوازي.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/groups/:id/cost-breakdown", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    // Verify group ownership first — surfaces 404 instead of empty rows
    // when the operator typed the wrong id (saves a "no data" confusion).
    const [group] = await rawQuery<{ id: number; name: string | null; nuskGroupNumber: string | null }>(
      `SELECT id, name, "nuskGroupNumber"
         FROM umrah_groups
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [id, scope.companyId],
    );
    if (!group) throw new NotFoundError("المجموعة غير موجودة");

    // 3 parallel reads:
    //   categories → SUM per category column across all non-cancelled nusk invoices
    //   invoices   → flat list of nusk invoices for the drill-down table
    //   revenue    → sales-side total to render margin on the same card
    const [categoryRow, invoices, revenueRow] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int                                    AS "nuskCount",
                COALESCE(SUM("groundServices"), 0)               AS "groundServices",
                COALESCE(SUM("electronicFees"), 0)               AS "electronicFees",
                COALESCE(SUM("visaFees"), 0)                     AS "visaFees",
                COALESCE(SUM("insuranceFees"), 0)                AS "insuranceFees",
                COALESCE(SUM("enrichmentServices"), 0)           AS "enrichmentServices",
                COALESCE(SUM("additionalServices"), 0)           AS "additionalServices",
                COALESCE(SUM("transportTotal"), 0)               AS "transportTotal",
                COALESCE(SUM("hotelTotal"), 0)                   AS "hotelTotal",
                COALESCE(SUM("refundAmount"), 0)                 AS "refundAmount",
                COALESCE(SUM("totalAmount"), 0)                  AS "totalAmount",
                COALESCE(SUM("netCost"), 0)                      AS "netCost"
           FROM umrah_nusk_invoices
          WHERE "groupId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL
            AND "nuskStatus" <> 'cancelled'`,
        [id, scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, "nuskInvoiceNumber", "nuskStatus", "issueDate",
                "mutamerCount", "netCost", "totalAmount", "refundAmount",
                "purchaseInvoiceId", "journalEntryId"
           FROM umrah_nusk_invoices
          WHERE "groupId" = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL
          ORDER BY "issueDate" DESC NULLS LAST, id DESC
          LIMIT 50`,
        [id, scope.companyId],
      ),
      rawQuery<Record<string, unknown>>(
        // Revenue + paid via the items table (header doesn't carry groupId).
        // DISTINCT collapses a multi-group invoice — same shape used in
        // /reports/group-portfolio (PR #1495) so margin numbers reconcile.
        `SELECT COALESCE(SUM(DISTINCT si.total), 0)         AS "revenue",
                COALESCE(SUM(DISTINCT si."paidAmount"), 0)  AS "revenuePaid"
           FROM umrah_sales_invoice_items it
           JOIN umrah_sales_invoices si
             ON si.id = it."invoiceId"
            AND si."companyId" = it."companyId"
            AND si."deletedAt" IS NULL
          WHERE it."groupId" = $1
            AND it."companyId" = $2
            AND it."deletedAt" IS NULL
            AND si.status <> 'cancelled'`,
        [id, scope.companyId],
      ),
    ]);

    const cat = categoryRow[0] ?? {};
    const rev = revenueRow[0] ?? { revenue: 0, revenuePaid: 0 };

    // Build the bar-chart-friendly array — only categories with > 0 value
    // so the FE doesn't render dead bars. Sorted by amount DESC so the
    // dominant cost component pops to the top.
    const CATEGORY_LABELS: Record<string, string> = {
      groundServices:      "خدمات أرضية",
      electronicFees:      "رسوم إلكترونية",
      visaFees:            "تأشيرات",
      insuranceFees:       "تأمين",
      enrichmentServices:  "خدمات إثرائية",
      additionalServices:  "خدمات إضافية",
      transportTotal:      "نقل",
      hotelTotal:          "فندق",
    };
    const categoriesArr = (Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>)
      .map((k) => ({
        key: k,
        label: CATEGORY_LABELS[k],
        amount: Number(cat[k] ?? 0),
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const totalCost = Number(cat.netCost ?? 0);
    const revenue = Number(rev.revenue ?? 0);
    const margin = revenue - totalCost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

    res.json(maskFields(req, {
      group: { id: group.id, name: group.name, nuskGroupNumber: group.nuskGroupNumber },
      summary: {
        nuskCount: Number(cat.nuskCount ?? 0),
        totalAmount: Number(cat.totalAmount ?? 0),
        refundAmount: Number(cat.refundAmount ?? 0),
        netCost: totalCost,
        revenue,
        revenuePaid: Number(rev.revenuePaid ?? 0),
        margin,
        marginPct,
        sellingBelowCost: margin < 0,
      },
      categories: categoriesArr,
      invoices,
    }));
  } catch (err) { handleRouteError(err, res, "Group cost breakdown"); }
});

router.get("/groups/:id/transport-requests", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const groupId = parseId(req.params.id, "id");
    const rows = await listTransportRequestsForGroup(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      groupId,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List transport requests"); }
});

// ============================================================================
// EMPLOYEE ASSIGNMENTS (umrah-specific roles / positions)
// ============================================================================

router.get("/employees/:employeeId/assignments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const rows = await rawQuery(
      `SELECT ea.id, ea."jobTitle" AS title, ea.role, ea."branchId", ea.status
       FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active'
       ORDER BY ea.id DESC LIMIT 50`,
      [employeeId, scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Employee assignments error"); }
});

export default router;
