/**
 * Fleet rules admin (#1733 — final follow-up).
 *
 *   GET    /fleet/expense-rules            — list classification rules
 *   POST   /fleet/expense-rules            — create
 *   PATCH  /fleet/expense-rules/:id        — update (incl. isActive toggle)
 *   DELETE /fleet/expense-rules/:id        — soft delete (deletedAt = NOW())
 *
 *   GET    /transport/intake-rules         — list intake rules
 *   POST   /transport/intake-rules         — create
 *   PATCH  /transport/intake-rules/:id     — update (incl. isActive toggle)
 *   DELETE /transport/intake-rules/:id     — soft delete
 *
 * Both engines were created in migration 269 (#1796) but had no CRUD
 * surface so rules could only be inserted via SQL. This router closes
 * that loop with an admin API + an SPA on the frontend.
 *
 * Gating:
 *   - expense-rules → fleet.expenses (manager-side; operators see the
 *     resolved defaults on the fuel/maintenance/violation forms but
 *     don't author the rules).
 *   - intake-rules  → fleet.bookings (operators who already see bookings
 *     can author intake rules — these only constrain UI defaults).
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError, NotFoundError, parseId, zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";

export const fleetRulesAdminRouter = Router();
fleetRulesAdminRouter.use(authMiddleware);

// ──────────────────────── fleet_expense_rules ────────────────────────

const EXPENSE_SOURCES = ["fuel_log", "maintenance", "traffic_violation"] as const;
const ACCOUNTING_TREATMENTS = [
  "direct_expense", "capitalized_asset_improvement", "deferred_expense",
] as const;
const LIABILITY_PARTIES = [
  "company", "driver", "customer", "third_party", "insurance", "unknown",
] as const;

const createExpenseRuleSchema = z.object({
  ruleName: z.string().min(1).max(255),
  expenseSource: z.enum(EXPENSE_SOURCES),
  vehicleId: z.coerce.number().int().positive().optional(),
  vehicleType: z.string().max(64).optional(),
  stationName: z.string().max(255).optional(),
  maintenanceType: z.string().max(64).optional(),
  violationType: z.string().max(64).optional(),
  defaultAccountingTreatment: z.enum(ACCOUNTING_TREATMENTS).optional(),
  defaultRechargeable: z.boolean().optional(),
  defaultLiabilityParty: z.enum(LIABILITY_PARTIES).optional(),
  defaultCostCenterId: z.coerce.number().int().positive().optional(),
  requiresApproval: z.boolean().optional(),
  priority: z.coerce.number().int().optional(),
  notes: z.string().max(1000).optional(),
});

const updateExpenseRuleSchema = createExpenseRuleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

fleetRulesAdminRouter.get(
  "/fleet/expense-rules",
  authorize({ feature: "fleet.expenses", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { source } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
      if (source) { params.push(source); where += ` AND "expenseSource" = $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM fleet_expense_rules
          WHERE ${where}
          ORDER BY "isActive" DESC, priority DESC, "createdAt" DESC LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List expense rules error:");
    }
  },
);

fleetRulesAdminRouter.post(
  "/fleet/expense-rules",
  authorize({ feature: "fleet.expenses", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createExpenseRuleSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO fleet_expense_rules
           ("companyId", "branchId", "ruleName", "expenseSource",
            "vehicleId", "vehicleType", "stationName",
            "maintenanceType", "violationType",
            "defaultAccountingTreatment", "defaultRechargeable",
            "defaultLiabilityParty", "defaultCostCenterId",
            "requiresApproval", priority, notes, "createdBy")
         VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9, $10,$11, $12,$13, $14,$15,$16,$17)`,
        [
          scope.companyId, scope.branchId ?? null, b.ruleName, b.expenseSource,
          b.vehicleId ?? null, b.vehicleType ?? null, b.stationName ?? null,
          b.maintenanceType ?? null, b.violationType ?? null,
          b.defaultAccountingTreatment ?? null, b.defaultRechargeable ?? false,
          b.defaultLiabilityParty ?? null, b.defaultCostCenterId ?? null,
          b.requiresApproval ?? false, b.priority ?? 0, b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "fleet_expense_rules");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "fleet_expense_rules", entityId: insertId,
        after: { ...b },
      }).catch((e) => logger.error(e, "expense rule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "fleet.expense_rule.created", entity: "fleet_expense_rules", entityId: insertId,
        details: JSON.stringify({ ruleName: b.ruleName, expenseSource: b.expenseSource }),
      }).catch((e) => logger.error(e, "expense rule event failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create expense rule error:");
    }
  },
);

fleetRulesAdminRouter.patch(
  "/fleet/expense-rules/:id",
  authorize({ feature: "fleet.expenses", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateExpenseRuleSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        ruleName: '"ruleName"', expenseSource: '"expenseSource"',
        vehicleId: '"vehicleId"', vehicleType: '"vehicleType"',
        stationName: '"stationName"', maintenanceType: '"maintenanceType"',
        violationType: '"violationType"',
        defaultAccountingTreatment: '"defaultAccountingTreatment"',
        defaultRechargeable: '"defaultRechargeable"',
        defaultLiabilityParty: '"defaultLiabilityParty"',
        defaultCostCenterId: '"defaultCostCenterId"',
        requiresApproval: '"requiresApproval"',
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
        `UPDATE fleet_expense_rules SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("القاعدة غير موجودة");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "fleet_expense_rules", entityId: id,
        after: { ...b },
      }).catch((e) => logger.error(e, "expense rule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "fleet.expense_rule.updated", entity: "fleet_expense_rules", entityId: id,
        details: JSON.stringify({ fields: Object.keys(b) }),
      }).catch((e) => logger.error(e, "expense rule event failed"));
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update expense rule error:");
    }
  },
);

fleetRulesAdminRouter.delete(
  "/fleet/expense-rules/:id",
  authorize({ feature: "fleet.expenses", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE fleet_expense_rules
            SET "deletedAt" = NOW(), "isActive" = FALSE, "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("القاعدة غير موجودة");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "delete", entity: "fleet_expense_rules", entityId: id,
      }).catch((e) => logger.error(e, "expense rule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "fleet.expense_rule.deleted", entity: "fleet_expense_rules", entityId: id,
      }).catch((e) => logger.error(e, "expense rule event failed"));
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Delete expense rule error:");
    }
  },
);

// ─────────────────────── transport_intake_rules ──────────────────────

const OPERATION_TYPES = ["booking", "dispatch", "service_line"] as const;
import { TRANSPORT_SERVICE_TYPES } from "../lib/transportEnums.js";

const createIntakeRuleSchema = z.object({
  ruleName: z.string().min(1).max(255),
  operationType: z.enum(OPERATION_TYPES),
  transportServiceType: z.enum(TRANSPORT_SERVICE_TYPES),
  customerId: z.coerce.number().int().positive().optional(),
  bookingSource: z.string().max(64).optional(),
  requiredVehicleType: z.string().max(64).optional(),
  requiredLicenseClass: z.string().max(32).optional(),
  defaultCostCenterId: z.coerce.number().int().positive().optional(),
  requiresAttachment: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  createsBookingDraft: z.boolean().optional(),
  createsBillingCandidate: z.boolean().optional(),
  priority: z.coerce.number().int().optional(),
  notes: z.string().max(1000).optional(),
});

const updateIntakeRuleSchema = createIntakeRuleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

fleetRulesAdminRouter.get(
  "/transport/intake-rules",
  authorize({ feature: "fleet.bookings", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { operationType, serviceType } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
      if (operationType) { params.push(operationType); where += ` AND "operationType" = $${params.length}`; }
      if (serviceType) { params.push(serviceType); where += ` AND "transportServiceType" = $${params.length}`; }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM transport_intake_rules
          WHERE ${where}
          ORDER BY "isActive" DESC, priority DESC, "createdAt" DESC LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) {
      handleRouteError(err, res, "List intake rules error:");
    }
  },
);

fleetRulesAdminRouter.post(
  "/transport/intake-rules",
  authorize({ feature: "fleet.bookings", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createIntakeRuleSchema.safeParse(req.body));
      const { insertId } = await rawExecute(
        `INSERT INTO transport_intake_rules
           ("companyId", "branchId", "ruleName",
            "operationType", "transportServiceType",
            "customerId", "bookingSource",
            "requiredVehicleType", "requiredLicenseClass", "defaultCostCenterId",
            "requiresAttachment", "requiresApproval",
            "createsBookingDraft", "createsBillingCandidate",
            priority, notes, "createdBy")
         VALUES ($1,$2,$3, $4,$5, $6,$7, $8,$9,$10, $11,$12, $13,$14, $15,$16,$17)`,
        [
          scope.companyId, scope.branchId ?? null, b.ruleName,
          b.operationType, b.transportServiceType,
          b.customerId ?? null, b.bookingSource ?? null,
          b.requiredVehicleType ?? null, b.requiredLicenseClass ?? null, b.defaultCostCenterId ?? null,
          b.requiresAttachment ?? false, b.requiresApproval ?? false,
          b.createsBookingDraft ?? false, b.createsBillingCandidate ?? false,
          b.priority ?? 0, b.notes ?? null, scope.userId,
        ],
      );
      assertInsert(insertId, "transport_intake_rules");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "create", entity: "transport_intake_rules", entityId: insertId,
        after: { ...b },
      }).catch((e) => logger.error(e, "intake rule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "transport.intake_rule.created", entity: "transport_intake_rules", entityId: insertId,
        details: JSON.stringify({ ruleName: b.ruleName, operationType: b.operationType }),
      }).catch((e) => logger.error(e, "intake rule event failed"));
      res.status(201).json({ data: { id: insertId } });
    } catch (err) {
      handleRouteError(err, res, "Create intake rule error:");
    }
  },
);

fleetRulesAdminRouter.patch(
  "/transport/intake-rules/:id",
  authorize({ feature: "fleet.bookings", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updateIntakeRuleSchema.safeParse(req.body));
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      const colMap: Record<string, string> = {
        ruleName: '"ruleName"', operationType: '"operationType"',
        transportServiceType: '"transportServiceType"',
        customerId: '"customerId"', bookingSource: '"bookingSource"',
        requiredVehicleType: '"requiredVehicleType"',
        requiredLicenseClass: '"requiredLicenseClass"',
        defaultCostCenterId: '"defaultCostCenterId"',
        requiresAttachment: '"requiresAttachment"',
        requiresApproval: '"requiresApproval"',
        createsBookingDraft: '"createsBookingDraft"',
        createsBillingCandidate: '"createsBillingCandidate"',
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
        `UPDATE transport_intake_rules SET ${sets.join(", ")}
          WHERE id = $${p++} AND "companyId" = $${p++} AND "deletedAt" IS NULL`,
        params,
      );
      if (affectedRows === 0) throw new NotFoundError("القاعدة غير موجودة");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "update", entity: "transport_intake_rules", entityId: id,
        after: { ...b },
      }).catch((e) => logger.error(e, "intake rule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "transport.intake_rule.updated", entity: "transport_intake_rules", entityId: id,
        details: JSON.stringify({ fields: Object.keys(b) }),
      }).catch((e) => logger.error(e, "intake rule event failed"));
      res.json({ data: { id } });
    } catch (err) {
      handleRouteError(err, res, "Update intake rule error:");
    }
  },
);

fleetRulesAdminRouter.delete(
  "/transport/intake-rules/:id",
  authorize({ feature: "fleet.bookings", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { affectedRows } = await rawExecute(
        `UPDATE transport_intake_rules
            SET "deletedAt" = NOW(), "isActive" = FALSE, "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (affectedRows === 0) throw new NotFoundError("القاعدة غير موجودة");
      createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "delete", entity: "transport_intake_rules", entityId: id,
      }).catch((e) => logger.error(e, "intake rule audit failed"));
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
        action: "transport.intake_rule.deleted", entity: "transport_intake_rules", entityId: id,
      }).catch((e) => logger.error(e, "intake rule event failed"));
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Delete intake rule error:");
    }
  },
);

export default fleetRulesAdminRouter;
