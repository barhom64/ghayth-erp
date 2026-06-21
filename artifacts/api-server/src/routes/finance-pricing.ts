// ─── Finance · Pricing Rules — قواعد التسعير ─────────────────────────────
// Real implementation of the 6 pricing endpoints the SPA calls (previously
// served as no-op stubs in wiring-stubs.ts). Binds the page's nested rule
// contract (header + conditions[] + action{}) to the normalized migration-171
// tables (pricing_rules / pricing_conditions / pricing_actions) and exposes a
// preview that runs the revived pricing engine.
//
// Boundary: finance is the LEAD path here; pricing is a finance-owned servant
// utility. Every write is tenant-scoped, soft-deletes, carries an audit log +
// domain event, and never touches the ledger. The /resolve preview is a
// what-if calculator — it records into pricing_rule_applications (the 171
// audit trail) but posts nothing.
import { Router } from "express";
import { rawQuery, rawExecute, assertInsert, withTransaction } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { pushToDLQ } from "../lib/eventBus.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";
import {
  resolvePrice,
  recordApplication,
  type ActionType,
} from "../lib/engines/pricingEngine.js";

// ── Zod contract (mirrors RuleDetail in pricing-rules-create.tsx) ───────────
const FIELD_ENUM = z.enum([
  "clientId", "clientSegment", "productId", "productCategory", "quantity", "date",
]);
const OPERATOR_ENUM = z.enum([
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "between",
]);
const ACTION_ENUM = z.enum([
  "fixed_price", "percent_discount", "amount_discount", "formula",
]);

const conditionSchema = z.object({
  field: FIELD_ENUM,
  operator: OPERATOR_ENUM,
  // The page sends the already-parsed value (number | string | array). Stored
  // JSON-encoded in pricing_conditions.value (TEXT) per the migration-171 DSL.
  value: z.unknown(),
});

const actionSchema = z.object({
  actionType: ACTION_ENUM,
  value: z.coerce.number().optional().default(0),
  formula: z.string().nullable().optional(),
});

const ruleBodySchema = z.object({
  name: z.string().min(1, "اسم القاعدة مطلوب"),
  description: z.string().nullable().optional(),
  priority: z.coerce.number().int().optional().default(0),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
  logicOp: z.enum(["AND", "OR"]).optional().default("AND"),
  conditions: z.array(conditionSchema).optional().default([]),
  action: actionSchema.nullable().optional(),
});

const resolveSchema = z.object({
  productId: z.coerce.number().int().positive("معرف المنتج مطلوب"),
  quantity: z.coerce.number().optional().default(1),
  clientId: z.coerce.number().int().optional(),
  clientSegment: z.string().optional(),
});

interface RuleHeaderRow {
  id: number;
  name: string;
  description: string | null;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  logicOp: "AND" | "OR";
  createdAt: string;
}
interface ConditionDbRow {
  field: string;
  operator: string;
  value: string;
}
interface ActionDbRow {
  actionType: ActionType;
  value: string;
  formula: string | null;
}

