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
import {
  createAuditLog, emitEvent, checkFinancialPeriodOpen,
  getCompanyVatRate, computeVat, roundTo2, todayISO,
} from "../lib/businessHelpers.js";
import { issueNumber } from "../lib/numberingService.js";
import { getDefaultTaxCode, computeTaxFromTaxCode } from "../lib/taxCodes.js";
import { resolveTransportRevenueAccount } from "../lib/transportRevenueAccounts.js";
import { createCostCenterForEntity } from "../lib/costCenterAutoCreate.js";
import type { TransportServiceType } from "../lib/transportEnums.js";
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
      // validTo (optional) must not precede validFrom — keeps date-range pricing
      // lookups correct. (createPriceRuleSchema uses .partial() for the update
      // schema, so the ordering check lives in the handlers, not a schema refine.)
      if (b.validTo && b.validTo < b.validFrom) {
        throw new ValidationError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", { field: "validTo" });
      }
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
      // re-validate ordering against the effective (merged) values — a partial
      // update must not place validFrom after validTo.
      if (b.validFrom !== undefined || b.validTo !== undefined) {
        const [cur] = await rawQuery<{ validFrom: string | null; validTo: string | null }>(
          `SELECT "validFrom"::text AS "validFrom", "validTo"::text AS "validTo" FROM transport_price_rules WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [id, scope.companyId],
        );
        if (!cur) throw new NotFoundError("القاعدة غير موجودة");
        const effFrom = b.validFrom !== undefined ? b.validFrom : cur.validFrom;
        const effTo = b.validTo !== undefined ? b.validTo : cur.validTo;
        if (effFrom && effTo && effTo < effFrom) {
          throw new ValidationError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", { field: "validTo" });
        }
      }
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
          serviceType: string; vehicleId: number | null; driverId: number | null;
          routeFrom: string | null; routeTo: string | null; tripId: number | null;
        }>(
          `SELECT id, "customerId", "billingStatus", "lineTotal", "unitPrice", quantity,
                  "serviceType", "vehicleId", "driverId", "routeFrom", "routeTo", "tripId"
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
        // ── Build the customer invoice (transport-review Phase-1 Step-2) ──
        // Revenue is recognized per service line on its own invoice line, with
        // the account routed by SERVICE TYPE (umrah/passenger/freight →
        // 4151/4152/4153) via the Step-1 helper. The invoice lands as a DRAFT
        // (like every invoice in the system); the accountant approves it and the
        // standard approve path posts the GL — crediting each line's pinned
        // accountCode + VAT — so no GL code lives here.
        const periodCheck = await checkFinancialPeriodOpen(scope.companyId, todayISO());
        if (!periodCheck.open) {
          throw new ConflictError(
            `لا يمكن إنشاء فاتورة في فترة مالية مُقفلة: ${periodCheck.periodName ?? ""}`,
            { field: "date", fix: "اطلب من المدير المالي فتح الفترة المالية المناسبة" },
          );
        }

        const { financialEngine } = await import("../lib/engines/index.js");
        const defaultTaxCode = await getDefaultTaxCode(scope.companyId);
        const companyVatRate = await getCompanyVatRate(scope.companyId);

        // Resolve revenue account + VAT split per line; accumulate the header.
        const prepared: Array<{
          id: number; quantity: string; unitPrice: string | null;
          net: number; vat: number; gross: number;
          accountCode: string; taxCode: string | null;
          vehicleId: number | null; driverId: number | null;
          costCenterId: number | null; description: string;
        }> = [];
        let subtotal = 0;
        let vatTotal = 0;
        for (const l of lines) {
          const net = roundTo2(Number(l.lineTotal));
          const rev = resolveTransportRevenueAccount(l.serviceType as TransportServiceType);
          const accountCode = await financialEngine.resolveAccountCode(
            scope.companyId, rev.purpose, "credit", rev.defaultCode,
          );
          let vat: number;
          let taxCode: string | null;
          if (defaultTaxCode) {
            const split = await computeTaxFromTaxCode({
              companyId: scope.companyId, amount: net, taxInclusive: false, taxCode: defaultTaxCode.code,
            });
            vat = split.tax;
            taxCode = defaultTaxCode.code;
          } else {
            vat = computeVat(net, companyVatRate);
            taxCode = null;
          }
          subtotal = roundTo2(subtotal + net);
          vatTotal = roundTo2(vatTotal + vat);

          // Cost-center dimension (Step-3): the trip is a SUB-cost-center nested
          // under the vehicle's cost-center (via cost_centers.parentId), so
          // revenue is tracked per-trip and rolls up to the vehicle. We stamp it
          // on the line; the explicit costCenterId then survives approval (the
          // enricher will NOT override it). Falls back to null — the enricher
          // then derives the vehicle CC — when the line has no trip/vehicle.
          // createCostCenterForEntity is reentrant inside this tx and returns
          // null on failure (non-fatal: the line still posts to the vehicle CC).
          let costCenterId: number | null = null;
          if (l.tripId != null && l.vehicleId != null) {
            const tripCC = await createCostCenterForEntity(
              scope.companyId, "trip", l.tripId, `رحلة نقل رقم ${l.tripId}`,
              { parentEntityType: "vehicle", parentEntityId: l.vehicleId, actorUserId: scope.userId },
            );
            costCenterId = tripCC?.id ?? null;
          }

          const route = [l.routeFrom, l.routeTo].filter(Boolean).join(" ← ");
          prepared.push({
            id: l.id, quantity: l.quantity, unitPrice: l.unitPrice,
            net, vat, gross: roundTo2(net + vat), accountCode, taxCode,
            vehicleId: l.vehicleId, driverId: l.driverId, costCenterId,
            description: [rev.label, route].filter(Boolean).join(" — "),
          });
        }
        const grandTotal = roundTo2(subtotal + vatTotal);
        const headerVatRate = defaultTaxCode?.rate ?? companyVatRate;

        // Central numbering authority (#1141) — same scheme as finance POST /invoices.
        const issued = await issueNumber({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          moduleKey: "finance",
          entityKey: "sales_invoice",
          entityTable: "invoices",
          actorId: scope.userId,
          expectedTiming: "on_draft",
        });

        const invRes = await tx.query<{ id: number }>(
          `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
                  subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,
                  "isTaxLinked","invoiceTypeCode","taxCategoryCode","exemptionReason","costCenter",
                  "taxCode","taxInclusive","discountAmount","discountPercent")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING id`,
          [
            scope.companyId, scope.branchId ?? null, b.customerId, issued.number,
            `دفعة فوترة نقل — ${lines.length} بند`,
            subtotal, Number(headerVatRate), vatTotal, grandTotal, null, scope.activeAssignmentId, b.notes ?? null,
            true, "388", "S", null, null,
            defaultTaxCode?.code ?? null, false, 0, 0,
          ],
        );
        const invoiceId = invRes.rows[0]!.id;

        // Link the numbering assignment back to the new invoice id (audit drill-down).
        await tx.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [invoiceId, issued.assignmentId],
        );

        // One invoice line per service line; flip the line to invoiced with the
        // REAL invoiceId/invoiceLineId, and write the transport_invoice_links
        // junction (uq_transport_invoice_link_service is the idempotency backstop).
        for (const p of prepared) {
          const lineRes = await tx.query<{ id: number }>(
            `INSERT INTO invoice_lines (
               "invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross",
               "accountId","accountCode","costCenterId","activityType",
               "projectId","vehicleId","propertyId","unitId","assetId",
               "employeeId","driverId","contractId","umrahSeasonId","umrahAgentId",
               "productId","taxCode","taxInclusive","allocationRuleId","allocationStatus",
               "dimensionJson","manualOverrideReason"
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
             RETURNING id`,
            [
              invoiceId, p.description, p.quantity, p.unitPrice, p.net, p.vat, p.gross,
              null, p.accountCode, p.costCenterId, null,
              null, p.vehicleId, null, null, null,
              null, p.driverId, null, null, null,
              null, p.taxCode, false, null, "resolved",
              null, null,
            ],
          );
          const invoiceLineId = lineRes.rows[0]!.id;

          await tx.query(
            `UPDATE transport_service_lines
                SET "billingStatus" = 'invoiced', "invoiceId" = $1,
                    "invoiceLineId" = $2, "updatedAt" = NOW()
              WHERE id = $3 AND "companyId" = $4`,
            [invoiceId, invoiceLineId, p.id, scope.companyId],
          );
          await tx.query(
            `INSERT INTO transport_invoice_links
               ("companyId","serviceLineId","invoiceId","invoiceLineId","appliedUnitPrice","linkedBy")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [scope.companyId, p.id, invoiceId, invoiceLineId, p.unitPrice, scope.userId],
          );
        }

        return {
          invoiceId, ref: issued.number,
          total: grandTotal, subtotal, vatTotal, lineCount: lines.length,
        };
      });

      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "finance.transport_billing.batch.ready",
        entity: "invoices", entityId: result.invoiceId,
        details: JSON.stringify({
          invoiceId: result.invoiceId,
          ref: result.ref,
          customerId: b.customerId,
          serviceLineIds: b.serviceLineIds,
          total: result.total,
          lineCount: result.lineCount,
          notes: b.notes,
        }),
      }).catch((e) => logger.error(e, "invoice batch event failed"));

      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "invoices", entityId: result.invoiceId,
        after: { ref: result.ref, customerId: b.customerId, lineCount: result.lineCount, total: result.total },
      }).catch((e) => logger.error(e, "invoice batch audit failed"));

      res.status(201).json({
        ok: true, invoiceId: result.invoiceId, ref: result.ref,
        lineCount: result.lineCount, subtotal: result.subtotal,
        vatAmount: result.vatTotal, total: result.total,
      });
    } catch (err) {
      handleRouteError(err, res, "Build invoice batch error:");
    }
  },
);

export default transportPricingRouter;
