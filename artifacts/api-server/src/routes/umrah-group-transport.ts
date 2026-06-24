// ─────────────────────────────────────────────────────────────────────────────
// umrah-group-transport.ts — UMRAH GROUP SERVICE CONTRACT (U-07 Phase 23)
//
// Routes carved VERBATIM out of umrah-entities.ts into this dedicated
// sub-router. Mounted via `router.use(groupTransportRouter)` in
// umrah-entities.ts so the API surface stays identical (paths still resolve at
// /umrah/groups/:id/transport-requests and /umrah/groups/:id/cost-breakdown).
//
// SERVICE CONTRACT — umrah → transport (§7 of #1870): a thin HTTP layer over
// `lib/umrahTransportContract.ts`. The engine library owns the schema knowledge
// + event emission; these routes just adapt the request/response shape — the
// route NEVER owns transport policy (constitution: مسار خادم لا يملك قرار المسار
// القائد). Co-located here is the read-only group cost-breakdown (§6 of #1870),
// which sat in the same section in the parent — a tenant-scoped financial
// summary read, no writes, no GL.
//
// OPERATIONAL — no ledger/GL writes. transport-requests delegate to the engine;
// cost-breakdown is a read-only aggregation.
//
// Routes owned here:
//   POST /groups/:id/transport-requests   (createTransportRequestFromUmrah engine)
//   GET  /groups/:id/cost-breakdown        (read-only nusk/sales aggregation)
//   GET  /groups/:id/transport-requests    (listTransportRequestsForGroup engine)
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, NotFoundError, parseId, zodParse } from "../lib/errorHandler.js";
import {
  createTransportRequestFromUmrah,
  listTransportRequestsForGroup,
} from "../lib/umrahTransportContract.js";

const router = Router();

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

export default router;