// JSON-decode a stored condition value, falling back to the raw string when it
// isn't valid JSON (legacy/plain scalars).
function decodeValue(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

// Derive the flat "discount %" the list page renders from a rule's action.
// Only percent_discount maps cleanly to a percentage badge; everything else
// shows "—".
function discountForList(action: ActionDbRow | undefined): number | null {
  if (!action) return null;
  if (action.actionType === "percent_discount") return Number(action.value);
  return null;
}

export const pricingRouter = Router();
pricingRouter.use(authMiddleware);

// ── GET /finance/pricing/rules — list ──────────────────────────────────────
// Returns { data, total }. Each row is flattened to the list contract:
// active(bool) = status==='active', discount(number) = percent action value.
pricingRouter.get(
  "/pricing/rules",
  authorize({ feature: "finance.invoices", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<RuleHeaderRow & { actionType: ActionType | null; actionValue: string | null }>(
        `SELECT r.id, r.name, r.description, r.priority,
                r."validFrom", r."validTo", r.status, r."logicOp", r."createdAt",
                a."actionType" AS "actionType", a.value AS "actionValue"
           FROM pricing_rules r
           LEFT JOIN pricing_actions a ON a."ruleId" = r.id
          WHERE r."companyId" = $1 AND r."deletedAt" IS NULL
          ORDER BY r.priority DESC, r.id DESC
          LIMIT 500`,
        [scope.companyId]
      );
      const data = rows.map((r) => ({
        id: r.id,
        name: r.name,
        active: r.status === "active",
        priority: r.priority,
        discount: r.actionType === "percent_discount" ? Number(r.actionValue) : null,
      }));
      res.json({ data, total: data.length });
    } catch (e) {
      handleRouteError(e, res, "[pricing] list failed");
    }
  }
);

// ── GET /finance/pricing/rules/:id — detail (nested) ────────────────────────
// Returns { data: RuleDetail } — the editor page reads `existing.data`.
pricingRouter.get(
  "/pricing/rules/:id",
  authorize({ feature: "finance.invoices", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [header] = await rawQuery<RuleHeaderRow>(
        `SELECT id, name, description, priority, "validFrom", "validTo",
                status, "logicOp", "createdAt"
           FROM pricing_rules
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );
      if (!header) throw new NotFoundError("قاعدة التسعير غير موجودة");

      const conditions = await rawQuery<ConditionDbRow>(
        `SELECT field, operator, value FROM pricing_conditions WHERE "ruleId" = $1 ORDER BY id ASC`,
        [id]
      );
      const [action] = await rawQuery<ActionDbRow>(
        `SELECT "actionType", value, formula FROM pricing_actions WHERE "ruleId" = $1`,
        [id]
      );

      res.json({
        data: {
          id: header.id,
          name: header.name,
          description: header.description,
          priority: header.priority,
          validFrom: header.validFrom,
          validTo: header.validTo,
          status: header.status,
          logicOp: header.logicOp,
          conditions: conditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: decodeValue(c.value),
          })),
          action: action
            ? {
                actionType: action.actionType,
                value: Number(action.value),
                formula: action.formula,
              }
            : null,
        },
      });
    } catch (err) {
      handleRouteError(err, res, "Get pricing rule error:");
    }
  }
);

// Insert the condition + action child rows for a rule (shared by create/update).
async function writeChildren(
  ruleId: number,
  conditions: { field: string; operator: string; value?: unknown }[],
  action: { actionType: ActionType; value?: number; formula?: string | null } | null | undefined
): Promise<void> {
  for (const c of conditions) {
    await rawExecute(
      `INSERT INTO pricing_conditions ("ruleId", field, operator, value)
       VALUES ($1, $2, $3, $4)`,
      [ruleId, c.field, c.operator, JSON.stringify(c.value ?? null)]
    );
  }
  if (action) {
    await rawExecute(
      `INSERT INTO pricing_actions ("ruleId", "actionType", value, formula)
       VALUES ($1, $2, $3, $4)`,
      [ruleId, action.actionType, action.value ?? 0, action.formula ?? null]
    );
  }
}

// ── POST /finance/pricing/rules — create ────────────────────────────────────
pricingRouter.post(
  "/pricing/rules",
  authorize({ feature: "finance.invoices", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(ruleBodySchema.safeParse(req.body ?? {}));

      const insertId = await withTransaction(async () => {
        const { insertId } = await rawExecute(
          `INSERT INTO pricing_rules
             ("companyId", "branchId", name, description, priority,
              "validFrom", "validTo", status, "logicOp", "createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            scope.companyId,
            scope.branchId ?? null,
            body.name,
            body.description ?? null,
            body.priority,
            body.validFrom || null,
            body.validTo || null,
            body.status,
            body.logicOp,
            scope.userId ?? null,
          ]
        );
        assertInsert(insertId, "pricing_rules");
        await writeChildren(insertId, body.conditions, body.action);
        return insertId;
      });

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "pricing.rule.created",
        entity: "pricing_rules",
        entityId: insertId,
        details: JSON.stringify({ name: body.name }),
      }).catch((err) => pushToDLQ("event", { action: "pricing.rule.created", entityId: insertId }, err, scope.companyId));

      auditFromRequest(req, "create", "pricing_rules", insertId, {
        after: { name: body.name, status: body.status, conditions: body.conditions.length },
      }).catch((err) => logger.error(err, "[audit] pricing.rule.created:"));

      res.status(201).json({ id: insertId });
    } catch (err) {
      handleRouteError(err, res, "Create pricing rule error:");
    }
  }
);

