/**
 * Transport pricing + invoice merging (#1733 Issue Comment 3).
 *
 *   GET   /transport/price-rules                  — list pricing rules
 *   POST  /transport/price-rules                  — create
 *   PATCH /transport/price-rules/:id              — update
 *   POST  /transport/price-rules/preview          — try the engine on a hypothetical input
 *
 *   GET   /transport/service-lines                — accountant queue (filter by status / customer / service type / date window)
 *   PATCH /transport/service-lines/:id            — set unitPrice / unitOfMeasure / status (under_review / excluded)
 *   POST  /transport/service-lines/:id/auto-price — run the pricing engine and stamp the line
 *
 *   POST  /transport/invoice-batches              — given a list of service-line ids and a customer,
 *                                                   compute totals, mark them invoiced, and emit an
 *                                                   event that the finance side picks up to create
 *                                                   the actual invoice + invoice_lines (downstream).
 *
 * Gating uses `fleet.bookings` for the pricing-rules surface (operators
 * who already see bookings can see prices) and `finance.transport_billing`
 * (the existing #1750 feature) for the service-line + invoice-batch
 * surface (accountant-only).
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError, NotFoundError, ValidationError, ConflictError,
  parseId, zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { resolveTransportPrice } from "../lib/fleet/pricingEngine.js";

export const transportPricingRouter = Router();
transportPricingRouter.use(authMiddleware);

import { TRANSPORT_SERVICE_TYPES } from "../lib/transportEnums.js";

const UNIT_OF_MEASURE_VALUES = [
  "kg", "tonne", "pax", "trip", "km", "hour", "day", "pallet", "carton",
] as const;

const SERVICE_LINE_STATUSES = [
  "ready_for_accounting", "under_review", "invoiced", "excluded",
] as const;

// ─── Pricing rules ────────────────────────────────────────────────────
const createPriceRuleSchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  transportServiceType: z.enum(TRANSPORT_SERVICE_TYPES),
  vehicleType: z.string().max(32).optional(),
  routeFrom: z.string().max(255).optional(),
  routeTo: z.string().max(255).optional(),
  cargoType: z.string().max(64).optional(),
  unitOfMeasure: z.enum(UNIT_OF_MEASURE_VALUES),
  unitPrice: z.coerce.number().positive(),
  minimumCharge: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.coerce.number().int().optional(),
  notes: z.string().max(1000).optional(),
});

const updatePriceRuleSchema = createPriceRuleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

transportPricingRouter.get(
  "/transport/price-rules",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { customerId, serviceType } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
      if (customerId) { params.push(Number(customerId)); where += ` AND "customerId" = $${params.length}`; }
      if (serviceType) { params.push(serviceType); where += ` AND "transportServiceType" = $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_price_rules
          WHERE ${where}
          ORDER BY "isActive" DESC, priority DESC, "createdAt" DESC LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List price rules error:");
    }
  },
);

transportPricingRouter.post(
  "/transport/price-rules",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createPriceRuleSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO transport_price_rules
           ("companyId", "branchId", "customerId", "transportServiceType",
            "vehicleType", "routeFrom", "routeTo", "cargoType",
            "unitOfMeasure", "unitPrice", "minimumCharge", currency, "vatRate",
            "validFrom", "validTo", priority, notes, "createdBy")
         VALUES ($1,$2,$3,$4, $5,$6,$7,$8, $9,$10,$11,$12,$13, $14,$15,$16,$17,$18)`,
        [
          scope.companyId, scope.branchId ?? null, b.customerId ?? null, b.transportServiceType,
          b.vehicleType ?? null, b.routeFrom ?? null, b.routeTo ?? null, b.cargoType ?? null,
          b.unitOfMeasure, b.unitPrice, b.minimumCharge ?? null,
          b.currency ?? "SAR", b.vatRate ?? null,
          b.validFrom, b.validTo ?? null, b.priority ?? 0, b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "transport_price_rules");
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create price rule error:");
    }
  },
);

transportPricingRouter.patch(
  "/transport/price-rules/:id",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updatePriceRuleSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        customerId: '"customerId"', transportServiceType: '"transportServiceType"',
        vehicleType: '"vehicleType"', routeFrom: '"routeFrom"', routeTo: '"routeTo"',
        cargoType: '"cargoType"', unitOfMeasure: '"unitOfMeasure"',
        unitPrice: '"unitPrice"', minimumCharge: '"minimumCharge"',
        currency: "currency", vatRate: '"vatRate"',
        validFrom: '"validFrom"', validTo: '"validTo"',
        priority: "priority", isActive: '"isActive"', notes: "notes",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(v);
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE transport_price_rules SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("القاعدة غير موجودة");
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update price rule error:");
    }
  },
);

const previewSchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  transportServiceType: z.enum(TRANSPORT_SERVICE_TYPES),
  vehicleType: z.string().optional(),
  routeFrom: z.string().optional(),
  routeTo: z.string().optional(),
  cargoType: z.string().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

transportPricingRouter.post(
  "/transport/price-rules/preview",
  authorize({ feature: "fleet.bookings", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(previewSchema.safeParse(req.body));
      const result = await resolveTransportPrice({
        companyId: scope.companyId,
        customerId: b.customerId ?? null,
        transportServiceType: b.transportServiceType,
        vehicleType: b.vehicleType ?? null,
        routeFrom: b.routeFrom ?? null,
        routeTo: b.routeTo ?? null,
        cargoType: b.cargoType ?? null,
        serviceDate: b.serviceDate,
      });
      res.json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Preview price error:");
    }
  },
);

// ─── Service lines (accountant queue) ─────────────────────────────────
transportPricingRouter.get(
  "/transport/service-lines",
  authorize({ feature: "finance.transport_billing", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { customerId, status, serviceType, fromDate, toDate } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `sl."companyId" = $1`;
      if (customerId) { params.push(Number(customerId)); where += ` AND sl."customerId" = $${params.length}`; }
      if (status) { params.push(status); where += ` AND sl."billingStatus" = $${params.length}`; }
      if (serviceType) { params.push(serviceType); where += ` AND sl."serviceType" = $${params.length}`; }
      if (fromDate) { params.push(fromDate); where += ` AND sl."serviceDate" >= $${params.length}`; }
      if (toDate) { params.push(toDate); where += ` AND sl."serviceDate" <= $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT sl.*, c.name AS "customerName"
           FROM transport_service_lines sl
           LEFT JOIN clients c ON c.id = sl."customerId" AND c."companyId" = sl."companyId"
          WHERE ${where}
          ORDER BY sl."serviceDate" DESC, sl.id DESC LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List service lines error:");
    }
  },
);

const updateServiceLineSchema = z.object({
  unitPrice: z.coerce.number().nonnegative().optional(),
  unitOfMeasure: z.enum(UNIT_OF_MEASURE_VALUES).optional(),
  quantity: z.coerce.number().optional(),
  billingStatus: z.enum(SERVICE_LINE_STATUSES).optional(),
  exclusionReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

transportPricingRouter.patch(
  "/transport/service-lines/:id",
  authorize({ feature: "finance.transport_billing", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateServiceLineSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        unitPrice: '"unitPrice"', unitOfMeasure: '"unitOfMeasure"',
        quantity: "quantity", billingStatus: '"billingStatus"', notes: "notes",
      };
      for (const [k, v] of Object.entries(b)) {
        if (v !== undefined && colMap[k]) {
          sets.push(`${colMap[k]} = $${p++}`);
          params.push(v);
        }
      }
      // Recompute lineTotal whenever unitPrice or quantity changes.
      if (b.unitPrice !== undefined || b.quantity !== undefined) {
        // Best-effort: read current quantity + unitPrice and recompute.
        const [current] = await rawQuery<{ quantity: string; unitPrice: string | null }>(
          `SELECT quantity, "unitPrice" FROM transport_service_lines WHERE id = $1 AND "companyId" = $2`,
          [id, scope.companyId],
        );
        if (current) {
          const q = b.quantity ?? Number(current.quantity);
          const u = b.unitPrice ?? Number(current.unitPrice ?? 0);
          sets.push(`"lineTotal" = $${p++}`);
          params.push(+(q * u).toFixed(2));
        }
      }
      if (sets.length === 0) { res.json({ data: { id } }); return; }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);
      const { affectedRows } = await rawExecute(
        `UPDATE transport_service_lines SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++}`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("بند الخدمة غير موجود");
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update service line error:");
    }
  },
);

transportPricingRouter.post(
  "/transport/service-lines/:id/auto-price",
  authorize({ feature: "finance.transport_billing", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [line] = await rawQuery<{
        id: number; customerId: number | null;
        serviceType: string; vehicleType: string | null;
        routeFrom: string | null; routeTo: string | null;
        cargoType: string | null; quantity: string; serviceDate: string;
      }>(
        `SELECT sl.id, sl."customerId", sl."serviceType",
                v."vehicleType" AS "vehicleType",
                sl."routeFrom", sl."routeTo", sl."cargoType",
                sl.quantity, sl."serviceDate"
           FROM transport_service_lines sl
           LEFT JOIN fleet_vehicles v ON v.id = sl."vehicleId" AND v."companyId" = sl."companyId"
          WHERE sl.id = $1 AND sl."companyId" = $2`,
        [id, scope.companyId],
      );
      if (!line) throw new NotFoundError("بند الخدمة غير موجود");

      const result = await resolveTransportPrice({
        companyId: scope.companyId,
        customerId: line.customerId,
        transportServiceType: line.serviceType,
        vehicleType: line.vehicleType,
        routeFrom: line.routeFrom,
        routeTo: line.routeTo,
        cargoType: line.cargoType,
        serviceDate: line.serviceDate,
      });
      if (!result) {
        throw new ValidationError(
          "لا توجد قاعدة تسعير مطابقة. الرجاء إدخال السعر يدوياً أو إنشاء قاعدة تسعير جديدة.",
          { field: "unitPrice", fix: "أنشئ قاعدة تسعير ثم أعد المحاولة." },
        );
      }
      const qty = Number(line.quantity);
      const computedTotal = +(qty * result.unitPrice).toFixed(2);
      const finalTotal = result.minimumCharge != null
        ? Math.max(computedTotal, result.minimumCharge)
        : computedTotal;
      await rawExecute(
        `UPDATE transport_service_lines
            SET "unitPrice" = $1,
                "unitOfMeasure" = $2,
                "lineTotal" = $3,
                "billingStatus" = 'under_review',
                "updatedAt" = NOW()
          WHERE id = $4 AND "companyId" = $5`,
        [result.unitPrice, result.unitOfMeasure, finalTotal, id, scope.companyId],
      );
      res.json({
        data: { id, unitPrice: result.unitPrice, lineTotal: finalTotal, ruleId: result.ruleId },
      });
    } catch (err) {
      handleRouteError(err, res, "Auto-price service line error:");
    }
  },
);

// ─── Invoice batches (merge multiple service lines into ONE invoice) ──
const invoiceBatchSchema = z.object({
  serviceLineIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
  customerId: z.coerce.number().int().positive(),
  // The actual invoice row is created downstream by the finance side
  // (which knows about invoice numbering, ZATCA, etc.). This endpoint
  // links the service lines and emits an event with the line totals so
  // the finance side can pick up the work.
  notes: z.string().max(1000).optional(),
});

transportPricingRouter.post(
  "/transport/invoice-batches",
  authorize({ feature: "finance.transport_billing", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(invoiceBatchSchema.safeParse(req.body));

      const result = await withTransaction(async (tx) => {
        // Lock the selected service lines + validate they're billable
        // and all belong to the same customer.
        const lockRes = await tx.query<{
          id: number; customerId: number | null;
          billingStatus: string; lineTotal: string | null;
          unitPrice: string | null; quantity: string;
        }>(
          `SELECT id, "customerId", "billingStatus", "lineTotal", "unitPrice", quantity
             FROM transport_service_lines
            WHERE id = ANY($1::int[]) AND "companyId" = $2
            FOR UPDATE`,
          [b.serviceLineIds, scope.companyId],
        );
        const lines = lockRes.rows;
        if (lines.length !== b.serviceLineIds.length) {
          throw new NotFoundError("بعض بنود الخدمة غير موجودة أو خارج الشركة");
        }
        for (const l of lines) {
          if (l.customerId !== b.customerId) {
            throw new ValidationError(
              `جميع البنود يجب أن تكون لنفس العميل — البند ${l.id} لعميل آخر`,
              { field: "customerId" },
            );
          }
          if (l.billingStatus === "invoiced") {
            throw new ConflictError(`البند ${l.id} مفوتر مسبقاً`);
          }
          if (l.billingStatus === "excluded") {
            throw new ConflictError(`البند ${l.id} مستبعد ماليًا`);
          }
          if (l.lineTotal == null || Number(l.lineTotal) <= 0) {
            throw new ValidationError(
              `البند ${l.id} بلا سعر — استخدم auto-price أو حدّد unitPrice أولاً`,
              { field: "lineTotal" },
            );
          }
        }
        const total = lines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);

        // Flip every line to invoiced and emit the merged-batch event.
        // The finance side listens for `finance.transport_billing.batch.ready`
        // and creates the actual invoice row + invoice_lines from this
        // payload. The transport_invoice_links junction is written there
        // once the invoiceId exists.
        await tx.query(
          `UPDATE transport_service_lines
              SET "billingStatus" = 'invoiced', "updatedAt" = NOW()
            WHERE id = ANY($1::int[]) AND "companyId" = $2`,
          [b.serviceLineIds, scope.companyId],
        );
        return { total, lineCount: lines.length };
      });

      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "finance.transport_billing.batch.ready",
        entity: "transport_service_lines", entityId: 0,
        details: JSON.stringify({
          customerId: b.customerId,
          serviceLineIds: b.serviceLineIds,
          total: result.total,
          lineCount: result.lineCount,
          notes: b.notes,
        }),
      }).catch((e) => logger.error(e, "invoice batch event failed"));

      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "approve", entity: "transport_service_lines", entityId: b.serviceLineIds[0]!,
        after: { customerId: b.customerId, lineCount: result.lineCount, total: result.total },
      }).catch((e) => logger.error(e, "invoice batch audit failed"));

      res.status(201).json({ ok: true, lineCount: result.lineCount, total: result.total });
    } catch (err) {
      handleRouteError(err, res, "Build invoice batch error:");
    }
  },
);

export default transportPricingRouter;