// ── PUT /finance/pricing/rules/:id — update (replace children) ──────────────
pricingRouter.put(
  "/pricing/rules/:id",
  authorize({ feature: "finance.invoices", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(ruleBodySchema.safeParse(req.body ?? {}));

      await withTransaction(async () => {
        const [row] = await rawQuery<{ id: number }>(
          `UPDATE pricing_rules
              SET name = $3, description = $4, priority = $5,
                  "validFrom" = $6, "validTo" = $7, status = $8, "logicOp" = $9,
                  "updatedAt" = NOW()
            WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
            RETURNING id`,
          [
            id,
            scope.companyId,
            body.name,
            body.description ?? null,
            body.priority,
            body.validFrom || null,
            body.validTo || null,
            body.status,
            body.logicOp,
          ]
        );
        if (!row) throw new NotFoundError("قاعدة التسعير غير موجودة");
        // Replace the full DSL: clear old conditions/action, write the new set.
        await rawExecute(`DELETE FROM pricing_conditions WHERE "ruleId" = $1`, [id]);
        await rawExecute(`DELETE FROM pricing_actions WHERE "ruleId" = $1`, [id]);
        await writeChildren(id, body.conditions, body.action);
      });

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "pricing.rule.updated",
        entity: "pricing_rules",
        entityId: id,
        details: JSON.stringify({ name: body.name }),
      }).catch((err) => pushToDLQ("event", { action: "pricing.rule.updated", entityId: id }, err, scope.companyId));

      auditFromRequest(req, "update", "pricing_rules", id, {
        after: { name: body.name, status: body.status, conditions: body.conditions.length },
      }).catch((err) => logger.error(err, "[audit] pricing.rule.updated:"));

      res.json({ id });
    } catch (err) {
      handleRouteError(err, res, "Update pricing rule error:");
    }
  }
);

// ── DELETE /finance/pricing/rules/:id — soft-delete ─────────────────────────
pricingRouter.delete(
  "/pricing/rules/:id",
  authorize({ feature: "finance.invoices", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [existing] = await rawQuery<{ id: number; name: string }>(
        `SELECT id, name FROM pricing_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      );
      if (!existing) throw new NotFoundError("قاعدة التسعير غير موجودة");

      const [row] = await rawQuery<{ id: number }>(
        `UPDATE pricing_rules SET "deletedAt" = NOW(), "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          RETURNING id`,
        [id, scope.companyId]
      );
      if (!row) throw new NotFoundError("قاعدة التسعير غير موجودة");

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "pricing.rule.deleted",
        entity: "pricing_rules",
        entityId: id,
        details: JSON.stringify({ name: existing.name }),
      }).catch((err) => pushToDLQ("event", { action: "pricing.rule.deleted", entityId: id }, err, scope.companyId));

      auditFromRequest(req, "delete", "pricing_rules", id, {
        after: { name: existing.name, softDelete: true },
      }).catch((err) => logger.error(err, "[audit] pricing.rule.deleted:"));

      res.json({ success: true });
    } catch (err) {
      handleRouteError(err, res, "Delete pricing rule error:");
    }
  }
);

// ── POST /finance/pricing/resolve — preview (what-if) ───────────────────────
// The page sends { productId, quantity }. We resolve the product's catalog
// price + category, run the engine, and return the shape the page reads:
// { basePrice, discount, finalPrice, appliedRules[] }. The preview is recorded
// in pricing_rule_applications (entityType='preview') as the 171 audit trail —
// it never posts to the ledger.
pricingRouter.post(
  "/pricing/resolve",
  authorize({ feature: "finance.invoices", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(resolveSchema.safeParse(req.body ?? {}));

      const [product] = await rawQuery<{ unitPrice: string | null; category: string | null }>(
        `SELECT "unitPrice", category FROM products
          WHERE id = $1 AND "companyId" = $2`,
        [body.productId, scope.companyId]
      );
      if (!product) throw new NotFoundError("المنتج غير موجود");
      const basePrice = Number(product.unitPrice ?? 0);

      const resolved = await resolvePrice({
        companyId: scope.companyId,
        productId: body.productId,
        productCategory: product.category ?? null,
        clientId: body.clientId ?? null,
        clientSegment: body.clientSegment ?? null,
        quantity: body.quantity,
        basePrice,
      });

      // 171 audit trail — record what the preview resolved (no ledger impact).
      await recordApplication({
        companyId: scope.companyId,
        ruleId: resolved.ruleId,
        ruleName: resolved.ruleName,
        entityType: "preview",
        productId: body.productId,
        productCategory: product.category ?? null,
        clientId: body.clientId ?? null,
        quantity: body.quantity,
        basePrice: resolved.basePrice,
        resolvedPrice: resolved.price,
        discountAmount: resolved.discountAmount,
        appliedBy: scope.userId ?? null,
      });

      res.json({
        basePrice: resolved.basePrice,
        finalPrice: resolved.price,
        discount: resolved.discountAmount,
        appliedRules: resolved.ruleId
          ? [{ id: resolved.ruleId, name: resolved.ruleName, action: resolved.appliedAction }]
          : [],
        evaluatedRules: resolved.evaluatedRules,
      });
    } catch (err) {
      handleRouteError(err, res, "Resolve pricing error:");
    }
  }
);

export default pricingRouter;
